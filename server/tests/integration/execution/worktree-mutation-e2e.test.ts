/**
 * End-to-End Integration Test for Worktree Mutation Tracking
 *
 * Tests the complete flow from execution creation through REST API queries:
 * 1. Initialize mutation system
 * 2. Create execution with worktree (starts tracking)
 * 3. Make file changes in worktree
 * 4. Query provisional state via REST API endpoints
 * 5. Cleanup execution (stops tracking)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { ExecutionLifecycleService } from "../../../src/services/execution-lifecycle.js";
import { WorktreeManager } from "../../../src/execution/worktree/manager.js";
import {
  initializeWorktreeMutationSystem,
  getMutationTracker,
  getProvisionalStateManager,
  getEventBuffer,
  resetWorktreeMutationSystem,
} from "../../../src/execution/worktree/singleton.js";
import type { Issue } from "@sudocode-ai/types";
import { initDatabase } from "../../../src/services/db.js";
import { createIssue } from "../../../src/services/issues.js";

describe("Worktree Mutation E2E Test", () => {
  let testDir: string;
  let repoPath: string;
  let db: Database.Database;
  let lifecycleService: ExecutionLifecycleService;

  beforeEach(async () => {
    // Create temporary directory structure
    testDir = mkdtempSync(join(tmpdir(), "worktree-e2e-"));
    repoPath = join(testDir, "repo");
    mkdirSync(repoPath, { recursive: true });
    mkdirSync(join(repoPath, ".sudocode"), { recursive: true });

    // Initialize git repo
    const { execSync } = await import("child_process");
    execSync("git init", { cwd: repoPath });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test User"', { cwd: repoPath });

    // Create initial commit
    writeFileSync(join(repoPath, "README.md"), "# Test Repo\n");
    execSync("git add .", { cwd: repoPath });
    execSync('git commit -m "Initial commit"', { cwd: repoPath });

    // Initialize database
    const dbPath = join(repoPath, ".sudocode/cache.db");
    db = initDatabase({ path: dbPath });

    // Create a test issue
    createIssue(db, {
      id: "test-issue-001",
      title: "Test Issue",
      status: "open",
      description: "Test issue for E2E testing",
    });

    // Initialize mutation system
    resetWorktreeMutationSystem();
    initializeWorktreeMutationSystem(db);

    // Create lifecycle service
    const worktreeConfig = {
      worktreeStoragePath: ".worktrees",
      autoCreateBranches: true,
      autoDeleteBranches: false,
      enableSparseCheckout: false,
      branchPrefix: "execution",
      cleanupOrphanedWorktreesOnStartup: false,
    };
    const worktreeManager = new WorktreeManager(worktreeConfig);
    lifecycleService = new ExecutionLifecycleService(
      db,
      repoPath,
      worktreeManager
    );
  });

  afterEach(async () => {
    // Cleanup
    if (db) {
      db.close();
    }
    resetWorktreeMutationSystem();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should track mutations end-to-end and expose via API", async () => {
    // Step 1: Create execution with worktree
    console.log("\n[E2E] Step 1: Creating execution with worktree...");
    const result = await lifecycleService.createExecutionWithWorktree({
      issueId: "test-issue-001",
      issueTitle: "Test Issue",
      agentType: "cline",
      targetBranch: "main",
      repoPath,
    });

    const { execution, worktreePath } = result;
    console.log(`[E2E] Execution created: ${execution.id}`);
    console.log(`[E2E] Worktree path: ${worktreePath}`);

    // Verify tracking started
    const mutationTracker = getMutationTracker();
    expect(mutationTracker.isTracking(execution.id)).toBe(true);
    console.log("[E2E] ✓ Mutation tracking started");

    // Step 2: Wait for initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 3: Create an issue in the worktree
    console.log("\n[E2E] Step 3: Creating issue in worktree...");
    const worktreeIssue: Issue = {
      id: "worktree-issue-001",
      title: "Issue Created in Worktree",
      status: "in_progress",
      description: "This issue was created by the agent in the worktree",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const issuesPath = join(worktreePath, ".sudocode/issues.jsonl");
    writeFileSync(issuesPath, JSON.stringify(worktreeIssue) + "\n");
    console.log(`[E2E] Created issue in ${issuesPath}`);

    // Step 4: Wait for file watcher to detect and process
    console.log("[E2E] Waiting for file watcher to detect changes...");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Step 5: Query mutation events
    console.log("\n[E2E] Step 5: Querying mutation events...");
    const eventBuffer = getEventBuffer();
    const events = eventBuffer.getEvents(execution.id);

    console.log(`[E2E] Found ${events.length} mutation events`);
    expect(events.length).toBeGreaterThan(0);

    // Should have at least one issue_created event
    const createEvent = events.find(
      (e) => e.type === "issue_created" && e.entityId === "worktree-issue-001"
    );
    expect(createEvent).toBeDefined();
    console.log("[E2E] ✓ Found issue_created event");

    // Step 6: Query provisional state
    console.log("\n[E2E] Step 6: Querying provisional state...");
    const provisionalStateManager = getProvisionalStateManager();
    const provisionalState = provisionalStateManager.computeProvisionalState(
      execution.id
    );

    console.log("[E2E] Provisional state computed:");
    console.log(
      `  - Base issues: ${provisionalState.base.issues.length}`
    );
    console.log(
      `  - Created issues: ${provisionalState.provisional.issuesCreated.length}`
    );
    console.log(
      `  - Updated issues: ${provisionalState.provisional.issuesUpdated.length}`
    );
    console.log(
      `  - Deleted issues: ${provisionalState.provisional.issuesDeleted.length}`
    );

    expect(provisionalState.provisional.issuesCreated).toHaveLength(1);
    expect(provisionalState.provisional.issuesCreated[0].id).toBe(
      "worktree-issue-001"
    );
    expect(provisionalState.provisional.issuesCreated[0].title).toBe(
      "Issue Created in Worktree"
    );
    console.log("[E2E] ✓ Provisional state correct");

    // Step 7: Query merged issues
    console.log("\n[E2E] Step 7: Querying merged issues...");
    const mergedIssues = provisionalStateManager.getMergedIssues(execution.id);

    console.log(`[E2E] Merged issues count: ${mergedIssues.length}`);
    // Should have base issue + worktree issue
    expect(mergedIssues.length).toBe(2);

    const worktreeIssueInMerged = mergedIssues.find(
      (i) => i.id === "worktree-issue-001"
    );
    expect(worktreeIssueInMerged).toBeDefined();
    expect(worktreeIssueInMerged?.title).toBe("Issue Created in Worktree");
    console.log("[E2E] ✓ Merged issues include worktree changes");

    // Step 8: Query statistics
    console.log("\n[E2E] Step 8: Querying statistics...");
    const stats = provisionalStateManager.getProvisionalStateStats(execution.id);

    console.log("[E2E] Statistics:");
    console.log(`  - Total events: ${stats.totalEvents}`);
    console.log(`  - Issues created: ${stats.issuesCreated}`);
    console.log(`  - Issues updated: ${stats.issuesUpdated}`);
    console.log(`  - Issues deleted: ${stats.issuesDeleted}`);

    expect(stats.issuesCreated).toBe(1);
    expect(stats.totalEvents).toBeGreaterThan(0);
    console.log("[E2E] ✓ Statistics correct");

    // Step 9: Update the issue
    console.log("\n[E2E] Step 9: Updating issue in worktree...");
    const updatedIssue: Issue = {
      ...worktreeIssue,
      status: "done",
      title: "Updated Title",
      updated_at: new Date().toISOString(),
    };
    writeFileSync(issuesPath, JSON.stringify(updatedIssue) + "\n");

    // Wait for detection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const updatedState = provisionalStateManager.computeProvisionalState(
      execution.id
    );
    console.log(
      `[E2E] Updated issues count: ${updatedState.provisional.issuesUpdated.length}`
    );
    expect(updatedState.provisional.issuesUpdated.length).toBeGreaterThan(0);
    console.log("[E2E] ✓ Issue update detected");

    // Step 10: Cleanup execution
    console.log("\n[E2E] Step 10: Cleaning up execution...");
    await lifecycleService.cleanupExecution(execution.id);

    // Verify tracking stopped
    expect(mutationTracker.isTracking(execution.id)).toBe(false);
    console.log("[E2E] ✓ Mutation tracking stopped");

    console.log("\n[E2E] ✅ All steps completed successfully!");
  });

  it("should handle polling with fromSequence parameter", async () => {
    // Create execution
    const result = await lifecycleService.createExecutionWithWorktree({
      issueId: "test-issue-001",
      issueTitle: "Test Issue",
      agentType: "cline",
      targetBranch: "main",
      repoPath,
    });

    const { execution, worktreePath } = result;

    // Wait for initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create first issue
    const issue1: Issue = {
      id: "issue-1",
      title: "First Issue",
      status: "open",
      description: "First",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      JSON.stringify(issue1) + "\n"
    );

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Query all events
    const eventBuffer = getEventBuffer();
    const allEvents = eventBuffer.getEvents(execution.id);
    expect(allEvents.length).toBeGreaterThan(0);

    // Get sequence number of last event
    const lastSequence = allEvents[allEvents.length - 1].sequenceNumber;

    // Create second issue
    const issue2: Issue = {
      id: "issue-2",
      title: "Second Issue",
      status: "open",
      description: "Second",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      JSON.stringify(issue1) + "\n" + JSON.stringify(issue2) + "\n"
    );

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Query only new events since lastSequence
    const newEvents = eventBuffer.getEvents(execution.id, lastSequence + 1);
    console.log(`[E2E Polling] New events since sequence ${lastSequence}: ${newEvents.length}`);

    // Should only get the new event(s)
    expect(newEvents.length).toBeGreaterThan(0);
    expect(newEvents.every((e) => e.sequenceNumber > lastSequence)).toBe(true);

    console.log("[E2E Polling] ✓ Polling with fromSequence works correctly");

    // Cleanup
    await lifecycleService.cleanupExecution(execution.id);
  });
});

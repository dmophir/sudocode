/**
 * End-to-End Integration Test for Mutation System (Simplified)
 *
 * Tests the mutation tracking system without requiring full git/worktree setup:
 * 1. Initialize mutation system
 * 2. Start tracking on a directory
 * 3. Make file changes
 * 4. Query provisional state
 * 5. Verify all components work together
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import {
  initializeWorktreeMutationSystem,
  getMutationTracker,
  getProvisionalStateManager,
  getEventBuffer,
  resetWorktreeMutationSystem,
} from "../../../src/execution/worktree/singleton.js";
import type { Issue, Spec } from "@sudocode-ai/types";
import { initDatabase } from "../../../src/services/db.js";
import { createIssue } from "../../../src/services/issues.js";
import { createSpec } from "../../../src/services/specs.js";

describe("Mutation System E2E Test (Simplified)", () => {
  let testDir: string;
  let worktreePath: string;
  let db: Database.Database;

  beforeEach(async () => {
    // Create temporary directory structure
    testDir = mkdtempSync(join(tmpdir(), "mutation-e2e-"));
    worktreePath = join(testDir, "worktree");
    mkdirSync(worktreePath, { recursive: true });
    mkdirSync(join(worktreePath, ".sudocode"), { recursive: true });

    // Create empty JSONL files
    writeFileSync(join(worktreePath, ".sudocode/issues.jsonl"), "");
    writeFileSync(join(worktreePath, ".sudocode/specs.jsonl"), "");

    // Initialize database
    const dbPath = join(testDir, "cache.db");
    db = initDatabase({ path: dbPath });

    // Create base issues and specs
    createIssue(db, {
      id: "base-issue-1",
      title: "Base Issue 1",
      status: "open",
      description: "Base issue in main repository",
    });

    createIssue(db, {
      id: "base-issue-2",
      title: "Base Issue 2",
      status: "in_progress",
      description: "Another base issue",
    });

    createSpec(db, {
      id: "base-spec-1",
      title: "Base Spec 1",
      status: "draft",
      description: "Base spec in main repository",
    });

    // Initialize mutation system
    resetWorktreeMutationSystem();
    initializeWorktreeMutationSystem(db);
  });

  afterEach(async () => {
    // Cleanup
    if (db) {
      db.close();
    }
    resetWorktreeMutationSystem();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should track mutations end-to-end through all components", async () => {
    const executionId = "test-exec-001";

    // Step 1: Start tracking
    console.log("\n[E2E] Step 1: Starting mutation tracking...");
    const mutationTracker = getMutationTracker();
    mutationTracker.startTracking(executionId, worktreePath);
    expect(mutationTracker.isTracking(executionId)).toBe(true);
    console.log("[E2E] ✓ Tracking started");

    // Wait for initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 2: Create an issue in the worktree
    console.log("\n[E2E] Step 2: Creating issue in worktree...");
    const worktreeIssue: Issue = {
      id: "worktree-issue-001",
      title: "Issue Created in Worktree",
      status: "in_progress",
      description: "This issue was created in the worktree",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const issuesPath = join(worktreePath, ".sudocode/issues.jsonl");
    writeFileSync(issuesPath, JSON.stringify(worktreeIssue) + "\n");
    console.log(`[E2E] Created issue in ${issuesPath}`);

    // Wait for file watcher to detect and process
    console.log("[E2E] Waiting for file watcher...");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Step 3: Verify mutation events
    console.log("\n[E2E] Step 3: Verifying mutation events...");
    const eventBuffer = getEventBuffer();
    const events = eventBuffer.getEvents(executionId);

    console.log(`[E2E] Found ${events.length} mutation events`);
    expect(events.length).toBeGreaterThan(0);

    const createEvent = events.find(
      (e) => e.type === "issue_created" && e.entityId === "worktree-issue-001"
    );
    expect(createEvent).toBeDefined();
    expect(createEvent?.newValue).toBeDefined();
    console.log("[E2E] ✓ Issue creation event found");

    // Step 4: Query provisional state
    console.log("\n[E2E] Step 4: Querying provisional state...");
    const provisionalStateManager = getProvisionalStateManager();
    const provisionalState = provisionalStateManager.computeProvisionalState(
      executionId
    );

    console.log("[E2E] Provisional state:");
    console.log(`  - Base issues: ${provisionalState.base.issues.length}`);
    console.log(`  - Base specs: ${provisionalState.base.specs.length}`);
    console.log(
      `  - Created issues: ${provisionalState.provisional.issuesCreated.length}`
    );
    console.log(
      `  - Updated issues: ${provisionalState.provisional.issuesUpdated.length}`
    );
    console.log(
      `  - Deleted issues: ${provisionalState.provisional.issuesDeleted.length}`
    );

    expect(provisionalState.base.issues.length).toBe(2); // 2 base issues
    expect(provisionalState.base.specs.length).toBe(1); // 1 base spec
    expect(provisionalState.provisional.issuesCreated).toHaveLength(1);
    expect(provisionalState.provisional.issuesCreated[0].id).toBe(
      "worktree-issue-001"
    );
    console.log("[E2E] ✓ Provisional state correct");

    // Step 5: Query merged issues
    console.log("\n[E2E] Step 5: Querying merged issues...");
    const mergedIssues = provisionalStateManager.getMergedIssues(executionId);

    console.log(`[E2E] Merged issues count: ${mergedIssues.length}`);
    // Should have 2 base issues + 1 worktree issue = 3 total
    expect(mergedIssues.length).toBe(3);

    const worktreeIssueInMerged = mergedIssues.find(
      (i) => i.id === "worktree-issue-001"
    );
    expect(worktreeIssueInMerged).toBeDefined();
    expect(worktreeIssueInMerged?.title).toBe("Issue Created in Worktree");
    console.log("[E2E] ✓ Merged issues include worktree changes");

    // Step 6: Test issue updates
    console.log("\n[E2E] Step 6: Updating issue in worktree...");
    const updatedIssue: Issue = {
      ...worktreeIssue,
      status: "done",
      title: "Updated Title in Worktree",
      updated_at: new Date().toISOString(),
    };
    writeFileSync(issuesPath, JSON.stringify(updatedIssue) + "\n");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const updatedState = provisionalStateManager.computeProvisionalState(
      executionId
    );
    console.log(
      `[E2E] Updated issues: ${updatedState.provisional.issuesUpdated.length}`
    );
    expect(updatedState.provisional.issuesUpdated.length).toBeGreaterThan(0);

    const updateInfo = updatedState.provisional.issuesUpdated[0];
    expect(updateInfo.updatedIssue.title).toBe("Updated Title in Worktree");
    expect(updateInfo.updatedIssue.status).toBe("done");
    console.log("[E2E] ✓ Issue update detected correctly");

    // Step 7: Test spec creation
    console.log("\n[E2E] Step 7: Creating spec in worktree...");
    const worktreeSpec: Spec = {
      id: "worktree-spec-001",
      title: "Spec Created in Worktree",
      status: "active",
      description: "This spec was created in the worktree",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const specsPath = join(worktreePath, ".sudocode/specs.jsonl");
    writeFileSync(specsPath, JSON.stringify(worktreeSpec) + "\n");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const withSpecs = provisionalStateManager.computeProvisionalState(
      executionId
    );
    console.log(
      `[E2E] Created specs: ${withSpecs.provisional.specsCreated.length}`
    );
    expect(withSpecs.provisional.specsCreated).toHaveLength(1);
    expect(withSpecs.provisional.specsCreated[0].id).toBe("worktree-spec-001");
    console.log("[E2E] ✓ Spec creation detected");

    // Step 8: Query statistics
    console.log("\n[E2E] Step 8: Querying statistics...");
    const stats = provisionalStateManager.getProvisionalStateStats(executionId);

    console.log("[E2E] Statistics:");
    console.log(`  - Total events: ${stats.totalEvents}`);
    console.log(`  - Issues created: ${stats.issuesCreated}`);
    console.log(`  - Issues updated: ${stats.issuesUpdated}`);
    console.log(`  - Specs created: ${stats.specsCreated}`);

    expect(stats.issuesCreated).toBe(1);
    expect(stats.issuesUpdated).toBeGreaterThan(0);
    expect(stats.specsCreated).toBe(1);
    expect(stats.totalEvents).toBeGreaterThan(0);
    console.log("[E2E] ✓ Statistics correct");

    // Step 9: Test polling (fromSequence)
    console.log("\n[E2E] Step 9: Testing polling with fromSequence...");
    const allEvents = eventBuffer.getEvents(executionId);
    const lastSequence = allEvents[allEvents.length - 1].sequenceNumber;

    // Create another issue
    const anotherIssue: Issue = {
      id: "worktree-issue-002",
      title: "Another Issue",
      status: "open",
      description: "For polling test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    writeFileSync(
      issuesPath,
      JSON.stringify(updatedIssue) +
        "\n" +
        JSON.stringify(anotherIssue) +
        "\n"
    );

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Query only new events
    const newEvents = eventBuffer.getEvents(executionId, lastSequence + 1);
    console.log(
      `[E2E] New events since sequence ${lastSequence}: ${newEvents.length}`
    );
    expect(newEvents.length).toBeGreaterThan(0);
    expect(newEvents.every((e) => e.sequenceNumber > lastSequence)).toBe(true);
    console.log("[E2E] ✓ Polling works correctly");

    // Step 10: Stop tracking
    console.log("\n[E2E] Step 10: Stopping tracking...");
    mutationTracker.stopTracking(executionId);
    expect(mutationTracker.isTracking(executionId)).toBe(false);
    console.log("[E2E] ✓ Tracking stopped");

    console.log("\n[E2E] ✅ All steps completed successfully!");
  });

  it("should handle multiple concurrent executions", async () => {
    console.log("\n[E2E Concurrent] Testing multiple concurrent executions...");

    const exec1 = "exec-001";
    const exec2 = "exec-002";

    // Create separate worktree directories
    const wt1 = join(testDir, "wt1");
    const wt2 = join(testDir, "wt2");
    mkdirSync(join(wt1, ".sudocode"), { recursive: true });
    mkdirSync(join(wt2, ".sudocode"), { recursive: true });
    writeFileSync(join(wt1, ".sudocode/issues.jsonl"), "");
    writeFileSync(join(wt1, ".sudocode/specs.jsonl"), "");
    writeFileSync(join(wt2, ".sudocode/issues.jsonl"), "");
    writeFileSync(join(wt2, ".sudocode/specs.jsonl"), "");

    // Start tracking both
    const mutationTracker = getMutationTracker();
    mutationTracker.startTracking(exec1, wt1);
    mutationTracker.startTracking(exec2, wt2);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create different issues in each worktree
    const issue1: Issue = {
      id: "exec1-issue",
      title: "Exec 1 Issue",
      status: "open",
      description: "From exec 1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const issue2: Issue = {
      id: "exec2-issue",
      title: "Exec 2 Issue",
      status: "open",
      description: "From exec 2",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    writeFileSync(join(wt1, ".sudocode/issues.jsonl"), JSON.stringify(issue1) + "\n");
    writeFileSync(join(wt2, ".sudocode/issues.jsonl"), JSON.stringify(issue2) + "\n");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Verify each execution has its own state
    const provisionalStateManager = getProvisionalStateManager();
    const state1 = provisionalStateManager.computeProvisionalState(exec1);
    const state2 = provisionalStateManager.computeProvisionalState(exec2);

    console.log(`[E2E Concurrent] Exec 1 created: ${state1.provisional.issuesCreated.length}`);
    console.log(`[E2E Concurrent] Exec 2 created: ${state2.provisional.issuesCreated.length}`);

    expect(state1.provisional.issuesCreated).toHaveLength(1);
    expect(state1.provisional.issuesCreated[0].id).toBe("exec1-issue");

    expect(state2.provisional.issuesCreated).toHaveLength(1);
    expect(state2.provisional.issuesCreated[0].id).toBe("exec2-issue");

    console.log("[E2E Concurrent] ✓ Concurrent executions tracked independently");

    // Cleanup
    mutationTracker.stopTracking(exec1);
    mutationTracker.stopTracking(exec2);
  });
});

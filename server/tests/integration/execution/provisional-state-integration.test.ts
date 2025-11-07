/**
 * Integration tests for Provisional State System
 *
 * Tests the complete end-to-end flow:
 * File changes → Watcher → Tracker → Event Buffer → Provisional State Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { WorktreeFileWatcher } from "../../../src/execution/worktree/file-watcher";
import { WorktreeMutationTracker } from "../../../src/execution/worktree/mutation-tracker";
import { WorktreeMutationEventBuffer } from "../../../src/execution/worktree/mutation-event-buffer";
import { JSONLDiffParser } from "../../../src/execution/worktree/jsonl-diff-parser";
import { ProvisionalStateManager } from "../../../src/execution/worktree/provisional-state-manager";
import type { Issue, Spec } from "@sudocode-ai/types";

// Mock the service imports
vi.mock("../../../src/services/issues", () => ({
  getAllIssues: vi.fn(),
}));

vi.mock("../../../src/services/specs", () => ({
  getAllSpecs: vi.fn(),
}));

vi.mock("../../../src/services/executions", () => ({
  getExecution: vi.fn(),
}));

import { getAllIssues } from "../../../src/services/issues";
import { getAllSpecs } from "../../../src/services/specs";
import { getExecution } from "../../../src/services/executions";

describe("Provisional State Integration", () => {
  let testDir: string;
  let worktreePath: string;
  let db: Database.Database;
  let fileWatcher: WorktreeFileWatcher;
  let eventBuffer: WorktreeMutationEventBuffer;
  let diffParser: JSONLDiffParser;
  let mutationTracker: WorktreeMutationTracker;
  let provisionalManager: ProvisionalStateManager;

  // Base data in main repository
  const baseIssue1: Issue = {
    id: "issue-base-1",
    title: "Base Issue 1",
    status: "open",
    description: "In main repo",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  const baseIssue2: Issue = {
    id: "issue-base-2",
    title: "Base Issue 2",
    status: "in_progress",
    description: "Another base issue",
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  };

  const baseSpec1: Spec = {
    id: "spec-base-1",
    title: "Base Spec 1",
    status: "draft",
    description: "Base spec",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    // Create temporary directory for worktree
    testDir = mkdtempSync(join(tmpdir(), "provisional-state-integration-"));
    worktreePath = join(testDir, "worktree");
    mkdirSync(worktreePath, { recursive: true });
    mkdirSync(join(worktreePath, ".sudocode"), { recursive: true });

    // Create initial empty JSONL files
    writeFileSync(join(worktreePath, ".sudocode/issues.jsonl"), "");
    writeFileSync(join(worktreePath, ".sudocode/specs.jsonl"), "");

    // Create in-memory database
    db = new Database(":memory:");

    // Create components
    fileWatcher = new WorktreeFileWatcher({ ignoreInitial: false });
    eventBuffer = new WorktreeMutationEventBuffer();
    diffParser = new JSONLDiffParser();
    mutationTracker = new WorktreeMutationTracker(
      fileWatcher,
      diffParser,
      eventBuffer
    );
    provisionalManager = new ProvisionalStateManager(db, eventBuffer);

    // Setup mocks for base state
    vi.mocked(getAllIssues).mockReturnValue([baseIssue1, baseIssue2]);
    vi.mocked(getAllSpecs).mockReturnValue([baseSpec1]);
    vi.mocked(getExecution).mockReturnValue({
      id: "exec-integration",
      issue_id: "issue-base-1",
      status: "running",
      started_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    } as any);
  });

  afterEach(() => {
    // Cleanup
    mutationTracker.stopAll();
    rmSync(testDir, { recursive: true, force: true });
    db.close();
    vi.clearAllMocks();
  });

  it("should compute provisional state with no worktree changes", async () => {
    const executionId = "exec-integration";

    // Start tracking
    mutationTracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get provisional state
    const state = provisionalManager.computeProvisionalState(executionId);

    // Should have base state but no provisional changes
    expect(state.base.issues).toHaveLength(2);
    expect(state.base.specs).toHaveLength(1);
    expect(state.provisional.issuesCreated).toHaveLength(0);
    expect(state.provisional.issuesUpdated).toHaveLength(0);
    expect(state.provisional.issuesDeleted).toHaveLength(0);

    // Merged view should equal base
    const mergedIssues = provisionalManager.getMergedIssues(executionId);
    const mergedSpecs = provisionalManager.getMergedSpecs(executionId);
    expect(mergedIssues).toHaveLength(2);
    expect(mergedSpecs).toHaveLength(1);
  });

  it("should detect and apply issue creation in worktree", async () => {
    const executionId = "exec-integration";

    // Start tracking
    mutationTracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create new issue in worktree
    const newIssue: Issue = {
      id: "issue-worktree-new",
      title: "Created in Worktree",
      status: "open",
      description: "New issue",
      created_at: "2024-01-10T00:00:00Z",
      updated_at: "2024-01-10T00:00:00Z",
    };

    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      JSON.stringify(newIssue) + "\n"
    );

    // Wait for file watcher to detect change
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Get provisional state
    const state = provisionalManager.computeProvisionalState(executionId);

    // Should show the creation
    expect(state.provisional.issuesCreated).toHaveLength(1);
    expect(state.provisional.issuesCreated[0].id).toBe("issue-worktree-new");
    expect(state.provisional.issuesCreated[0].title).toBe("Created in Worktree");

    // Merged view should include new issue
    const mergedIssues = provisionalManager.getMergedIssues(executionId);
    expect(mergedIssues).toHaveLength(3); // 2 base + 1 created
    expect(mergedIssues.some((i) => i.id === "issue-worktree-new")).toBe(true);
  });

  it("should detect and apply issue updates in worktree", async () => {
    const executionId = "exec-integration";

    // Start with an issue in the worktree that matches base
    const initialIssue: Issue = { ...baseIssue1 };
    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      JSON.stringify(initialIssue) + "\n"
    );

    // Start tracking
    mutationTracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Update the issue in worktree
    const updatedIssue: Issue = {
      ...baseIssue1,
      title: "Updated in Worktree",
      status: "done",
      updated_at: "2024-01-10T00:00:00Z",
    };

    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      JSON.stringify(updatedIssue) + "\n"
    );

    // Wait for file watcher to detect change
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Get provisional state
    const state = provisionalManager.computeProvisionalState(executionId);

    // Should show the update
    expect(state.provisional.issuesUpdated).toHaveLength(1);
    expect(state.provisional.issuesUpdated[0].id).toBe("issue-base-1");
    expect(state.provisional.issuesUpdated[0].updatedIssue.title).toBe(
      "Updated in Worktree"
    );
    expect(state.provisional.issuesUpdated[0].updatedIssue.status).toBe("done");

    // Merged view should reflect the update
    const mergedIssues = provisionalManager.getMergedIssues(executionId);
    const updatedInMerged = mergedIssues.find((i) => i.id === "issue-base-1");
    expect(updatedInMerged?.title).toBe("Updated in Worktree");
    expect(updatedInMerged?.status).toBe("done");
  });

  // TODO: Fix timing issues with file watcher for deletion detection
  it.skip("should detect and apply issue deletions in worktree", async () => {
    const executionId = "exec-integration";

    // Start with an issue in the worktree (different from base to avoid confusion)
    const worktreeIssue: Issue = {
      id: "issue-worktree-temp",
      title: "Temporary Worktree Issue",
      status: "open",
      description: "Will be deleted",
      created_at: "2024-01-05T00:00:00Z",
      updated_at: "2024-01-05T00:00:00Z",
    };

    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      JSON.stringify(worktreeIssue) + "\n"
    );

    // Start tracking
    mutationTracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot to be captured and file watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Delete the issue (empty file)
    writeFileSync(join(worktreePath, ".sudocode/issues.jsonl"), "");

    // Wait longer for file watcher to detect change (with awaitWriteFinish delay)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Get provisional state
    const state = provisionalManager.computeProvisionalState(executionId);

    // Should show the deletion (this was created in worktree, then deleted)
    // Note: Since this issue was only in the worktree, not in base, it shows as deleted
    expect(state.provisional.issuesDeleted).toHaveLength(1);
    expect(state.provisional.issuesDeleted[0]).toBe("issue-worktree-temp");

    // Merged view should only have base issues (the worktree issue was deleted)
    const mergedIssues = provisionalManager.getMergedIssues(executionId);
    expect(mergedIssues.some((i) => i.id === "issue-worktree-temp")).toBe(false);
    expect(mergedIssues).toHaveLength(2); // Only base issues remain
  });

  it("should handle spec mutations similarly to issues", async () => {
    const executionId = "exec-integration";

    // Start tracking
    mutationTracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create new spec in worktree
    const newSpec: Spec = {
      id: "spec-worktree-new",
      title: "Created Spec",
      status: "draft",
      description: "New spec in worktree",
      created_at: "2024-01-10T00:00:00Z",
      updated_at: "2024-01-10T00:00:00Z",
    };

    writeFileSync(
      join(worktreePath, ".sudocode/specs.jsonl"),
      JSON.stringify(newSpec) + "\n"
    );

    // Wait for file watcher to detect change
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Get provisional state
    const state = provisionalManager.computeProvisionalState(executionId);

    // Should show spec creation
    expect(state.provisional.specsCreated).toHaveLength(1);
    expect(state.provisional.specsCreated[0].id).toBe("spec-worktree-new");

    // Merged view should include new spec
    const mergedSpecs = provisionalManager.getMergedSpecs(executionId);
    expect(mergedSpecs).toHaveLength(2); // 1 base + 1 created
    expect(mergedSpecs.some((s) => s.id === "spec-worktree-new")).toBe(true);
  });

  // TODO: Fix timing issues with file watcher for multi-step change detection
  it.skip("should handle complex scenario with multiple operations", async () => {
    const executionId = "exec-integration";

    // Start with empty worktree
    // Start tracking
    mutationTracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Now make multiple changes to the worktree:
    // 1. Create a brand new issue (not in base)
    // 2. Create an issue that matches a base issue (will be treated as creation in worktree)
    // 3. Create another new issue
    const newIssue1: Issue = {
      id: "issue-worktree-new-1",
      title: "New Issue 1",
      status: "open",
      description: "Created in worktree",
      created_at: "2024-01-10T00:00:00Z",
      updated_at: "2024-01-10T00:00:00Z",
    };

    const newIssue2: Issue = {
      id: "issue-worktree-new-2",
      title: "New Issue 2",
      status: "in_progress",
      description: "Another new issue",
      created_at: "2024-01-10T00:00:00Z",
      updated_at: "2024-01-10T00:00:00Z",
    };

    // First write - create two issues
    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      [newIssue1, newIssue2].map((i) => JSON.stringify(i)).join("\n") + "\n"
    );

    // Wait for detection
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Now update one and delete the other
    const updatedIssue1: Issue = {
      ...newIssue1,
      title: "Updated Title",
      status: "done",
      updated_at: "2024-01-11T00:00:00Z",
    };

    writeFileSync(
      join(worktreePath, ".sudocode/issues.jsonl"),
      JSON.stringify(updatedIssue1) + "\n"
    );

    // Wait for detection
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Get provisional state
    const state = provisionalManager.computeProvisionalState(executionId);

    // Should detect:
    // - 2 creates (newIssue1, newIssue2)
    // - 1 update (newIssue1 -> updatedIssue1)
    // - 1 delete (newIssue2)
    expect(state.provisional.issuesCreated).toHaveLength(2);
    expect(state.provisional.issuesUpdated).toHaveLength(1);
    expect(state.provisional.issuesDeleted).toHaveLength(1);

    // Check stats
    const stats = provisionalManager.getProvisionalStateStats(executionId);
    expect(stats.issuesCreated).toBe(2);
    expect(stats.issuesUpdated).toBe(1);
    expect(stats.issuesDeleted).toBe(1);
  });

  it("should support multiple concurrent executions", async () => {
    const exec1 = "exec-1";
    const exec2 = "exec-2";

    // Create separate worktree directories
    const worktree1 = join(testDir, "worktree1");
    const worktree2 = join(testDir, "worktree2");
    mkdirSync(worktree1, { recursive: true });
    mkdirSync(worktree2, { recursive: true });
    mkdirSync(join(worktree1, ".sudocode"), { recursive: true });
    mkdirSync(join(worktree2, ".sudocode"), { recursive: true });

    writeFileSync(join(worktree1, ".sudocode/issues.jsonl"), "");
    writeFileSync(join(worktree1, ".sudocode/specs.jsonl"), "");
    writeFileSync(join(worktree2, ".sudocode/issues.jsonl"), "");
    writeFileSync(join(worktree2, ".sudocode/specs.jsonl"), "");

    // Start tracking both
    mutationTracker.startTracking(exec1, worktree1);
    mutationTracker.startTracking(exec2, worktree2);

    // Wait for initial snapshots
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Make different changes in each worktree
    const issue1: Issue = {
      id: "issue-exec1",
      title: "Exec 1 Issue",
      status: "open",
      description: "From exec 1",
      created_at: "2024-01-10T00:00:00Z",
      updated_at: "2024-01-10T00:00:00Z",
    };

    const issue2: Issue = {
      id: "issue-exec2",
      title: "Exec 2 Issue",
      status: "open",
      description: "From exec 2",
      created_at: "2024-01-10T00:00:00Z",
      updated_at: "2024-01-10T00:00:00Z",
    };

    writeFileSync(
      join(worktree1, ".sudocode/issues.jsonl"),
      JSON.stringify(issue1) + "\n"
    );
    writeFileSync(
      join(worktree2, ".sudocode/issues.jsonl"),
      JSON.stringify(issue2) + "\n"
    );

    // Wait for file watchers
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Get provisional states for both
    const state1 = provisionalManager.computeProvisionalState(exec1);
    const state2 = provisionalManager.computeProvisionalState(exec2);

    // Each should have its own change
    expect(state1.provisional.issuesCreated).toHaveLength(1);
    expect(state1.provisional.issuesCreated[0].id).toBe("issue-exec1");

    expect(state2.provisional.issuesCreated).toHaveLength(1);
    expect(state2.provisional.issuesCreated[0].id).toBe("issue-exec2");

    // Should be independent
    expect(provisionalManager.hasProvisionalState(exec1)).toBe(true);
    expect(provisionalManager.hasProvisionalState(exec2)).toBe(true);
  });
});

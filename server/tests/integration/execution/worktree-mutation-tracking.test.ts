/**
 * Integration tests for Worktree Mutation Tracking
 *
 * These tests use real file system operations to verify the full
 * mutation tracking pipeline works end-to-end.
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { WorktreeFileWatcher } from "../../../src/execution/worktree/file-watcher.js";
import { JSONLDiffParser } from "../../../src/execution/worktree/jsonl-diff-parser.js";
import { WorktreeMutationEventBuffer } from "../../../src/execution/worktree/mutation-event-buffer.js";
import { WorktreeMutationTracker } from "../../../src/execution/worktree/mutation-tracker.js";
import type { Issue, Spec } from "@sudocode-ai/types";

describe("Worktree Mutation Tracking Integration", () => {
  let tempDir: string;
  let worktreePath: string;
  let sudocodePath: string;
  let fileWatcher: WorktreeFileWatcher;
  let diffParser: JSONLDiffParser;
  let eventBuffer: WorktreeMutationEventBuffer;
  let tracker: WorktreeMutationTracker;

  beforeEach(() => {
    // Create temporary worktree directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "worktree-integration-"));
    worktreePath = path.join(tempDir, "worktree");
    sudocodePath = path.join(worktreePath, ".sudocode");

    fs.mkdirSync(worktreePath, { recursive: true });
    fs.mkdirSync(sudocodePath, { recursive: true });

    // Initialize components
    fileWatcher = new WorktreeFileWatcher();
    diffParser = new JSONLDiffParser();
    eventBuffer = new WorktreeMutationEventBuffer();
    tracker = new WorktreeMutationTracker(fileWatcher, diffParser, eventBuffer);
  });

  afterEach(async () => {
    // Stop tracking and cleanup
    await tracker.stopAll();

    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should detect initial issues snapshot", (done) => {
    const executionId = "exec-001";

    // Listen for events
    let eventCount = 0;
    eventBuffer.on("event-added", () => {
      eventCount++;
      if (eventCount === 2) {
        // After both issues are captured
        const events = eventBuffer.getEvents(executionId);
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe("issue_created");
        expect(events[0].metadata?.isSnapshot).toBe(true);
        expect(events[1].type).toBe("issue_created");
        expect(events[1].metadata?.isSnapshot).toBe(true);
        done();
      }
    });

    // Start tracking
    tracker.startTracking(executionId, worktreePath);

    // Create initial issues.jsonl file
    const issue1: Issue = {
      id: "ISSUE-001",
      uuid: "uuid-001",
      title: "Initial Issue 1",
      content: "Content 1",
      status: "open",
      priority: 2,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    const issue2: Issue = {
      id: "ISSUE-002",
      uuid: "uuid-002",
      title: "Initial Issue 2",
      content: "Content 2",
      status: "open",
      priority: 1,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    const issuesPath = path.join(sudocodePath, "issues.jsonl");
    fs.writeFileSync(
      issuesPath,
      JSON.stringify(issue1) + "\n" + JSON.stringify(issue2) + "\n"
    );
  }, 10000); // Longer timeout for file system operations

  it("should detect issue creation", (done) => {
    const executionId = "exec-002";

    // Create initial empty issues.jsonl
    const issuesPath = path.join(sudocodePath, "issues.jsonl");
    fs.writeFileSync(issuesPath, "");

    // Start tracking
    tracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot, then add new issue
    setTimeout(() => {
      let createdEventDetected = false;

      eventBuffer.on("event-added", (event) => {
        if (event.type === "issue_created" && !event.metadata?.isSnapshot) {
          createdEventDetected = true;
          expect(event.entityId).toBe("ISSUE-NEW");
          expect(event.oldValue).toBeNull();
          expect(event.newValue).toBeDefined();
          done();
        }
      });

      // Add new issue
      const newIssue: Issue = {
        id: "ISSUE-NEW",
        uuid: "uuid-new",
        title: "Newly Created Issue",
        content: "New content",
        status: "open",
        priority: 2,
        created_at: "2025-01-02T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      };

      fs.writeFileSync(issuesPath, JSON.stringify(newIssue) + "\n");
    }, 1000);
  }, 10000);

  it("should detect issue update", (done) => {
    const executionId = "exec-003";

    const issue: Issue = {
      id: "ISSUE-001",
      uuid: "uuid-001",
      title: "Original Title",
      content: "Original content",
      status: "open",
      priority: 2,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    // Create initial issues.jsonl
    const issuesPath = path.join(sudocodePath, "issues.jsonl");
    fs.writeFileSync(issuesPath, JSON.stringify(issue) + "\n");

    // Start tracking
    tracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot, then update issue
    setTimeout(() => {
      eventBuffer.on("event-added", (event) => {
        if (event.type === "issue_updated") {
          expect(event.entityId).toBe("ISSUE-001");
          expect(event.oldValue).toBeDefined();
          expect((event.oldValue as Issue).title).toBe("Original Title");
          expect(event.newValue).toBeDefined();
          expect((event.newValue as Issue).title).toBe("Updated Title");
          expect(event.delta).toBeDefined();
          expect(event.delta?.title).toBe("Updated Title");
          done();
        }
      });

      // Update issue
      const updatedIssue: Issue = {
        ...issue,
        title: "Updated Title",
        status: "in_progress",
        updated_at: "2025-01-02T00:00:00Z",
      };

      fs.writeFileSync(issuesPath, JSON.stringify(updatedIssue) + "\n");
    }, 1000);
  }, 10000);

  it("should detect issue deletion", (done) => {
    const executionId = "exec-004";

    const issue1: Issue = {
      id: "ISSUE-001",
      uuid: "uuid-001",
      title: "Issue 1",
      content: "Content 1",
      status: "open",
      priority: 2,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    const issue2: Issue = {
      id: "ISSUE-002",
      uuid: "uuid-002",
      title: "Issue 2",
      content: "Content 2",
      status: "open",
      priority: 1,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    // Create initial issues.jsonl with 2 issues
    const issuesPath = path.join(sudocodePath, "issues.jsonl");
    fs.writeFileSync(
      issuesPath,
      JSON.stringify(issue1) + "\n" + JSON.stringify(issue2) + "\n"
    );

    // Start tracking
    tracker.startTracking(executionId, worktreePath);

    // Wait for initial snapshot, then delete one issue
    setTimeout(() => {
      eventBuffer.on("event-added", (event) => {
        if (event.type === "issue_deleted") {
          expect(event.entityId).toBe("ISSUE-001");
          expect(event.oldValue).toBeDefined();
          expect((event.oldValue as Issue).id).toBe("ISSUE-001");
          expect(event.newValue).toBeNull();
          done();
        }
      });

      // Write only issue2 (effectively deleting issue1)
      fs.writeFileSync(issuesPath, JSON.stringify(issue2) + "\n");
    }, 1000);
  }, 10000);

  it("should handle both issues and specs", (done) => {
    const executionId = "exec-005";

    const issue: Issue = {
      id: "ISSUE-001",
      uuid: "uuid-001",
      title: "Test Issue",
      content: "Test content",
      status: "open",
      priority: 2,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    const spec: Spec = {
      id: "SPEC-001",
      uuid: "uuid-spec-001",
      title: "Test Spec",
      content: "Spec content",
      file_path: "test-spec.md",
      priority: 2,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    // Create both files
    fs.writeFileSync(
      path.join(sudocodePath, "issues.jsonl"),
      JSON.stringify(issue) + "\n"
    );
    fs.writeFileSync(
      path.join(sudocodePath, "specs.jsonl"),
      JSON.stringify(spec) + "\n"
    );

    // Track events
    let issueEvent = false;
    let specEvent = false;

    eventBuffer.on("event-added", (event) => {
      if (event.entityType === "issue" && event.type === "issue_created") {
        issueEvent = true;
      }
      if (event.entityType === "spec" && event.type === "spec_created") {
        specEvent = true;
      }

      if (issueEvent && specEvent) {
        const events = eventBuffer.getEvents(executionId);
        const issueEvents = events.filter((e) => e.entityType === "issue");
        const specEvents = events.filter((e) => e.entityType === "spec");
        expect(issueEvents).toHaveLength(1);
        expect(specEvents).toHaveLength(1);
        done();
      }
    });

    // Start tracking
    tracker.startTracking(executionId, worktreePath);
  }, 10000);

  it("should track multiple concurrent executions", (done) => {
    const executionId1 = "exec-006-1";
    const executionId2 = "exec-006-2";

    // Create separate worktrees
    const worktree1 = path.join(tempDir, "worktree1");
    const worktree2 = path.join(tempDir, "worktree2");
    fs.mkdirSync(path.join(worktree1, ".sudocode"), { recursive: true });
    fs.mkdirSync(path.join(worktree2, ".sudocode"), { recursive: true });

    // Create different issues in each worktree
    fs.writeFileSync(
      path.join(worktree1, ".sudocode/issues.jsonl"),
      JSON.stringify({
        id: "ISSUE-W1",
        uuid: "uuid-w1",
        title: "Worktree 1 Issue",
        content: "Content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      }) + "\n"
    );

    fs.writeFileSync(
      path.join(worktree2, ".sudocode/issues.jsonl"),
      JSON.stringify({
        id: "ISSUE-W2",
        uuid: "uuid-w2",
        title: "Worktree 2 Issue",
        content: "Content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      }) + "\n"
    );

    let exec1EventDetected = false;
    let exec2EventDetected = false;

    eventBuffer.on("event-added", (event) => {
      if (event.executionId === executionId1 && event.entityId === "ISSUE-W1") {
        exec1EventDetected = true;
      }
      if (event.executionId === executionId2 && event.entityId === "ISSUE-W2") {
        exec2EventDetected = true;
      }

      if (exec1EventDetected && exec2EventDetected) {
        // Verify events are properly isolated
        const exec1Events = eventBuffer.getEvents(executionId1);
        const exec2Events = eventBuffer.getEvents(executionId2);

        expect(exec1Events.every((e) => e.executionId === executionId1)).toBe(
          true
        );
        expect(exec2Events.every((e) => e.executionId === executionId2)).toBe(
          true
        );

        done();
      }
    });

    // Start tracking both
    tracker.startTracking(executionId1, worktree1);
    tracker.startTracking(executionId2, worktree2);
  }, 10000);
});

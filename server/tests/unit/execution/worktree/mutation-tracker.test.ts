/**
 * Tests for Worktree Mutation Tracker
 */

import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { WorktreeMutationTracker } from "../../../../src/execution/worktree/mutation-tracker.js";
import { WorktreeFileWatcher } from "../../../../src/execution/worktree/file-watcher.js";
import { JSONLDiffParser } from "../../../../src/execution/worktree/jsonl-diff-parser.js";
import { WorktreeMutationEventBuffer } from "../../../../src/execution/worktree/mutation-event-buffer.js";
import type { Issue } from "@sudocode-ai/types";

// Mock chokidar to prevent real file system access
vi.mock("chokidar", () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
      getWatched: vi.fn(() => ({})),
    })),
  },
}));

describe("WorktreeMutationTracker", () => {
  let tracker: WorktreeMutationTracker;
  let fileWatcher: WorktreeFileWatcher;
  let diffParser: JSONLDiffParser;
  let eventBuffer: WorktreeMutationEventBuffer;

  beforeEach(() => {
    fileWatcher = new WorktreeFileWatcher();
    diffParser = new JSONLDiffParser();
    eventBuffer = new WorktreeMutationEventBuffer();
    tracker = new WorktreeMutationTracker(fileWatcher, diffParser, eventBuffer);
  });

  afterEach(async () => {
    await tracker.stopAll();
  });

  describe("startTracking", () => {
    it("should start tracking a worktree", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      tracker.startTracking(executionId, worktreePath);

      expect(tracker.isTracking(executionId)).toBe(true);
    });

    it("should throw error if already tracking same execution", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      tracker.startTracking(executionId, worktreePath);

      expect(() => {
        tracker.startTracking(executionId, worktreePath);
      }).toThrow("Already tracking execution");
    });
  });

  describe("stopTracking", () => {
    it("should stop tracking a worktree", async () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      tracker.startTracking(executionId, worktreePath);
      expect(tracker.isTracking(executionId)).toBe(true);

      await tracker.stopTracking(executionId);

      expect(tracker.isTracking(executionId)).toBe(false);
    });

    it("should not throw if execution not being tracked", async () => {
      await expect(tracker.stopTracking("non-existent")).resolves.not.toThrow();
    });
  });

  describe("stopAll", () => {
    it("should stop tracking all worktrees", async () => {
      tracker.startTracking("exec-001", "/path/to/worktree1");
      tracker.startTracking("exec-002", "/path/to/worktree2");
      tracker.startTracking("exec-003", "/path/to/worktree3");

      expect(tracker.getTrackedExecutions()).toHaveLength(3);

      await tracker.stopAll();

      expect(tracker.getTrackedExecutions()).toHaveLength(0);
    });
  });

  describe("isTracking", () => {
    it("should return true for tracked execution", () => {
      const executionId = "exec-001";
      tracker.startTracking(executionId, "/path/to/worktree");

      expect(tracker.isTracking(executionId)).toBe(true);
    });

    it("should return false for untracked execution", () => {
      expect(tracker.isTracking("non-existent")).toBe(false);
    });
  });

  describe("getTrackedExecutions", () => {
    it("should return all tracked execution IDs", () => {
      tracker.startTracking("exec-001", "/path/to/worktree1");
      tracker.startTracking("exec-002", "/path/to/worktree2");

      const executions = tracker.getTrackedExecutions();

      expect(executions).toHaveLength(2);
      expect(executions).toContain("exec-001");
      expect(executions).toContain("exec-002");
    });

    it("should return empty array when no tracking", () => {
      const executions = tracker.getTrackedExecutions();
      expect(executions).toHaveLength(0);
    });
  });

  describe("file change handling", () => {
    it("should process initial snapshot", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      // Spy on methods
      const parseJSONLSpy = vi.spyOn(diffParser, "parseJSONL");
      const createSnapshotEventsSpy = vi.spyOn(diffParser, "createSnapshotEvents");
      const addEventSpy = vi.spyOn(eventBuffer, "addEvent");

      // Mock parseJSONL to return test data
      const mockIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Test Issue",
        content: "Test content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };
      parseJSONLSpy.mockReturnValue(new Map([["ISSUE-001", mockIssue]]));

      tracker.startTracking(executionId, worktreePath);

      // Simulate initial file add
      fileWatcher.emit("file-changed", {
        executionId,
        filePath: `${worktreePath}/.sudocode/issues.jsonl`,
        eventType: "initial",
        timestamp: Date.now(),
      });

      // Verify parseJSONL was called
      expect(parseJSONLSpy).toHaveBeenCalledWith(
        `${worktreePath}/.sudocode/issues.jsonl`
      );

      // Verify snapshot events were created
      expect(createSnapshotEventsSpy).toHaveBeenCalledWith(
        "issue",
        expect.any(Map)
      );

      // Verify events were added to buffer
      expect(addEventSpy).toHaveBeenCalled();
    });

    it("should process incremental changes", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      // Spy on methods
      const parseJSONLSpy = vi.spyOn(diffParser, "parseJSONL");
      const computeDiffSpy = vi.spyOn(diffParser, "computeDiff");
      const addEventSpy = vi.spyOn(eventBuffer, "addEvent");

      // Mock initial state
      const initialIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Initial Title",
        content: "Initial content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };
      parseJSONLSpy.mockReturnValueOnce(new Map([["ISSUE-001", initialIssue]]));

      tracker.startTracking(executionId, worktreePath);

      // Simulate initial snapshot
      fileWatcher.emit("file-changed", {
        executionId,
        filePath: `${worktreePath}/.sudocode/issues.jsonl`,
        eventType: "initial",
        timestamp: Date.now(),
      });

      // Mock updated state
      const updatedIssue: Issue = {
        ...initialIssue,
        title: "Updated Title",
        status: "in_progress",
        updated_at: "2025-01-02T00:00:00Z",
      };
      parseJSONLSpy.mockReturnValueOnce(new Map([["ISSUE-001", updatedIssue]]));

      // Simulate incremental change
      fileWatcher.emit("file-changed", {
        executionId,
        filePath: `${worktreePath}/.sudocode/issues.jsonl`,
        eventType: "change",
        timestamp: Date.now(),
      });

      // Verify diff was computed
      expect(computeDiffSpy).toHaveBeenCalledWith(
        "issue",
        expect.any(Map),
        expect.any(Map)
      );

      // Verify events were added to buffer
      expect(addEventSpy).toHaveBeenCalled();
    });

    it("should handle both issues and specs separately", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      const parseJSONLSpy = vi.spyOn(diffParser, "parseJSONL");

      tracker.startTracking(executionId, worktreePath);

      // Simulate issues file change
      parseJSONLSpy.mockReturnValueOnce(new Map());
      fileWatcher.emit("file-changed", {
        executionId,
        filePath: `${worktreePath}/.sudocode/issues.jsonl`,
        eventType: "initial",
        timestamp: Date.now(),
      });

      // Simulate specs file change
      parseJSONLSpy.mockReturnValueOnce(new Map());
      fileWatcher.emit("file-changed", {
        executionId,
        filePath: `${worktreePath}/.sudocode/specs.jsonl`,
        eventType: "initial",
        timestamp: Date.now(),
      });

      // Verify both were processed
      expect(parseJSONLSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle errors gracefully", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      // Mock parseJSONL to throw error
      const parseJSONLSpy = vi
        .spyOn(diffParser, "parseJSONL")
        .mockImplementation(() => {
          throw new Error("Parse error");
        });

      tracker.startTracking(executionId, worktreePath);

      // Simulate file change (should not throw)
      expect(() => {
        fileWatcher.emit("file-changed", {
          executionId,
          filePath: `${worktreePath}/.sudocode/issues.jsonl`,
          eventType: "initial",
          timestamp: Date.now(),
        });
      }).not.toThrow();

      expect(parseJSONLSpy).toHaveBeenCalled();
    });
  });

  describe("getters", () => {
    it("should return file watcher", () => {
      expect(tracker.getFileWatcher()).toBe(fileWatcher);
    });

    it("should return event buffer", () => {
      expect(tracker.getEventBuffer()).toBe(eventBuffer);
    });

    it("should return diff parser", () => {
      expect(tracker.getDiffParser()).toBe(diffParser);
    });
  });
});

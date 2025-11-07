/**
 * Tests for Worktree File Watcher
 */

import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { EventEmitter } from "events";
import type { FSWatcher } from "chokidar";

// Mock chokidar
const mockWatchers = new Map<string, MockFSWatcher>();

class MockFSWatcher extends EventEmitter {
  constructor(public paths: string[]) {
    super();
  }

  async close(): Promise<void> {
    // Simulate async close
    return Promise.resolve();
  }

  getWatched(): Record<string, string[]> {
    return { "/mock": this.paths };
  }
}

vi.mock("chokidar", () => ({
  default: {
    watch: vi.fn((paths: string | string[], _options?: any) => {
      const pathArray = Array.isArray(paths) ? paths : [paths];
      const watcher = new MockFSWatcher(pathArray);
      const key = pathArray.join(",");
      mockWatchers.set(key, watcher);

      // Simulate ready event
      setTimeout(() => {
        watcher.emit("ready");
      }, 10);

      return watcher;
    }),
  },
}));

import { WorktreeFileWatcher } from "../../../../src/execution/worktree/file-watcher.js";

describe("WorktreeFileWatcher", () => {
  let watcher: WorktreeFileWatcher;

  beforeEach(() => {
    watcher = new WorktreeFileWatcher();
    mockWatchers.clear();
  });

  afterEach(async () => {
    await watcher.unwatchAll();
    mockWatchers.clear();
  });

  describe("watchWorktree", () => {
    it("should start watching JSONL files in worktree", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      watcher.watchWorktree(executionId, worktreePath);

      expect(watcher.isWatching(executionId)).toBe(true);
      expect(watcher.getWatcherCount()).toBe(1);
    });

    it("should throw error if already watching same execution", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      watcher.watchWorktree(executionId, worktreePath);

      expect(() => {
        watcher.watchWorktree(executionId, worktreePath);
      }).toThrow("Already watching worktree for execution");
    });

    it("should emit file-changed event on file add", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";
      const filePath = "/path/to/worktree/.sudocode/issues.jsonl";

      return new Promise<void>((resolve) => {
        watcher.on("file-changed", (event) => {
          expect(event.executionId).toBe(executionId);
          expect(event.filePath).toBe(filePath);
          expect(event.eventType).toBe("initial");
          expect(event.timestamp).toBeGreaterThan(0);
          resolve();
        });

        watcher.watchWorktree(executionId, worktreePath);

        // Simulate file add event
        const mockWatcher = Array.from(mockWatchers.values())[0];
        mockWatcher.emit("add", filePath);
      });
    });

    it("should emit file-changed event on file change", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";
      const filePath = "/path/to/worktree/.sudocode/issues.jsonl";

      return new Promise<void>((resolve) => {
        watcher.on("file-changed", (event) => {
          if (event.eventType === "change") {
            expect(event.executionId).toBe(executionId);
            expect(event.filePath).toBe(filePath);
            expect(event.eventType).toBe("change");
            resolve();
          }
        });

        watcher.watchWorktree(executionId, worktreePath);

        // Simulate file change event
        const mockWatcher = Array.from(mockWatchers.values())[0];
        mockWatcher.emit("change", filePath);
      });
    });

    it("should emit error event on watcher error", () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";
      const error = new Error("Watcher error");

      return new Promise<void>((resolve) => {
        watcher.on("error", (event) => {
          expect(event.executionId).toBe(executionId);
          expect(event.error).toBe(error);
          resolve();
        });

        watcher.watchWorktree(executionId, worktreePath);

        // Simulate error
        const mockWatcher = Array.from(mockWatchers.values())[0];
        mockWatcher.emit("error", error);
      });
    });
  });

  describe("unwatchWorktree", () => {
    it("should stop watching a worktree", async () => {
      const executionId = "exec-001";
      const worktreePath = "/path/to/worktree";

      watcher.watchWorktree(executionId, worktreePath);
      expect(watcher.isWatching(executionId)).toBe(true);

      await watcher.unwatchWorktree(executionId);

      expect(watcher.isWatching(executionId)).toBe(false);
      expect(watcher.getWatcherCount()).toBe(0);
    });

    it("should not throw if watcher doesn't exist", async () => {
      await expect(watcher.unwatchWorktree("non-existent")).resolves.not.toThrow();
    });
  });

  describe("unwatchAll", () => {
    it("should stop all watchers", async () => {
      watcher.watchWorktree("exec-001", "/path/to/worktree1");
      watcher.watchWorktree("exec-002", "/path/to/worktree2");
      watcher.watchWorktree("exec-003", "/path/to/worktree3");

      expect(watcher.getWatcherCount()).toBe(3);

      await watcher.unwatchAll();

      expect(watcher.getWatcherCount()).toBe(0);
    });
  });

  describe("isWatching", () => {
    it("should return true for watched execution", () => {
      const executionId = "exec-001";
      watcher.watchWorktree(executionId, "/path/to/worktree");

      expect(watcher.isWatching(executionId)).toBe(true);
    });

    it("should return false for unwatched execution", () => {
      expect(watcher.isWatching("non-existent")).toBe(false);
    });
  });

  describe("getWatchedExecutions", () => {
    it("should return all watched execution IDs", () => {
      watcher.watchWorktree("exec-001", "/path/to/worktree1");
      watcher.watchWorktree("exec-002", "/path/to/worktree2");

      const executions = watcher.getWatchedExecutions();

      expect(executions).toHaveLength(2);
      expect(executions).toContain("exec-001");
      expect(executions).toContain("exec-002");
    });

    it("should return empty array when no watchers", () => {
      const executions = watcher.getWatchedExecutions();
      expect(executions).toHaveLength(0);
    });
  });

  describe("getWatcherCount", () => {
    it("should return correct count", () => {
      expect(watcher.getWatcherCount()).toBe(0);

      watcher.watchWorktree("exec-001", "/path/to/worktree1");
      expect(watcher.getWatcherCount()).toBe(1);

      watcher.watchWorktree("exec-002", "/path/to/worktree2");
      expect(watcher.getWatcherCount()).toBe(2);
    });
  });

  describe("config", () => {
    it("should use default config values", () => {
      const defaultWatcher = new WorktreeFileWatcher();
      defaultWatcher.watchWorktree("exec-001", "/path/to/worktree");

      // Check that watcher was created (defaults were used)
      expect(defaultWatcher.isWatching("exec-001")).toBe(true);
    });

    it("should use custom config values", () => {
      const customWatcher = new WorktreeFileWatcher({
        stabilityThreshold: 1000,
        pollInterval: 200,
        ignoreInitial: true,
      });

      customWatcher.watchWorktree("exec-001", "/path/to/worktree");
      expect(customWatcher.isWatching("exec-001")).toBe(true);
    });
  });
});

/**
 * Worktree File Watcher
 *
 * Monitors JSONL files in worktree directories and emits change events.
 * Uses chokidar for efficient file system watching.
 *
 * @module execution/worktree/file-watcher
 */

import { EventEmitter } from "events";
import chokidar, { FSWatcher } from "chokidar";
import path from "path";

/**
 * File change event emitted by the watcher
 */
export interface FileChangeEvent {
  /** Execution ID this worktree belongs to */
  executionId: string;

  /** Full path to the changed file */
  filePath: string;

  /** Type of change event */
  eventType: "initial" | "change";

  /** When the event was detected */
  timestamp: number;
}

/**
 * Configuration for file watching
 */
export interface FileWatcherConfig {
  /** Stability threshold in ms (wait this long after last write) */
  stabilityThreshold?: number;

  /** Poll interval in ms for checking write completion */
  pollInterval?: number;

  /** Whether to ignore initial add events */
  ignoreInitial?: boolean;
}

/**
 * WorktreeFileWatcher - Monitors JSONL files in worktrees
 *
 * This class manages file system watchers for multiple worktrees concurrently.
 * It uses chokidar for efficient watching and emits events when files change.
 *
 * Usage:
 * ```typescript
 * const watcher = new WorktreeFileWatcher();
 * watcher.on('file-changed', (event) => {
 *   console.log(`File changed: ${event.filePath}`);
 * });
 * watcher.watchWorktree('exec-001', '/path/to/worktree');
 * ```
 */
export class WorktreeFileWatcher extends EventEmitter {
  private watchers = new Map<string, FSWatcher>();
  private config: Required<FileWatcherConfig>;

  /**
   * Create a new WorktreeFileWatcher
   *
   * @param config - Optional configuration
   */
  constructor(config?: FileWatcherConfig) {
    super();
    this.config = {
      stabilityThreshold: config?.stabilityThreshold ?? 500,
      pollInterval: config?.pollInterval ?? 100,
      ignoreInitial: config?.ignoreInitial ?? false,
    };
  }

  /**
   * Start watching a worktree's JSONL files
   *
   * Watches both issues.jsonl and specs.jsonl in the worktree's .sudocode directory.
   *
   * @param executionId - Execution ID (used as key for the watcher)
   * @param worktreePath - Path to worktree directory
   * @throws Error if already watching this execution
   */
  watchWorktree(executionId: string, worktreePath: string): void {
    if (this.watchers.has(executionId)) {
      throw new Error(
        `Already watching worktree for execution: ${executionId}`
      );
    }

    const sudocodePath = path.join(worktreePath, ".sudocode");
    const filesToWatch = [
      path.join(sudocodePath, "issues.jsonl"),
      path.join(sudocodePath, "specs.jsonl"),
    ];

    console.log("[WorktreeFileWatcher] Starting watch", {
      executionId,
      worktreePath,
      sudocodePath,
      files: filesToWatch,
    });

    const watcher = chokidar.watch(filesToWatch, {
      persistent: true,
      ignoreInitial: this.config.ignoreInitial,
      awaitWriteFinish: {
        stabilityThreshold: this.config.stabilityThreshold,
        pollInterval: this.config.pollInterval,
      },
      // Additional options for reliability
      usePolling: false, // Use native fs.watch when possible
      interval: 100, // Polling interval if usePolling is true
      binaryInterval: 300, // Polling interval for binary files
      alwaysStat: false, // Don't always call fs.stat
      depth: 0, // Don't recurse into subdirectories
      ignorePermissionErrors: false, // Throw on permission errors
    });

    // Handle initial add events (if ignoreInitial is false)
    watcher.on("add", (filePath) => {
      this.handleFileChange(executionId, filePath, "initial");
    });

    // Handle file change events
    watcher.on("change", (filePath) => {
      this.handleFileChange(executionId, filePath, "change");
    });

    // Handle errors
    watcher.on("error", (error) => {
      console.error("[WorktreeFileWatcher] Watcher error", {
        executionId,
        error,
      });
      this.emit("error", { executionId, error });
    });

    // Handle ready event (initial scan complete)
    watcher.on("ready", () => {
      console.log("[WorktreeFileWatcher] Watcher ready", {
        executionId,
        watchedPaths: watcher.getWatched(),
      });
    });

    this.watchers.set(executionId, watcher);
  }

  /**
   * Stop watching a worktree
   *
   * @param executionId - Execution ID
   * @returns Promise that resolves when watcher is closed
   */
  async unwatchWorktree(executionId: string): Promise<void> {
    const watcher = this.watchers.get(executionId);
    if (!watcher) {
      console.warn(
        `[WorktreeFileWatcher] No watcher found for execution: ${executionId}`
      );
      return;
    }

    console.log("[WorktreeFileWatcher] Stopping watch", { executionId });

    await watcher.close();
    this.watchers.delete(executionId);

    console.log("[WorktreeFileWatcher] Watcher stopped", { executionId });
  }

  /**
   * Stop watching all worktrees
   *
   * @returns Promise that resolves when all watchers are closed
   */
  async unwatchAll(): Promise<void> {
    console.log("[WorktreeFileWatcher] Stopping all watchers", {
      count: this.watchers.size,
    });

    const promises: Promise<void>[] = [];
    for (const [executionId] of this.watchers) {
      promises.push(this.unwatchWorktree(executionId));
    }

    await Promise.all(promises);

    console.log("[WorktreeFileWatcher] All watchers stopped");
  }

  /**
   * Check if watching a specific execution
   *
   * @param executionId - Execution ID
   * @returns true if watching
   */
  isWatching(executionId: string): boolean {
    return this.watchers.has(executionId);
  }

  /**
   * Get list of all watched execution IDs
   *
   * @returns Array of execution IDs
   */
  getWatchedExecutions(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Get count of active watchers
   *
   * @returns Number of active watchers
   */
  getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Handle file change event
   *
   * Emits a 'file-changed' event for consumers to handle.
   *
   * @param executionId - Execution ID
   * @param filePath - Path to changed file
   * @param eventType - Type of change event
   */
  private handleFileChange(
    executionId: string,
    filePath: string,
    eventType: "initial" | "change"
  ): void {
    const event: FileChangeEvent = {
      executionId,
      filePath,
      eventType,
      timestamp: Date.now(),
    };

    console.log("[WorktreeFileWatcher] File changed", {
      executionId,
      filePath,
      eventType,
      timestamp: new Date(event.timestamp).toISOString(),
    });

    // Emit event for mutation tracker to process
    this.emit("file-changed", event);
  }
}

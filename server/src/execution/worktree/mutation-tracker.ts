/**
 * Worktree Mutation Tracker
 *
 * Coordinates between file watcher, diff parser, and event buffer to track
 * all mutations happening in worktree environments.
 *
 * @module execution/worktree/mutation-tracker
 */

import { randomUUID } from "crypto";
import path from "path";
import type { Issue, Spec } from "@sudocode-ai/types";
import { WorktreeFileWatcher, FileChangeEvent } from "./file-watcher.js";
import { JSONLDiffParser } from "./jsonl-diff-parser.js";
import { WorktreeMutationEventBuffer } from "./mutation-event-buffer.js";

/**
 * Snapshot of worktree state for diffing
 */
interface WorktreeSnapshot {
  issues: Map<string, Issue>;
  specs: Map<string, Spec>;
}

/**
 * WorktreeMutationTracker - Coordinates mutation tracking
 *
 * This class ties together the file watcher, diff parser, and event buffer
 * to provide end-to-end mutation tracking for worktree executions.
 *
 * Architecture:
 * 1. WorktreeFileWatcher monitors JSONL files
 * 2. On file change, JSONLDiffParser computes the diff
 * 3. Mutation events are added to WorktreeMutationEventBuffer
 * 4. Previous snapshots are stored for next diff
 *
 * Usage:
 * ```typescript
 * const tracker = new WorktreeMutationTracker(fileWatcher, diffParser, eventBuffer);
 * tracker.startTracking('exec-001', '/path/to/worktree');
 * // Later...
 * await tracker.stopTracking('exec-001');
 * ```
 */
export class WorktreeMutationTracker {
  private fileWatcher: WorktreeFileWatcher;
  private diffParser: JSONLDiffParser;
  private eventBuffer: WorktreeMutationEventBuffer;

  // Track previous snapshots for each execution
  private previousSnapshots = new Map<string, WorktreeSnapshot>();

  // Track worktree paths for cleanup
  private worktreePaths = new Map<string, string>();

  /**
   * Create a new WorktreeMutationTracker
   *
   * @param fileWatcher - File watcher instance
   * @param diffParser - JSONL diff parser instance
   * @param eventBuffer - Event buffer instance
   */
  constructor(
    fileWatcher: WorktreeFileWatcher,
    diffParser: JSONLDiffParser,
    eventBuffer: WorktreeMutationEventBuffer
  ) {
    this.fileWatcher = fileWatcher;
    this.diffParser = diffParser;
    this.eventBuffer = eventBuffer;

    // Subscribe to file change events from watcher
    this.fileWatcher.on("file-changed", this.handleFileChanged.bind(this));
  }

  /**
   * Start tracking mutations for an execution
   *
   * Begins watching the worktree's JSONL files and tracking changes.
   *
   * @param executionId - Execution ID
   * @param worktreePath - Path to worktree directory
   */
  startTracking(executionId: string, worktreePath: string): void {
    if (this.fileWatcher.isWatching(executionId)) {
      throw new Error(`Already tracking execution: ${executionId}`);
    }

    console.log("[WorktreeMutationTracker] Starting tracking", {
      executionId,
      worktreePath,
    });

    // Store worktree path for reference
    this.worktreePaths.set(executionId, worktreePath);

    // Start file watcher
    this.fileWatcher.watchWorktree(executionId, worktreePath);

    console.log("[WorktreeMutationTracker] Tracking started", { executionId });
  }

  /**
   * Stop tracking mutations for an execution
   *
   * Stops watching files and cleans up state.
   *
   * @param executionId - Execution ID
   */
  async stopTracking(executionId: string): Promise<void> {
    console.log("[WorktreeMutationTracker] Stopping tracking", { executionId });

    // Stop file watcher
    await this.fileWatcher.unwatchWorktree(executionId);

    // Clean up state
    this.previousSnapshots.delete(executionId);
    this.worktreePaths.delete(executionId);

    console.log("[WorktreeMutationTracker] Tracking stopped", { executionId });
  }

  /**
   * Stop tracking all executions
   */
  async stopAll(): Promise<void> {
    console.log("[WorktreeMutationTracker] Stopping all tracking", {
      count: this.previousSnapshots.size,
    });

    await this.fileWatcher.unwatchAll();
    this.previousSnapshots.clear();
    this.worktreePaths.clear();

    console.log("[WorktreeMutationTracker] All tracking stopped");
  }

  /**
   * Check if tracking a specific execution
   *
   * @param executionId - Execution ID
   * @returns true if tracking
   */
  isTracking(executionId: string): boolean {
    return this.fileWatcher.isWatching(executionId);
  }

  /**
   * Get list of all tracked execution IDs
   *
   * @returns Array of execution IDs
   */
  getTrackedExecutions(): string[] {
    return this.fileWatcher.getWatchedExecutions();
  }

  /**
   * Handle file change event from watcher
   *
   * This is the core logic that computes diffs and generates mutation events.
   *
   * @param event - File change event
   */
  private handleFileChanged(event: FileChangeEvent): void {
    const { executionId, filePath, eventType, timestamp } = event;

    try {
      // Determine entity type from file path
      const fileName = path.basename(filePath);
      const entityType = fileName === "issues.jsonl" ? "issue" : "spec";

      console.log("[WorktreeMutationTracker] Processing file change", {
        executionId,
        filePath,
        entityType,
        eventType,
      });

      // Parse current JSONL file
      const newEntities = this.diffParser.parseJSONL(filePath);

      // Get or initialize snapshot
      let snapshot = this.previousSnapshots.get(executionId);
      if (!snapshot) {
        snapshot = {
          issues: new Map(),
          specs: new Map(),
        };
        this.previousSnapshots.set(executionId, snapshot);
      }

      // Get previous entities for this type
      const oldEntities =
        entityType === "issue" ? snapshot.issues : snapshot.specs;

      // Handle initial snapshot vs. incremental diff
      if (eventType === "initial") {
        // Capture initial snapshot
        this.handleInitialSnapshot(
          executionId,
          entityType,
          newEntities,
          timestamp
        );
      } else {
        // Compute diff and generate mutation events
        this.handleIncrementalChange(
          executionId,
          entityType,
          oldEntities,
          newEntities,
          timestamp
        );
      }

      // Update snapshot for next diff
      if (entityType === "issue") {
        snapshot.issues = newEntities as Map<string, Issue>;
      } else {
        snapshot.specs = newEntities as Map<string, Spec>;
      }

      console.log("[WorktreeMutationTracker] File change processed", {
        executionId,
        entityType,
        entityCount: newEntities.size,
      });
    } catch (error) {
      console.error(
        "[WorktreeMutationTracker] Error processing file change",
        {
          executionId,
          filePath,
          error,
        }
      );
    }
  }

  /**
   * Handle initial snapshot capture
   *
   * Captures the starting state of the worktree and stores it in the event buffer.
   * This is used as the baseline for computing subsequent diffs.
   *
   * @param executionId - Execution ID
   * @param entityType - Type of entity (issue or spec)
   * @param entities - Entities from JSONL file
   * @param timestamp - When the snapshot was taken
   */
  private handleInitialSnapshot(
    executionId: string,
    entityType: "issue" | "spec",
    entities: Map<string, Issue | Spec>,
    timestamp: number
  ): void {
    console.log("[WorktreeMutationTracker] Capturing initial snapshot", {
      executionId,
      entityType,
      entityCount: entities.size,
    });

    // Create snapshot events (all entities as "created" with isSnapshot=true)
    const snapshotEvents = this.diffParser.createSnapshotEvents(
      entityType,
      entities
    );

    // Add events to buffer (but mark them as snapshots, not real mutations)
    // These are used to establish the baseline but shouldn't be broadcast as changes
    for (const eventPartial of snapshotEvents) {
      this.eventBuffer.addEvent(executionId, {
        ...eventPartial,
        id: randomUUID(),
        executionId,
        detectedAt: timestamp,
      });
    }

    // Also capture in buffer's initial snapshot for reference
    const snapshot = this.previousSnapshots.get(executionId);
    if (snapshot) {
      this.eventBuffer.captureInitialSnapshot(executionId, {
        issues: Object.fromEntries(snapshot.issues),
        specs: Object.fromEntries(snapshot.specs),
      });
    }

    console.log("[WorktreeMutationTracker] Initial snapshot captured", {
      executionId,
      entityType,
      eventCount: snapshotEvents.length,
    });
  }

  /**
   * Handle incremental change (after initial snapshot)
   *
   * Computes diff between old and new state and generates mutation events.
   *
   * @param executionId - Execution ID
   * @param entityType - Type of entity
   * @param oldEntities - Previous state
   * @param newEntities - Current state
   * @param timestamp - When the change was detected
   */
  private handleIncrementalChange(
    executionId: string,
    entityType: "issue" | "spec",
    oldEntities: Map<string, Issue | Spec>,
    newEntities: Map<string, Issue | Spec>,
    timestamp: number
  ): void {
    console.log("[WorktreeMutationTracker] Computing incremental diff", {
      executionId,
      entityType,
      oldCount: oldEntities.size,
      newCount: newEntities.size,
    });

    // Compute diff
    const mutationEvents = this.diffParser.computeDiff(
      entityType,
      oldEntities,
      newEntities
    );

    console.log("[WorktreeMutationTracker] Diff computed", {
      executionId,
      entityType,
      mutationCount: mutationEvents.length,
    });

    // Add events to buffer
    for (const eventPartial of mutationEvents) {
      this.eventBuffer.addEvent(executionId, {
        ...eventPartial,
        id: randomUUID(),
        executionId,
        detectedAt: timestamp,
      });
    }

    console.log("[WorktreeMutationTracker] Mutation events added to buffer", {
      executionId,
      entityType,
      eventCount: mutationEvents.length,
    });
  }

  /**
   * Get the file watcher instance
   *
   * Useful for testing and inspection.
   *
   * @returns File watcher instance
   */
  getFileWatcher(): WorktreeFileWatcher {
    return this.fileWatcher;
  }

  /**
   * Get the event buffer instance
   *
   * Useful for testing and inspection.
   *
   * @returns Event buffer instance
   */
  getEventBuffer(): WorktreeMutationEventBuffer {
    return this.eventBuffer;
  }

  /**
   * Get the diff parser instance
   *
   * Useful for testing and inspection.
   *
   * @returns Diff parser instance
   */
  getDiffParser(): JSONLDiffParser {
    return this.diffParser;
  }
}

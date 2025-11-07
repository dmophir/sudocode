/**
 * Worktree Mutation System Singleton
 *
 * Provides global access to worktree mutation tracking components.
 * These are initialized once per server instance and shared across all executions.
 *
 * @module execution/worktree/singleton
 */

import type Database from "better-sqlite3";
import { WorktreeFileWatcher } from "./file-watcher.js";
import { WorktreeMutationTracker } from "./mutation-tracker.js";
import { WorktreeMutationEventBuffer } from "./mutation-event-buffer.js";
import { JSONLDiffParser } from "./jsonl-diff-parser.js";
import { ProvisionalStateManager } from "./provisional-state-manager.js";

/**
 * Singleton container for worktree mutation system components
 */
class WorktreeMutationSystem {
  private static instance: WorktreeMutationSystem | null = null;

  private fileWatcher: WorktreeFileWatcher | null = null;
  private eventBuffer: WorktreeMutationEventBuffer | null = null;
  private diffParser: JSONLDiffParser | null = null;
  private mutationTracker: WorktreeMutationTracker | null = null;
  private provisionalStateManager: ProvisionalStateManager | null = null;

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): WorktreeMutationSystem {
    if (!WorktreeMutationSystem.instance) {
      WorktreeMutationSystem.instance = new WorktreeMutationSystem();
    }
    return WorktreeMutationSystem.instance;
  }

  /**
   * Initialize the worktree mutation system
   *
   * This should be called once when the server starts, before any executions are created.
   *
   * @param db - Database instance
   */
  initialize(db: Database.Database): void {
    if (this.isInitialized()) {
      console.warn(
        "[WorktreeMutationSystem] Already initialized, skipping re-initialization"
      );
      return;
    }

    console.log("[WorktreeMutationSystem] Initializing mutation tracking system");

    // Create components
    this.fileWatcher = new WorktreeFileWatcher();
    this.eventBuffer = new WorktreeMutationEventBuffer();
    this.diffParser = new JSONLDiffParser();
    this.mutationTracker = new WorktreeMutationTracker(
      this.fileWatcher,
      this.diffParser,
      this.eventBuffer
    );
    this.provisionalStateManager = new ProvisionalStateManager(
      db,
      this.eventBuffer
    );

    console.log("[WorktreeMutationSystem] Initialization complete");
  }

  /**
   * Check if the system is initialized
   */
  isInitialized(): boolean {
    return this.mutationTracker !== null;
  }

  /**
   * Get the file watcher instance
   *
   * @throws Error if not initialized
   */
  getFileWatcher(): WorktreeFileWatcher {
    if (!this.fileWatcher) {
      throw new Error(
        "WorktreeMutationSystem not initialized. Call initialize() first."
      );
    }
    return this.fileWatcher;
  }

  /**
   * Get the event buffer instance
   *
   * @throws Error if not initialized
   */
  getEventBuffer(): WorktreeMutationEventBuffer {
    if (!this.eventBuffer) {
      throw new Error(
        "WorktreeMutationSystem not initialized. Call initialize() first."
      );
    }
    return this.eventBuffer;
  }

  /**
   * Get the diff parser instance
   *
   * @throws Error if not initialized
   */
  getDiffParser(): JSONLDiffParser {
    if (!this.diffParser) {
      throw new Error(
        "WorktreeMutationSystem not initialized. Call initialize() first."
      );
    }
    return this.diffParser;
  }

  /**
   * Get the mutation tracker instance
   *
   * @throws Error if not initialized
   */
  getMutationTracker(): WorktreeMutationTracker {
    if (!this.mutationTracker) {
      throw new Error(
        "WorktreeMutationSystem not initialized. Call initialize() first."
      );
    }
    return this.mutationTracker;
  }

  /**
   * Get the provisional state manager instance
   *
   * @throws Error if not initialized
   */
  getProvisionalStateManager(): ProvisionalStateManager {
    if (!this.provisionalStateManager) {
      throw new Error(
        "WorktreeMutationSystem not initialized. Call initialize() first."
      );
    }
    return this.provisionalStateManager;
  }

  /**
   * Shutdown the mutation system
   *
   * Stops all active tracking and cleans up resources.
   * Should be called when server is shutting down.
   */
  shutdown(): void {
    console.log("[WorktreeMutationSystem] Shutting down mutation tracking system");

    if (this.mutationTracker) {
      this.mutationTracker.stopAll();
    }

    // Clear references
    this.fileWatcher = null;
    this.eventBuffer = null;
    this.diffParser = null;
    this.mutationTracker = null;
    this.provisionalStateManager = null;

    console.log("[WorktreeMutationSystem] Shutdown complete");
  }

  /**
   * Reset the singleton instance (for testing)
   *
   * @internal
   */
  static resetInstance(): void {
    if (WorktreeMutationSystem.instance) {
      WorktreeMutationSystem.instance.shutdown();
      WorktreeMutationSystem.instance = null;
    }
  }
}

// Export singleton instance accessor functions

/**
 * Initialize the worktree mutation system
 *
 * @param db - Database instance
 */
export function initializeWorktreeMutationSystem(db: Database.Database): void {
  WorktreeMutationSystem.getInstance().initialize(db);
}

/**
 * Get the mutation tracker instance
 *
 * @returns WorktreeMutationTracker instance
 * @throws Error if system not initialized
 */
export function getMutationTracker(): WorktreeMutationTracker {
  return WorktreeMutationSystem.getInstance().getMutationTracker();
}

/**
 * Get the event buffer instance
 *
 * @returns WorktreeMutationEventBuffer instance
 * @throws Error if system not initialized
 */
export function getEventBuffer(): WorktreeMutationEventBuffer {
  return WorktreeMutationSystem.getInstance().getEventBuffer();
}

/**
 * Get the provisional state manager instance
 *
 * @returns ProvisionalStateManager instance
 * @throws Error if system not initialized
 */
export function getProvisionalStateManager(): ProvisionalStateManager {
  return WorktreeMutationSystem.getInstance().getProvisionalStateManager();
}

/**
 * Check if the worktree mutation system is initialized
 *
 * @returns True if initialized, false otherwise
 */
export function isWorktreeMutationSystemInitialized(): boolean {
  return WorktreeMutationSystem.getInstance().isInitialized();
}

/**
 * Shutdown the worktree mutation system
 */
export function shutdownWorktreeMutationSystem(): void {
  WorktreeMutationSystem.getInstance().shutdown();
}

/**
 * Reset the singleton instance (for testing only)
 *
 * @internal
 */
export function resetWorktreeMutationSystem(): void {
  WorktreeMutationSystem.resetInstance();
}

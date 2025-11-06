/**
 * Worktree Types
 *
 * Type definitions for worktree management system.
 *
 * @module execution/worktree/types
 */

import type { Issue, Spec, EntityType } from "@sudocode-ai/types";

/**
 * Worktree mutation event types
 */
export type WorktreeMutationType =
  | "issue_created"
  | "issue_updated"
  | "issue_deleted"
  | "spec_created"
  | "spec_updated"
  | "spec_deleted"
  | "relationship_created"
  | "relationship_deleted"
  | "tag_added"
  | "tag_removed";

/**
 * Source of the mutation detection
 */
export type MutationSource = "jsonl_diff" | "direct_observation";

/**
 * Represents a single mutation that occurred in a worktree
 */
export interface WorktreeMutationEvent {
  /** Unique event ID (UUID) */
  id: string;

  /** Execution ID this mutation belongs to */
  executionId: string;

  /** Sequence number within this execution (for ordering) */
  sequenceNumber: number;

  /** Type of mutation */
  type: WorktreeMutationType;

  /** Entity type being mutated */
  entityType: EntityType;

  /** Entity ID being mutated */
  entityId: string;

  /** Previous state (null for creates) */
  oldValue: Issue | Spec | null;

  /** New state (null for deletes) */
  newValue: Issue | Spec | null;

  /** Delta/patch (for updates, optional optimization) */
  delta?: Partial<Issue | Spec>;

  /** When this mutation was detected (server time) */
  detectedAt: number;

  /** Source of the mutation (extracted from JSONL or inferred) */
  source: MutationSource;

  /** Optional metadata */
  metadata?: {
    /** Actor who made the change (extracted from updated_by field) */
    actor?: string;

    /** Worktree-local timestamp (from entity's updated_at) */
    updatedAt?: string;

    /** Whether this was an initial state snapshot */
    isSnapshot?: boolean;
  };
}

/**
 * Buffered mutation event with timestamp
 */
export interface BufferedMutationEvent {
  /** The mutation event */
  event: WorktreeMutationEvent;

  /** When the event was buffered */
  bufferedAt: number;
}

/**
 * Worktree event buffer for a single execution
 */
export interface WorktreeEventBuffer {
  /** Execution ID */
  executionId: string;

  /** All mutation events in sequence order */
  events: WorktreeMutationEvent[];

  /** Next sequence number to assign */
  nextSequence: number;

  /** When the buffer was created */
  createdAt: number;

  /** When the buffer was last updated */
  lastUpdatedAt: number;

  /** Initial snapshot of worktree state (captured at execution start) */
  initialSnapshot: {
    issues: Record<string, Issue>;
    specs: Record<string, Spec>;
  };
}

/**
 * Statistics about the event buffer
 */
export interface EventBufferStats {
  /** Number of active buffers */
  bufferCount: number;

  /** Total number of events across all buffers */
  totalEvents: number;

  /** Average events per buffer */
  avgEventsPerBuffer: number;

  /** Oldest buffer creation time */
  oldestBuffer: number | null;

  /** Newest buffer creation time */
  newestBuffer: number | null;
}

/**
 * Worktree creation parameters
 */
export interface WorktreeCreateParams {
  /** Path to the main git repository */
  repoPath: string;
  /** Branch name for the worktree */
  branchName: string;
  /** Where to create the worktree */
  worktreePath: string;
  /** Branch to base the new branch on */
  baseBranch: string;
  /** Whether to create the branch */
  createBranch: boolean;
  /** Commit SHA to branch from */
  commitSha?: string;
}

/**
 * Worktree information returned from git worktree list
 */
export interface WorktreeInfo {
  /** Path to the worktree */
  path: string;
  /** Branch name */
  branch: string;
  /** Git commit hash */
  commit: string;
  /** Whether this is the main worktree */
  isMain: boolean;
  /** Whether the worktree is locked */
  isLocked: boolean;
  /** Reason for lock (if locked) */
  lockReason?: string;
}

/**
 * Worktree configuration (will be implemented in ISSUE-111)
 * Placeholder type for now
 */
export interface WorktreeConfig {
  /** Where to store worktrees */
  worktreeStoragePath: string;
  /** Auto-create branches for new sessions */
  autoCreateBranches: boolean;
  /** Auto-delete branches when session is cleaned up */
  autoDeleteBranches: boolean;
  /** Use sparse-checkout for worktrees */
  enableSparseCheckout: boolean;
  /** Patterns for sparse-checkout */
  sparseCheckoutPatterns?: string[];
  /** Branch naming prefix */
  branchPrefix: string;
  /** Cleanup orphaned worktrees on server startup */
  cleanupOrphanedWorktreesOnStartup: boolean;
}

/**
 * Worktree manager errors
 */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public code: WorktreeErrorCode,
    public cause?: Error
  ) {
    super(message);
    this.name = "WorktreeError";
  }
}

export enum WorktreeErrorCode {
  /** Git operation failed */
  GIT_ERROR = "GIT_ERROR",
  /** Worktree path already exists */
  PATH_EXISTS = "PATH_EXISTS",
  /** Worktree path not found */
  PATH_NOT_FOUND = "PATH_NOT_FOUND",
  /** Invalid path */
  INVALID_PATH = "INVALID_PATH",
  /** Branch not found */
  BRANCH_NOT_FOUND = "BRANCH_NOT_FOUND",
  /** Repository error */
  REPOSITORY_ERROR = "REPOSITORY_ERROR",
  /** Configuration error */
  CONFIG_ERROR = "CONFIG_ERROR",
  /** Locking error */
  LOCK_ERROR = "LOCK_ERROR",
  /** Cleanup failed */
  CLEANUP_FAILED = "CLEANUP_FAILED",
}

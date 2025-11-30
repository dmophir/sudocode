/**
 * Execution artifacts types
 *
 * Types for artifacts created during executions (code changes, outputs, etc.)
 */

/**
 * File change statistics for execution diff
 */
export interface FileChangeStat {
  path: string;
  additions: number;
  deletions: number;
  status: 'A' | 'M' | 'D' | 'R'; // Added, Modified, Deleted, Renamed
}

/**
 * Result of execution changes calculation
 */
export interface ExecutionChangesResult {
  available: boolean;
  reason?: 'missing_commits' | 'commits_not_found' | 'incomplete_execution' | 'git_error' | 'worktree_deleted_with_uncommitted_changes';
  changes?: {
    files: FileChangeStat[];
    summary: {
      totalFiles: number;
      totalAdditions: number;
      totalDeletions: number;
    };
  };
  commitRange?: {
    before: string;
    after: string;
  } | null;
  uncommitted?: boolean;
}

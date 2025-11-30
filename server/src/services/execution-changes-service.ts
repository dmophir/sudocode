/**
 * Execution Changes Service
 *
 * Calculates code changes (file list + diff statistics) from execution commits.
 * Supports 3 scenarios:
 * - Committed changes (commit-to-commit diff)
 * - Uncommitted changes (working tree diff)
 * - No changes
 *
 * @module services/execution-changes-service
 */

import type Database from "better-sqlite3";
import { execSync } from "child_process";
import type {
  ExecutionChangesResult,
  FileChangeStat,
} from "@sudocode-ai/types";
import { getExecution } from "./executions.js";
import { existsSync } from "fs";

/**
 * Service for calculating code changes from execution commits
 */
export class ExecutionChangesService {
  constructor(
    private db: Database.Database,
    private repoPath: string
  ) {}

  /**
   * Get code changes for an execution
   *
   * @param executionId - Execution ID
   * @returns ExecutionChangesResult with files and summary, or unavailable reason
   */
  async getChanges(executionId: string): Promise<ExecutionChangesResult> {
    // 1. Load execution from database
    const execution = getExecution(this.db, executionId);
    if (!execution) {
      return {
        available: false,
        reason: "incomplete_execution",
      };
    }

    // 2. Validate status (must be completed or stopped)
    if (execution.status !== "completed" && execution.status !== "stopped") {
      return {
        available: false,
        reason: "incomplete_execution",
      };
    }

    // 3. Check for before_commit
    if (!execution.before_commit) {
      return {
        available: false,
        reason: "missing_commits",
      };
    }

    // 4. Determine which diff scenario to use
    const hasCommittedChanges =
      execution.after_commit &&
      execution.after_commit !== execution.before_commit;

    if (hasCommittedChanges) {
      // Scenario A: Committed changes
      return this.getCommittedChanges(
        execution.before_commit,
        execution.after_commit!
      );
    } else {
      // Scenario B: Uncommitted changes (or no changes)
      return this.getUncommittedChanges(execution.worktree_path);
    }
  }

  /**
   * Get committed changes (commit-to-commit diff)
   * Scenario A: after_commit exists and differs from before_commit
   */
  private async getCommittedChanges(
    beforeCommit: string,
    afterCommit: string
  ): Promise<ExecutionChangesResult> {
    try {
      // Verify commits exist in repo
      try {
        execSync(`git cat-file -t ${beforeCommit}`, {
          cwd: this.repoPath,
          encoding: "utf-8",
          stdio: "pipe",
        });
        execSync(`git cat-file -t ${afterCommit}`, {
          cwd: this.repoPath,
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (error) {
        return {
          available: false,
          reason: "commits_not_found",
        };
      }

      // Get diff statistics
      const files = await this.calculateDiff(
        beforeCommit,
        afterCommit,
        this.repoPath
      );

      return {
        available: true,
        uncommitted: false,
        commitRange: {
          before: beforeCommit,
          after: afterCommit,
        },
        changes: {
          files,
          summary: this.calculateSummary(files),
        },
      };
    } catch (error) {
      console.error("[ExecutionChangesService] Error getting committed changes:", error);
      return {
        available: false,
        reason: "git_error",
      };
    }
  }

  /**
   * Get uncommitted changes (working tree diff)
   * Scenario B: after_commit is null or equals before_commit
   */
  private async getUncommittedChanges(
    worktreePath: string | null
  ): Promise<ExecutionChangesResult> {
    // Determine the working directory to check
    const workDir = worktreePath || this.repoPath;

    // Check if worktree still exists
    if (worktreePath && !existsSync(worktreePath)) {
      return {
        available: false,
        reason: "worktree_deleted_with_uncommitted_changes",
      };
    }

    try {
      // Get uncommitted changes relative to HEAD
      const files = await this.calculateDiff(null, null, workDir);

      // If no files changed, return empty result
      if (files.length === 0) {
        return {
          available: true,
          uncommitted: true,
          commitRange: null,
          changes: {
            files: [],
            summary: {
              totalFiles: 0,
              totalAdditions: 0,
              totalDeletions: 0,
            },
          },
        };
      }

      return {
        available: true,
        uncommitted: true,
        commitRange: null,
        changes: {
          files,
          summary: this.calculateSummary(files),
        },
      };
    } catch (error) {
      console.error("[ExecutionChangesService] Error getting uncommitted changes:", error);
      return {
        available: false,
        reason: "git_error",
      };
    }
  }

  /**
   * Calculate diff statistics using git commands
   *
   * @param beforeCommit - Before commit SHA (null for uncommitted)
   * @param afterCommit - After commit SHA (null for uncommitted)
   * @param workDir - Working directory for git commands
   * @returns Array of file change statistics
   */
  private async calculateDiff(
    beforeCommit: string | null,
    afterCommit: string | null,
    workDir: string
  ): Promise<FileChangeStat[]> {
    // Build git diff command based on scenario
    let numstatCmd: string;
    let nameStatusCmd: string;

    if (beforeCommit && afterCommit) {
      // Committed changes: commit-to-commit diff
      numstatCmd = `git diff --numstat --find-renames ${beforeCommit}..${afterCommit}`;
      nameStatusCmd = `git diff --name-status --find-renames ${beforeCommit}..${afterCommit}`;
    } else {
      // Uncommitted changes: working tree diff
      numstatCmd = `git diff --numstat --find-renames HEAD`;
      nameStatusCmd = `git diff --name-status --find-renames HEAD`;
    }

    // Execute git diff --numstat
    const numstatOutput = execSync(numstatCmd, {
      cwd: workDir,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    // Execute git diff --name-status
    const nameStatusOutput = execSync(nameStatusCmd, {
      cwd: workDir,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    // Parse outputs
    const numstatData = this.parseNumstat(numstatOutput);
    const statusData = this.parseNameStatus(nameStatusOutput);

    // Combine numstat and status data
    return this.combineFileData(numstatData, statusData);
  }

  /**
   * Parse git diff --numstat output
   *
   * Format: "additions\tdeletions\tfilepath"
   * Binary files: "-\t-\tfilepath"
   */
  private parseNumstat(output: string): Map<string, { additions: number; deletions: number }> {
    const data = new Map<string, { additions: number; deletions: number }>();

    if (!output) {
      return data;
    }

    const lines = output.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split("\t");
      if (parts.length < 3) continue;

      const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
      const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
      const filePath = parts.slice(2).join("\t"); // Handle filenames with tabs

      data.set(filePath, { additions, deletions });
    }

    return data;
  }

  /**
   * Parse git diff --name-status output
   *
   * Format: "STATUS\tfilepath"
   * Renamed files: "R100\toldpath\tnewpath"
   */
  private parseNameStatus(output: string): Map<string, 'A' | 'M' | 'D' | 'R'> {
    const data = new Map<string, 'A' | 'M' | 'D' | 'R'>();

    if (!output) {
      return data;
    }

    const lines = output.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split("\t");
      if (parts.length < 2) continue;

      const statusCode = parts[0];
      let status: 'A' | 'M' | 'D' | 'R';

      if (statusCode.startsWith("A")) {
        status = "A";
      } else if (statusCode.startsWith("M")) {
        status = "M";
      } else if (statusCode.startsWith("D")) {
        status = "D";
      } else if (statusCode.startsWith("R")) {
        status = "R";
      } else {
        // Default to modified for unknown status
        status = "M";
      }

      // For renamed files, use the new path (last part)
      const filePath = parts[parts.length - 1];
      data.set(filePath, status);
    }

    return data;
  }

  /**
   * Combine numstat and name-status data into FileChangeStat array
   */
  private combineFileData(
    numstatData: Map<string, { additions: number; deletions: number }>,
    statusData: Map<string, 'A' | 'M' | 'D' | 'R'>
  ): FileChangeStat[] {
    const files: FileChangeStat[] = [];

    // Iterate through all files from numstat
    for (const [path, { additions, deletions }] of numstatData) {
      const status = statusData.get(path) || "M"; // Default to modified

      files.push({
        path,
        additions,
        deletions,
        status,
      });
    }

    return files;
  }

  /**
   * Calculate summary statistics from file changes
   */
  private calculateSummary(files: FileChangeStat[]): {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  } {
    return {
      totalFiles: files.length,
      totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
      totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
    };
  }
}

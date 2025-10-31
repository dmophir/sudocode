/**
 * Execution Lifecycle Service
 *
 * Centralized service for managing execution lifecycle with worktree integration.
 * Coordinates between WorktreeManager and execution database services.
 *
 * @module services/execution-lifecycle
 */

import path from 'path';
import type Database from 'better-sqlite3';
import type { AgentType, Execution } from '@sudocode/types';
import { WorktreeManager, type IWorktreeManager } from '../execution/worktree/manager.js';
import { getWorktreeConfig } from '../execution/worktree/config.js';
import { createExecution, getExecution, updateExecution } from './executions.js';
import { randomUUID } from 'crypto';

/**
 * Parameters for creating an execution with worktree
 */
export interface CreateExecutionWithWorktreeParams {
  issueId: string;
  issueTitle: string;
  agentType: AgentType;
  targetBranch: string;
  repoPath: string;
}

/**
 * Result of creating an execution with worktree
 */
export interface CreateExecutionWithWorktreeResult {
  execution: Execution;
  worktreePath: string;
  branchName: string;
}

/**
 * ExecutionLifecycleService
 *
 * Manages the full lifecycle of executions with worktree support:
 * - Creating executions with isolated worktrees
 * - Cleaning up executions and associated worktrees
 * - Handling orphaned worktrees
 */
export class ExecutionLifecycleService {
  private worktreeManager: IWorktreeManager;
  private db: Database.Database;
  private repoPath: string;

  /**
   * Create a new ExecutionLifecycleService
   *
   * @param db - Database instance
   * @param repoPath - Path to the git repository
   * @param worktreeManager - Optional worktree manager (defaults to new instance)
   */
  constructor(
    db: Database.Database,
    repoPath: string,
    worktreeManager?: IWorktreeManager
  ) {
    this.db = db;
    this.repoPath = repoPath;

    // Load config and create worktree manager if not provided
    if (worktreeManager) {
      this.worktreeManager = worktreeManager;
    } else {
      const config = getWorktreeConfig(repoPath);
      this.worktreeManager = new WorktreeManager(config);
    }
  }

  /**
   * Create an execution with an isolated worktree
   *
   * Creates a worktree first, then creates the execution record.
   * If worktree creation fails, no execution is created.
   * If execution creation fails, the worktree is cleaned up.
   *
   * @param params - Execution creation parameters
   * @returns Execution with worktree information
   * @throws Error if creation fails
   */
  async createExecutionWithWorktree(
    params: CreateExecutionWithWorktreeParams
  ): Promise<CreateExecutionWithWorktreeResult> {
    const { issueId, issueTitle, agentType, targetBranch, repoPath } = params;
    const config = this.worktreeManager.getConfig();

    // Generate execution ID
    const executionId = randomUUID();

    // Generate branch name: {branchPrefix}/{execution-id}/{sanitized-issue-title}
    const sanitizedTitle = sanitizeForBranchName(issueTitle);
    const branchName = `${config.branchPrefix}/${executionId.substring(0, 8)}/${sanitizedTitle}`;

    // Generate worktree path: {repoPath}/{worktreeStoragePath}/{execution-id}
    const worktreePath = path.join(
      repoPath,
      config.worktreeStoragePath,
      executionId
    );

    let worktreeCreated = false;

    try {
      // Step 1: Create worktree
      await this.worktreeManager.createWorktree({
        repoPath,
        branchName,
        worktreePath,
        baseBranch: targetBranch,
        createBranch: config.autoCreateBranches,
      });

      worktreeCreated = true;

      // Step 2: Create execution record in database
      const execution = createExecution(this.db, {
        id: executionId,
        issue_id: issueId,
        agent_type: agentType,
        target_branch: targetBranch,
        branch_name: branchName,
        worktree_path: worktreePath,
      });

      return {
        execution,
        worktreePath,
        branchName,
      };
    } catch (error) {
      // If worktree was created but execution creation failed, cleanup worktree
      if (worktreeCreated) {
        try {
          await this.worktreeManager.cleanupWorktree(worktreePath, repoPath);
        } catch (cleanupError) {
          // Log cleanup error but throw original error
          console.error(
            `Failed to cleanup worktree after execution creation failure:`,
            cleanupError
          );
        }
      }

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Clean up an execution and its associated worktree
   *
   * Removes the worktree from filesystem and git metadata.
   * Branch deletion is controlled by autoDeleteBranches config.
   *
   * @param executionId - ID of execution to cleanup
   * @throws Error if cleanup fails
   */
  async cleanupExecution(executionId: string): Promise<void> {
    // Get execution from database
    const execution = getExecution(this.db, executionId);

    if (!execution) {
      // Execution doesn't exist, nothing to cleanup
      return;
    }

    // If execution has a worktree path, clean it up
    if (execution.worktree_path) {
      try {
        await this.worktreeManager.cleanupWorktree(
          execution.worktree_path,
          this.repoPath
        );
      } catch (error) {
        // Log error but don't fail - cleanup is best-effort
        console.error(
          `Failed to cleanup worktree for execution ${executionId}:`,
          error
        );
      }
    }

    // Update execution status to mark as cleaned up
    try {
      updateExecution(this.db, executionId, {
        worktree_path: null,
      });
    } catch (error) {
      // Log error but don't fail
      console.error(
        `Failed to update execution ${executionId} after cleanup:`,
        error
      );
    }
  }

  /**
   * Clean up orphaned worktrees
   *
   * Finds worktrees that are registered in git but don't have
   * corresponding execution records, or vice versa.
   *
   * @param repoPath - Path to repository
   */
  async cleanupOrphanedWorktrees(repoPath: string): Promise<void> {
    const config = this.worktreeManager.getConfig();

    try {
      // List all worktrees from git
      const worktrees = await this.worktreeManager.listWorktrees(repoPath);

      // Filter to worktrees in our storage path
      const managedWorktrees = worktrees.filter((w) =>
        w.path.includes(config.worktreeStoragePath)
      );

      // For each managed worktree, check if it has a corresponding execution
      for (const worktree of managedWorktrees) {
        const worktreePath = worktree.path;

        // Try to extract execution ID from path
        const executionId = path.basename(worktreePath);

        // Check if execution exists in database
        const execution = getExecution(this.db, executionId);

        if (!execution) {
          // Orphaned worktree - cleanup
          console.log(
            `Cleaning up orphaned worktree: ${worktreePath} (no execution found)`
          );
          try {
            await this.worktreeManager.cleanupWorktree(worktreePath, repoPath);
          } catch (error) {
            console.error(
              `Failed to cleanup orphaned worktree ${worktreePath}:`,
              error
            );
          }
        } else if (
          execution.status === 'completed' ||
          execution.status === 'failed' ||
          execution.status === 'stopped'
        ) {
          // Execution is finished but worktree still exists - cleanup
          console.log(
            `Cleaning up worktree for finished execution ${executionId} (status: ${execution.status})`
          );
          try {
            await this.worktreeManager.cleanupWorktree(worktreePath, repoPath);
            // Update execution to clear worktree_path
            updateExecution(this.db, executionId, {
              worktree_path: null,
            });
          } catch (error) {
            console.error(
              `Failed to cleanup worktree for finished execution ${executionId}:`,
              error
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to cleanup orphaned worktrees in ${repoPath}:`,
        error
      );
    }
  }
}

/**
 * Sanitize a string to be safe for use in git branch names
 *
 * - Converts to lowercase
 * - Replaces spaces and slashes with hyphens
 * - Removes special characters
 * - Limits length to 50 characters
 *
 * @param str - String to sanitize
 * @returns Sanitized string safe for branch names
 */
export function sanitizeForBranchName(str: string): string {
  return (
    str
      .toLowerCase()
      // Replace spaces and slashes with hyphens
      .replace(/[\s/]+/g, '-')
      // Remove special characters (keep alphanumeric, hyphens, underscores)
      .replace(/[^a-z0-9\-_]/g, '')
      // Remove consecutive hyphens
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
      // Limit length
      .substring(0, 50)
  );
}

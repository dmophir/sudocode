/**
 * Provisional State Manager
 *
 * Applies mutation events on top of main repository state (non-destructive).
 * Computes provisional state by overlaying worktree mutations on base state.
 *
 * @module execution/worktree/provisional-state-manager
 */

import type { Database } from "better-sqlite3";
import type { Issue, Spec } from "@sudocode-ai/types";
import type { WorktreeMutationEventBuffer } from "./mutation-event-buffer.js";
import type {
  WorktreeMutationEvent,
  ProvisionalState,
} from "./types.js";
import { getAllIssues } from "../../services/issues.js";
import { getAllSpecs } from "../../services/specs.js";
import { getExecution } from "../../services/executions.js";

/**
 * Configuration for provisional state computation
 */
export interface ProvisionalStateManagerConfig {
  /** Whether to include deleted entities in the result */
  includeDeleted?: boolean;
}

/**
 * Manages provisional state computation for worktree executions.
 *
 * The ProvisionalStateManager computes a "provisional" view of the repository
 * by applying worktree mutation events on top of the base state from the main
 * repository, without modifying the actual database.
 *
 * This allows the frontend to display real-time changes happening in isolated
 * worktrees before they are merged back into the main repository.
 */
export class ProvisionalStateManager {
  private db: Database;
  private eventBuffer: WorktreeMutationEventBuffer;

  constructor(
    db: Database,
    eventBuffer: WorktreeMutationEventBuffer,
    _config: ProvisionalStateManagerConfig = {}
  ) {
    this.db = db;
    this.eventBuffer = eventBuffer;
    // Config reserved for future use
  }

  /**
   * Compute provisional state for an execution
   *
   * Applies worktree mutations on top of main repository state
   * without modifying the main database.
   *
   * @param executionId - The execution ID to compute state for
   * @returns Provisional state with base + overlay
   */
  computeProvisionalState(executionId: string): ProvisionalState {
    // Get base state from main repository
    const baseIssues = getAllIssues(this.db);
    const baseSpecs = getAllSpecs(this.db);

    // Get mutation events from buffer
    const events = this.eventBuffer.getEvents(executionId);

    // Apply events to compute provisional state
    const provisional = this.applyEvents(
      { issues: baseIssues, specs: baseSpecs },
      events
    );

    // Get execution metadata
    const execution = this.getExecutionMetadata(executionId);

    return {
      base: { issues: baseIssues, specs: baseSpecs },
      provisional,
      execution,
      computedAt: Date.now(),
    };
  }

  /**
   * Apply mutation events to compute provisional overlays
   *
   * Processes events in sequence order and categorizes them into:
   * - Creates: New entities that don't exist in base
   * - Updates: Modified entities that exist in base
   * - Deletes: Entities removed from worktree
   *
   * @param base - Base state from main repository
   * @param events - Mutation events to apply
   * @returns Provisional overlay categorized by operation type
   */
  private applyEvents(
    base: { issues: Issue[]; specs: Spec[] },
    events: WorktreeMutationEvent[]
  ) {
    const issuesCreated: Issue[] = [];
    const issuesUpdated: Array<{
      id: string;
      baseIssue: Issue;
      updatedIssue: Issue;
      delta: Partial<Issue>;
    }> = [];
    const issuesDeleted: string[] = [];

    const specsCreated: Spec[] = [];
    const specsUpdated: Array<{
      id: string;
      baseSpec: Spec;
      updatedSpec: Spec;
      delta: Partial<Spec>;
    }> = [];
    const specsDeleted: string[] = [];

    // Build maps for efficient lookup
    const baseIssuesMap = new Map(base.issues.map((i) => [i.id, i]));
    const baseSpecsMap = new Map(base.specs.map((s) => [s.id, s]));

    // Apply events in sequence order
    for (const event of events) {
      if (event.entityType === "issue") {
        const baseIssue = baseIssuesMap.get(event.entityId);

        switch (event.type) {
          case "issue_created":
            if (event.newValue) {
              issuesCreated.push(event.newValue as Issue);
            }
            break;

          case "issue_updated":
            if (baseIssue && event.newValue) {
              issuesUpdated.push({
                id: event.entityId,
                baseIssue,
                updatedIssue: event.newValue as Issue,
                delta: event.delta as Partial<Issue> || {},
              });
            }
            break;

          case "issue_deleted":
            issuesDeleted.push(event.entityId);
            break;
        }
      } else if (event.entityType === "spec") {
        const baseSpec = baseSpecsMap.get(event.entityId);

        switch (event.type) {
          case "spec_created":
            if (event.newValue) {
              specsCreated.push(event.newValue as Spec);
            }
            break;

          case "spec_updated":
            if (baseSpec && event.newValue) {
              specsUpdated.push({
                id: event.entityId,
                baseSpec,
                updatedSpec: event.newValue as Spec,
                delta: event.delta as Partial<Spec> || {},
              });
            }
            break;

          case "spec_deleted":
            specsDeleted.push(event.entityId);
            break;
        }
      }
    }

    return {
      issuesCreated,
      issuesUpdated,
      issuesDeleted,
      specsCreated,
      specsUpdated,
      specsDeleted,
    };
  }

  /**
   * Get merged view of issues (base + provisional)
   *
   * Computes a single merged array of issues by:
   * 1. Starting with base issues
   * 2. Applying updates
   * 3. Adding created issues
   * 4. Removing deleted issues
   *
   * @param executionId - The execution ID
   * @returns Merged array of issues
   */
  getMergedIssues(executionId: string): Issue[] {
    const provisionalState = this.computeProvisionalState(executionId);

    // Start with base issues (make a copy to avoid mutations)
    const merged = [...provisionalState.base.issues];

    // Apply updates
    for (const update of provisionalState.provisional.issuesUpdated) {
      const index = merged.findIndex((i) => i.id === update.id);
      if (index >= 0) {
        merged[index] = update.updatedIssue;
      }
    }

    // Add created issues
    merged.push(...provisionalState.provisional.issuesCreated);

    // Remove deleted issues
    return merged.filter(
      (i) => !provisionalState.provisional.issuesDeleted.includes(i.id)
    );
  }

  /**
   * Get merged view of specs (base + provisional)
   *
   * Computes a single merged array of specs by:
   * 1. Starting with base specs
   * 2. Applying updates
   * 3. Adding created specs
   * 4. Removing deleted specs
   *
   * @param executionId - The execution ID
   * @returns Merged array of specs
   */
  getMergedSpecs(executionId: string): Spec[] {
    const provisionalState = this.computeProvisionalState(executionId);

    // Start with base specs (make a copy to avoid mutations)
    const merged = [...provisionalState.base.specs];

    // Apply updates
    for (const update of provisionalState.provisional.specsUpdated) {
      const index = merged.findIndex((s) => s.id === update.id);
      if (index >= 0) {
        merged[index] = update.updatedSpec;
      }
    }

    // Add created specs
    merged.push(...provisionalState.provisional.specsCreated);

    // Remove deleted specs
    return merged.filter(
      (s) => !provisionalState.provisional.specsDeleted.includes(s.id)
    );
  }

  /**
   * Get execution metadata for provisional state
   *
   * @param executionId - The execution ID
   * @returns Execution metadata object
   */
  private getExecutionMetadata(executionId: string): ProvisionalState["execution"] {
    const execution = getExecution(this.db, executionId);

    if (!execution) {
      // Return minimal metadata if execution not found
      return {
        id: executionId,
        issueId: null,
        status: "unknown",
        startedAt: null,
        updatedAt: null,
      };
    }

    return {
      id: execution.id,
      issueId: execution.issue_id,
      status: execution.status,
      startedAt: execution.started_at,
      updatedAt: execution.updated_at,
    };
  }

  /**
   * Check if an execution has provisional state
   *
   * @param executionId - The execution ID
   * @returns True if there are any mutation events for this execution
   */
  hasProvisionalState(executionId: string): boolean {
    const events = this.eventBuffer.getEvents(executionId);
    return events.length > 0;
  }

  /**
   * Get summary statistics for provisional state
   *
   * @param executionId - The execution ID
   * @returns Statistics object
   */
  getProvisionalStateStats(executionId: string): {
    totalEvents: number;
    issuesCreated: number;
    issuesUpdated: number;
    issuesDeleted: number;
    specsCreated: number;
    specsUpdated: number;
    specsDeleted: number;
  } {
    const provisionalState = this.computeProvisionalState(executionId);
    const events = this.eventBuffer.getEvents(executionId);

    return {
      totalEvents: events.length,
      issuesCreated: provisionalState.provisional.issuesCreated.length,
      issuesUpdated: provisionalState.provisional.issuesUpdated.length,
      issuesDeleted: provisionalState.provisional.issuesDeleted.length,
      specsCreated: provisionalState.provisional.specsCreated.length,
      specsUpdated: provisionalState.provisional.specsUpdated.length,
      specsDeleted: provisionalState.provisional.specsDeleted.length,
    };
  }
}

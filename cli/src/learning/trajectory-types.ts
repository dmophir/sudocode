/**
 * Trajectory types for tracking agent execution sequences
 */

import type { Issue, Spec } from "../types.js";

/**
 * Action types that agents can take
 */
export type ActionType =
  | "read_file"
  | "write_file"
  | "edit_file"
  | "delete_file"
  | "run_command"
  | "run_tests"
  | "search_code"
  | "search_files"
  | "git_commit"
  | "create_issue"
  | "update_issue"
  | "create_spec"
  | "update_spec"
  | "query_context"
  | "other";

/**
 * A single step in an agent's execution trajectory
 */
export interface TrajectoryStep {
  /** Step number in sequence (0-indexed) */
  step_index: number;

  /** Type of action taken */
  action_type: ActionType;

  /** Target of the action (file path, command, etc.) */
  target?: string;

  /** Additional action details */
  details?: string;

  /** Whether the action succeeded */
  success: boolean;

  /** Error message if action failed */
  error?: string;

  /** Timestamp of the action */
  timestamp: string;

  /** Context size at this step (tokens, if applicable) */
  context_size?: number;

  /** Duration in milliseconds */
  duration_ms?: number;
}

/**
 * Outcome of a trajectory execution
 */
export type TrajectoryOutcome =
  | "success"           // Completed successfully
  | "failure"           // Failed with errors
  | "partial"           // Partially completed
  | "abandoned"         // User cancelled/stopped
  | "timeout";          // Execution timed out

/**
 * Quality metrics for a trajectory
 */
export interface TrajectoryQuality {
  /** Tests passed */
  tests_passed?: number;

  /** Tests failed */
  tests_failed?: number;

  /** Code coverage percentage */
  coverage?: number;

  /** Whether rework was needed after completion */
  rework_needed: boolean;

  /** Whether this was an efficient path */
  efficient_path: boolean;

  /** Mistakes repeated in this execution */
  repeated_mistakes: string[];

  /** Novel/creative solutions used */
  novel_solutions: string[];

  /** Overall quality score (0-100) */
  quality_score?: number;
}

/**
 * Context for the trajectory
 */
export interface TrajectoryContext {
  /** Associated issue */
  issue_id?: string;
  issue_title?: string;

  /** Associated spec */
  spec_id?: string;
  spec_title?: string;

  /** Goal/objective of the execution */
  goal: string;

  /** Initial prompt or task description */
  initial_prompt?: string;

  /** Files that were expected to change */
  target_files?: string[];

  /** Tags/categories */
  tags: string[];
}

/**
 * Complete trajectory record
 */
export interface Trajectory {
  /** Unique trajectory ID */
  id: string;

  /** Agent type that executed this */
  agent_type: "claude-code" | "codex" | "other";

  /** Model used (e.g., claude-sonnet-4-5) */
  model?: string;

  /** Session or execution ID */
  session_id?: string;

  /** Context for this execution */
  context: TrajectoryContext;

  /** Sequence of steps taken */
  steps: TrajectoryStep[];

  /** Final outcome */
  outcome: TrajectoryOutcome;

  /** Quality metrics */
  quality: TrajectoryQuality;

  /** Git information */
  git_info?: {
    start_commit: string;
    end_commit?: string;
    branch?: string;
    files_changed: string[];
  };

  /** Timestamps */
  started_at: string;
  completed_at?: string;

  /** Total duration in milliseconds */
  duration_ms?: number;

  /** Parent trajectory if this is a retry */
  parent_trajectory_id?: string;

  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Simplified trajectory for indexing
 */
export interface TrajectoryIndex {
  id: string;
  issue_id?: string;
  spec_id?: string;
  agent_type: string;
  outcome: TrajectoryOutcome;
  quality_score?: number;
  duration_ms?: number;
  step_count: number;
  tags: string[];
  started_at: string;
  files_changed: string[];
}

/**
 * Action-value estimate for Q-learning
 */
export interface ActionValue {
  /** Context hash for this state */
  context_hash: string;

  /** Action type */
  action_type: ActionType;

  /** Value estimate (higher is better) */
  value: number;

  /** Number of times this action was tried in this context */
  sample_size: number;

  /** Success rate (0-1) */
  success_rate: number;

  /** Average time to completion after this action */
  avg_time_to_completion_ms?: number;

  /** Last updated */
  updated_at: string;
}

/**
 * Trajectory pattern - recurring sequence of actions
 */
export interface TrajectoryPattern {
  /** Pattern ID */
  id: string;

  /** Sequence of action types */
  action_sequence: ActionType[];

  /** How often this pattern appears */
  frequency: number;

  /** Success rate of this pattern */
  success_rate: number;

  /** Average duration */
  avg_duration_ms: number;

  /** Contexts where this pattern works well */
  effective_contexts: string[];

  /** Description of the pattern */
  description?: string;
}

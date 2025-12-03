/**
 * Inspection MCP Tools
 *
 * Implements execution_trajectory and execution_changes tools
 * for the orchestrator agent to inspect execution results.
 */

import type { FileChangeStat } from "@sudocode-ai/types";

import type {
  WorkflowMCPContext,
  ExecutionTrajectoryParams,
  ExecutionChangesParams,
} from "../types.js";
import { ExecutionLogsStore } from "../../../services/execution-logs-store.js";
import { ExecutionChangesService } from "../../../services/execution-changes-service.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Individual trajectory entry
 */
export interface TrajectoryEntry {
  type: "tool_call" | "tool_result" | "message" | "error";
  timestamp: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  content?: string;
}

/**
 * Trajectory summary statistics
 */
export interface TrajectorySummary {
  total_entries: number;
  tool_calls: number;
  errors: number;
  duration_ms?: number;
}

/**
 * execution_trajectory response structure
 */
export interface ExecutionTrajectoryResponse {
  execution_id: string;
  entries: TrajectoryEntry[];
  summary: TrajectorySummary;
}

/**
 * File change info for response
 */
export interface FileChangeInfo {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  diff?: string;
}

/**
 * Commit info for response
 */
export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
}

/**
 * execution_changes response structure
 */
export interface ExecutionChangesResponse {
  execution_id: string;
  files: FileChangeInfo[];
  commits: CommitInfo[];
  summary: {
    files_changed: number;
    total_additions: number;
    total_deletions: number;
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map file status code to readable string
 */
function mapFileStatus(
  status: FileChangeStat["status"]
): FileChangeInfo["status"] {
  switch (status) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * Convert NormalizedEntry to TrajectoryEntry
 * NormalizedEntry is from agent-execution-engine and has variable structure
 */
function normalizedToTrajectoryEntry(entry: unknown): TrajectoryEntry | null {
  if (!entry || typeof entry !== "object") return null;

  const e = entry as Record<string, unknown>;
  const type = e.type as Record<string, unknown> | undefined;

  if (!type || typeof type !== "object") return null;

  const kind = type.kind as string;
  const timestamp = (e.timestamp as string) || new Date().toISOString();

  switch (kind) {
    case "tool_use":
    case "tool_call": {
      const toolUse = type.toolUse as Record<string, unknown> | undefined;
      return {
        type: "tool_call",
        timestamp,
        tool_name: (toolUse?.name as string) || "unknown",
        tool_args: toolUse?.input as Record<string, unknown>,
      };
    }

    case "tool_result": {
      const toolResult = type.toolResult as Record<string, unknown> | undefined;
      return {
        type: "tool_result",
        timestamp,
        tool_name: toolResult?.toolName as string,
        content:
          typeof toolResult?.output === "string"
            ? toolResult.output.substring(0, 500)
            : JSON.stringify(toolResult?.output)?.substring(0, 500),
      };
    }

    case "message":
    case "assistant": {
      const content = e.content as string | undefined;
      return {
        type: "message",
        timestamp,
        content: content?.substring(0, 1000),
      };
    }

    case "error": {
      const errorContent = (e.error || e.content || e.message) as
        | string
        | undefined;
      return {
        type: "error",
        timestamp,
        content:
          typeof errorContent === "string"
            ? errorContent
            : JSON.stringify(errorContent),
      };
    }

    default:
      return null;
  }
}

// =============================================================================
// Tool Handlers
// =============================================================================

/**
 * Handle execution_trajectory tool call.
 *
 * Returns agent actions and tool calls from an execution.
 * Useful for understanding what the agent did and debugging issues.
 */
export async function handleExecutionTrajectory(
  context: WorkflowMCPContext,
  params: ExecutionTrajectoryParams
): Promise<ExecutionTrajectoryResponse> {
  const { db } = context;
  const { execution_id, max_entries = 50 } = params;

  // Get logs from store
  const logsStore = new ExecutionLogsStore(db);
  const normalizedEntries = logsStore.getNormalizedEntries(execution_id);

  // Convert to trajectory entries
  const allEntries: TrajectoryEntry[] = [];
  let toolCalls = 0;
  let errors = 0;
  let firstTimestamp: Date | null = null;
  let lastTimestamp: Date | null = null;

  for (const entry of normalizedEntries) {
    const trajectoryEntry = normalizedToTrajectoryEntry(entry);
    if (trajectoryEntry) {
      allEntries.push(trajectoryEntry);

      // Track stats
      if (trajectoryEntry.type === "tool_call") toolCalls++;
      if (trajectoryEntry.type === "error") errors++;

      // Track timestamps for duration
      const ts = new Date(trajectoryEntry.timestamp);
      if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
      if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
    }
  }

  // Apply limit
  const entries = allEntries.slice(-max_entries);

  // Calculate duration
  let durationMs: number | undefined;
  if (firstTimestamp && lastTimestamp) {
    durationMs = lastTimestamp.getTime() - firstTimestamp.getTime();
  }

  return {
    execution_id,
    entries,
    summary: {
      total_entries: allEntries.length,
      tool_calls: toolCalls,
      errors,
      duration_ms: durationMs,
    },
  };
}

/**
 * Handle execution_changes tool call.
 *
 * Returns code changes made by an execution including files modified and commits.
 */
export async function handleExecutionChanges(
  context: WorkflowMCPContext,
  params: ExecutionChangesParams
): Promise<ExecutionChangesResponse> {
  const { db, repoPath } = context;
  const { execution_id, include_diff: _includeDiff = false } = params;

  // Get changes via service
  const changesService = new ExecutionChangesService(db, repoPath);
  const result = await changesService.getChanges(execution_id);

  if (!result.available) {
    throw new Error(
      `Changes not available for execution ${execution_id}: ${result.reason || "unknown reason"}`
    );
  }

  // Extract file changes
  const snapshot = result.captured || result.current;
  const files: FileChangeInfo[] = (snapshot?.files || []).map((f) => ({
    path: f.path,
    status: mapFileStatus(f.status),
    additions: f.additions,
    deletions: f.deletions,
    // Note: actual diffs require additional git operations
    // For now, we don't include diffs even if requested
    // This could be enhanced to use git show or git diff
  }));

  // TODO: Get commit info from git log
  // For now, return empty commits array - would need to run:
  // git log --format="%H|%s|%an|%aI" before_commit..after_commit
  const commits: CommitInfo[] = [];

  // Build summary
  const summary = snapshot?.summary || {
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };

  return {
    execution_id,
    files,
    commits,
    summary: {
      files_changed: summary.totalFiles,
      total_additions: summary.totalAdditions,
      total_deletions: summary.totalDeletions,
    },
  };
}

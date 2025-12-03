/**
 * Workflow Control MCP Tools
 *
 * Implements workflow_status and workflow_complete tools
 * for the orchestrator agent to manage workflow state.
 */

import type Database from "better-sqlite3";
import type {
  WorkflowStep,
  WorkflowStatus,
  WorkflowSource,
  WorkflowConfig,
  WorkflowRow,
  ExecutionStatus,
} from "@sudocode-ai/types";

import type {
  WorkflowMCPContext,
  WorkflowCompleteParams,
  ToolResult,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Step info returned in workflow_status response
 */
export interface StepInfo {
  id: string;
  issueId: string;
  issueTitle: string;
  status: string;
  executionId?: string;
  dependsOn: string[];
}

/**
 * Active execution info returned in workflow_status response
 */
export interface ActiveExecutionInfo {
  id: string;
  stepId: string;
  status: ExecutionStatus;
  startedAt: string;
}

/**
 * workflow_status response structure
 */
export interface WorkflowStatusResponse {
  workflow: {
    id: string;
    title: string;
    status: WorkflowStatus;
    source: WorkflowSource;
    config: WorkflowConfig;
  };
  steps: StepInfo[];
  activeExecutions: ActiveExecutionInfo[];
  readySteps: string[];
}

/**
 * workflow_complete response structure
 */
export interface WorkflowCompleteResponse extends ToolResult {
  workflow_status: WorkflowStatus;
  completed_at: string;
}

// =============================================================================
// Queries
// =============================================================================

interface IssueQueryRow {
  id: string;
  title: string;
}

interface ExecutionQueryRow {
  id: string;
  status: ExecutionStatus;
  started_at: string;
  workflow_execution_id: string;
}

/**
 * Get workflow by ID with all details
 */
function getWorkflow(db: Database.Database, workflowId: string): WorkflowRow | null {
  const stmt = db.prepare(`
    SELECT * FROM workflows WHERE id = ?
  `);
  return stmt.get(workflowId) as WorkflowRow | null;
}

/**
 * Get issue titles for a list of issue IDs
 */
function getIssueTitles(
  db: Database.Database,
  issueIds: string[]
): Map<string, string> {
  if (issueIds.length === 0) return new Map();

  const placeholders = issueIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT id, title FROM issues WHERE id IN (${placeholders})
  `);
  const rows = stmt.all(...issueIds) as IssueQueryRow[];

  const titles = new Map<string, string>();
  for (const row of rows) {
    titles.set(row.id, row.title);
  }
  return titles;
}

/**
 * Get active executions for a workflow
 */
function getActiveExecutions(
  db: Database.Database,
  workflowId: string
): ExecutionQueryRow[] {
  const stmt = db.prepare(`
    SELECT id, status, started_at, workflow_execution_id
    FROM executions
    WHERE workflow_execution_id = ?
      AND status IN ('pending', 'running', 'paused')
    ORDER BY started_at DESC
  `);
  return stmt.all(workflowId) as ExecutionQueryRow[];
}

/**
 * Update workflow status to complete/failed
 */
function updateWorkflowStatus(
  db: Database.Database,
  workflowId: string,
  status: "completed" | "failed"
): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE workflows
    SET status = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(status, now, now, workflowId);
}

// =============================================================================
// Tool Handlers
// =============================================================================

/**
 * Handle workflow_status tool call.
 *
 * Returns current workflow state including:
 * - Workflow metadata
 * - Step statuses with issue titles
 * - Active executions
 * - Ready steps (dependencies met, not started)
 */
export async function handleWorkflowStatus(
  context: WorkflowMCPContext
): Promise<WorkflowStatusResponse> {
  const { db, workflowId } = context;

  // Get workflow
  const workflowRow = getWorkflow(db, workflowId);
  if (!workflowRow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Parse JSON fields
  const source = JSON.parse(workflowRow.source) as WorkflowSource;
  const config = JSON.parse(workflowRow.config) as WorkflowConfig;
  const steps = JSON.parse(workflowRow.steps) as WorkflowStep[];

  // Get issue titles
  const issueIds = steps.map((s) => s.issueId);
  const issueTitles = getIssueTitles(db, issueIds);

  // Build step execution map
  const stepExecutionMap = new Map<string, string>();
  for (const step of steps) {
    if (step.executionId) {
      stepExecutionMap.set(step.executionId, step.id);
    }
  }

  // Get active executions
  const activeExecRows = getActiveExecutions(db, workflowId);
  const activeExecutions: ActiveExecutionInfo[] = activeExecRows.map((exec) => ({
    id: exec.id,
    stepId: stepExecutionMap.get(exec.id) || "",
    status: exec.status,
    startedAt: exec.started_at,
  }));

  // Build step info
  const stepInfos: StepInfo[] = steps.map((step) => ({
    id: step.id,
    issueId: step.issueId,
    issueTitle: issueTitles.get(step.issueId) || step.issueId,
    status: step.status,
    executionId: step.executionId,
    dependsOn: step.dependencies,
  }));

  // Calculate ready steps (dependencies met, not started)
  const completedStepIds = new Set(
    steps.filter((s) => s.status === "completed").map((s) => s.id)
  );

  const readySteps = steps
    .filter((step) => {
      // Must be pending
      if (step.status !== "pending") return false;
      // All dependencies must be completed
      return step.dependencies.every((depId) => completedStepIds.has(depId));
    })
    .map((s) => s.id);

  return {
    workflow: {
      id: workflowRow.id,
      title: workflowRow.title,
      status: workflowRow.status as WorkflowStatus,
      source,
      config,
    },
    steps: stepInfos,
    activeExecutions,
    readySteps,
  };
}

/**
 * Handle workflow_complete tool call.
 *
 * Marks the workflow as completed or failed with a summary.
 * Validates that workflow is in a completable state.
 */
export async function handleWorkflowComplete(
  context: WorkflowMCPContext,
  params: WorkflowCompleteParams
): Promise<WorkflowCompleteResponse> {
  const { db, workflowId } = context;
  const { summary, status = "completed" } = params;

  // Get workflow
  const workflowRow = getWorkflow(db, workflowId);
  if (!workflowRow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Validate current status
  const currentStatus = workflowRow.status as WorkflowStatus;
  if (currentStatus === "completed" || currentStatus === "failed") {
    throw new Error(
      `Workflow already ${currentStatus}. Cannot complete again.`
    );
  }

  if (currentStatus === "cancelled") {
    throw new Error("Workflow was cancelled. Cannot complete a cancelled workflow.");
  }

  // Check for running executions
  const activeExecs = getActiveExecutions(db, workflowId);
  if (activeExecs.length > 0 && status === "completed") {
    throw new Error(
      `Cannot complete workflow: ${activeExecs.length} execution(s) still active. ` +
        `Cancel them first or use status='failed'.`
    );
  }

  // Update workflow status
  updateWorkflowStatus(db, workflowId, status);

  const completedAt = new Date().toISOString();

  // Log completion
  console.error(
    `[workflow_complete] Workflow ${workflowId} marked as ${status}: ${summary}`
  );

  return {
    success: true,
    workflow_status: status,
    completed_at: completedAt,
  };
}

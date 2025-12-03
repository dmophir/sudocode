/**
 * Orchestrator Workflow Engine
 *
 * Agent-managed workflow execution. The orchestrator is itself an execution
 * (Claude Code agent) that controls workflow steps via MCP tools.
 *
 * Key differences from SequentialWorkflowEngine:
 * - No internal execution loop - orchestrator agent handles execution
 * - Wakeup mechanism - events trigger follow-up executions
 * - MCP tools for step control - orchestrator uses workflow_* and execute_* tools
 */

import path from "path";
import type Database from "better-sqlite3";
import type {
  Workflow,
  WorkflowSource,
  WorkflowConfig,
  Issue,
} from "@sudocode-ai/types";
import { getIssue } from "@sudocode-ai/cli/dist/operations/issues.js";

import { BaseWorkflowEngine } from "../base-workflow-engine.js";
import {
  WorkflowCycleError,
  WorkflowStateError,
  WorkflowStepNotFoundError,
} from "../workflow-engine.js";
import type { WorkflowEventEmitter } from "../workflow-event-emitter.js";
import type { ExecutionService } from "../../services/execution-service.js";
import type { WorkflowWakeupService } from "../services/wakeup-service.js";
import { WorkflowPromptBuilder } from "../services/prompt-builder.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the orchestrator engine.
 */
export interface OrchestratorEngineConfig {
  /** Path to the repository root */
  repoPath: string;
  /** Path to the database file */
  dbPath: string;
  /** Path to the MCP server entry point */
  mcpServerPath?: string;
}

// =============================================================================
// Orchestrator Workflow Engine
// =============================================================================

/**
 * Orchestrator Workflow Engine implementation.
 *
 * This engine spawns an orchestrator agent (Claude Code execution) that controls
 * the workflow using MCP tools. The orchestrator makes decisions about:
 * - Which issues to execute
 * - How to handle failures
 * - When to escalate to the user
 *
 * Events from step executions trigger "wakeups" - follow-up messages to the
 * orchestrator that inform it of completed work.
 *
 * @example
 * ```typescript
 * const engine = new OrchestratorWorkflowEngine({
 *   db,
 *   executionService,
 *   wakeupService,
 *   config: {
 *     repoPath: '/path/to/repo',
 *     dbPath: '/path/to/.sudocode/cache.db',
 *   },
 * });
 *
 * // Create workflow from a goal
 * const workflow = await engine.createWorkflow({
 *   type: "goal",
 *   goal: "Implement user authentication with OAuth"
 * });
 *
 * // Start orchestrator
 * await engine.startWorkflow(workflow.id);
 * ```
 */
export class OrchestratorWorkflowEngine extends BaseWorkflowEngine {
  private executionService: ExecutionService;
  private wakeupService: WorkflowWakeupService;
  private promptBuilder: WorkflowPromptBuilder;
  private config: OrchestratorEngineConfig;

  constructor(deps: {
    db: Database.Database;
    executionService: ExecutionService;
    wakeupService: WorkflowWakeupService;
    eventEmitter?: WorkflowEventEmitter;
    config: OrchestratorEngineConfig;
  }) {
    super(deps.db, deps.eventEmitter);
    this.executionService = deps.executionService;
    this.wakeupService = deps.wakeupService;
    this.promptBuilder = new WorkflowPromptBuilder();
    this.config = deps.config;
  }

  // ===========================================================================
  // Workflow Creation
  // ===========================================================================

  /**
   * Create a new workflow from a source definition.
   *
   * For orchestrator workflows, goal-based sources create empty workflows
   * that the orchestrator populates dynamically.
   *
   * @param source - How to determine workflow scope (spec, issues, root_issue, or goal)
   * @param config - Optional configuration overrides
   * @returns The created workflow
   * @throws WorkflowCycleError if dependency cycles are detected
   */
  async createWorkflow(
    source: WorkflowSource,
    config?: Partial<WorkflowConfig>
  ): Promise<Workflow> {
    // 1. Resolve source to issue IDs
    const issueIds = await this.resolveSource(source);

    // 2. Handle goal-based workflows (no initial issues)
    if (source.type === "goal" && issueIds.length === 0) {
      const workflow = this.buildWorkflow({
        title: this.generateTitle(source),
        source,
        steps: [],
        config: config || {},
      });
      this.saveWorkflow(workflow);
      return workflow;
    }

    // 3. Build dependency graph
    const graph = this.analyzeDependencies(issueIds);

    // 4. Check for cycles
    if (graph.cycles && graph.cycles.length > 0) {
      throw new WorkflowCycleError(graph.cycles);
    }

    // 5. Create steps from graph
    const steps = this.createStepsFromGraph(graph);

    // 6. Build workflow object
    const title = this.generateTitle(source);
    const workflow = this.buildWorkflow({
      title,
      source,
      steps,
      config: config || {},
    });

    // 7. Save to database
    this.saveWorkflow(workflow);

    return workflow;
  }

  // ===========================================================================
  // Workflow Lifecycle
  // ===========================================================================

  /**
   * Start executing a pending workflow.
   *
   * Spawns an orchestrator execution (Claude Code agent) with workflow MCP tools.
   * The orchestrator will use these tools to control step execution.
   *
   * @param workflowId - The workflow to start
   * @throws WorkflowNotFoundError if workflow doesn't exist
   * @throws WorkflowStateError if workflow is not in pending state
   */
  async startWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflowOrThrow(workflowId);

    // Validate state
    if (workflow.status !== "pending") {
      throw new WorkflowStateError(workflowId, workflow.status, "start");
    }

    // Update status to running
    const updated = this.updateWorkflow(workflowId, {
      status: "running",
      startedAt: new Date().toISOString(),
    });

    // Emit workflow started event
    this.eventEmitter.emit({
      type: "workflow_started",
      workflowId,
      workflow: updated,
      timestamp: Date.now(),
    });

    // Spawn orchestrator execution
    await this.spawnOrchestrator(updated);
  }

  /**
   * Pause a running workflow.
   *
   * Sets pause status and records an event. The orchestrator will be notified
   * via wakeup when it checks workflow status.
   *
   * @param workflowId - The workflow to pause
   * @throws WorkflowNotFoundError if workflow doesn't exist
   * @throws WorkflowStateError if workflow is not running
   */
  async pauseWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflowOrThrow(workflowId);

    if (workflow.status !== "running") {
      throw new WorkflowStateError(workflowId, workflow.status, "pause");
    }

    // Update status
    this.updateWorkflow(workflowId, { status: "paused" });

    // Record pause event for orchestrator
    await this.wakeupService.recordEvent({
      workflowId,
      type: "workflow_paused",
      payload: {},
    });

    // Emit event
    this.eventEmitter.emit({
      type: "workflow_paused",
      workflowId,
      timestamp: Date.now(),
    });
  }

  /**
   * Resume a paused workflow.
   *
   * Updates status and triggers immediate wakeup to notify orchestrator.
   *
   * @param workflowId - The workflow to resume
   * @throws WorkflowNotFoundError if workflow doesn't exist
   * @throws WorkflowStateError if workflow is not paused
   */
  async resumeWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflowOrThrow(workflowId);

    if (workflow.status !== "paused") {
      throw new WorkflowStateError(workflowId, workflow.status, "resume");
    }

    // Update status
    this.updateWorkflow(workflowId, { status: "running" });

    // Record resume event and trigger immediate wakeup
    await this.wakeupService.recordEvent({
      workflowId,
      type: "workflow_resumed",
      payload: {},
    });

    // Trigger immediate wakeup
    await this.wakeupService.triggerWakeup(workflowId);

    // Emit event
    this.eventEmitter.emit({
      type: "workflow_resumed",
      workflowId,
      timestamp: Date.now(),
    });
  }

  /**
   * Cancel a workflow, stopping the orchestrator and any running executions.
   *
   * @param workflowId - The workflow to cancel
   * @throws WorkflowNotFoundError if workflow doesn't exist
   * @throws WorkflowStateError if workflow is already completed/failed/cancelled
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflowOrThrow(workflowId);

    // Check if already in terminal state
    if (["completed", "failed", "cancelled"].includes(workflow.status)) {
      throw new WorkflowStateError(workflowId, workflow.status, "cancel");
    }

    // Cancel orchestrator execution if running
    if (workflow.orchestratorExecutionId) {
      try {
        await this.executionService.cancelExecution(
          workflow.orchestratorExecutionId
        );
      } catch (error) {
        console.warn(
          `Failed to cancel orchestrator execution ${workflow.orchestratorExecutionId}:`,
          error
        );
      }
    }

    // Cancel pending wakeup
    this.wakeupService.cancelPendingWakeup(workflowId);

    // Find and cancel any running step executions
    await this.cancelRunningExecutions(workflow);

    // Update status
    this.updateWorkflow(workflowId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });

    // Emit event
    this.eventEmitter.emit({
      type: "workflow_cancelled",
      workflowId,
      timestamp: Date.now(),
    });
  }

  // ===========================================================================
  // Step Control
  // ===========================================================================

  /**
   * Retry a failed step.
   *
   * Records an event for the orchestrator to handle.
   * The orchestrator decides how to actually retry.
   *
   * @param workflowId - The workflow containing the step
   * @param stepId - The step to retry
   * @throws WorkflowNotFoundError if workflow doesn't exist
   * @throws WorkflowStepNotFoundError if step doesn't exist
   */
  async retryStep(workflowId: string, stepId: string): Promise<void> {
    const workflow = await this.getWorkflowOrThrow(workflowId);
    const step = workflow.steps.find((s) => s.id === stepId);

    if (!step) {
      throw new WorkflowStepNotFoundError(workflowId, stepId);
    }

    // Record event for orchestrator
    await this.wakeupService.recordEvent({
      workflowId,
      type: "step_started", // Re-use step_started as retry signal
      stepId,
      payload: {
        action: "retry",
        issueId: step.issueId,
      },
    });
  }

  /**
   * Skip a step.
   *
   * Records an event for the orchestrator to handle.
   * The orchestrator decides how to handle dependents.
   *
   * @param workflowId - The workflow containing the step
   * @param stepId - The step to skip
   * @param reason - Optional reason for skipping
   * @throws WorkflowNotFoundError if workflow doesn't exist
   * @throws WorkflowStepNotFoundError if step doesn't exist
   */
  async skipStep(
    workflowId: string,
    stepId: string,
    reason?: string
  ): Promise<void> {
    const workflow = await this.getWorkflowOrThrow(workflowId);
    const step = workflow.steps.find((s) => s.id === stepId);

    if (!step) {
      throw new WorkflowStepNotFoundError(workflowId, stepId);
    }

    // Record event for orchestrator
    await this.wakeupService.recordEvent({
      workflowId,
      type: "step_skipped",
      stepId,
      payload: {
        action: "skip",
        issueId: step.issueId,
        reason: reason || "Manually skipped",
      },
    });
  }

  // ===========================================================================
  // Escalation
  // ===========================================================================

  /**
   * Trigger a wakeup for an escalation response.
   *
   * Called by the API when a user responds to an escalation.
   * Immediately triggers the orchestrator to resume with the response.
   *
   * @param workflowId - The workflow to wake up
   */
  async triggerEscalationWakeup(workflowId: string): Promise<void> {
    await this.wakeupService.triggerWakeup(workflowId);
  }

  // ===========================================================================
  // Private: Orchestrator Spawning
  // ===========================================================================

  /**
   * Spawn an orchestrator execution (Claude Code agent).
   *
   * The orchestrator is given:
   * - Workflow MCP tools for control
   * - Initial prompt with workflow context
   * - Access to sudocode MCP tools for issue management
   */
  private async spawnOrchestrator(workflow: Workflow): Promise<void> {
    // Get issues for initial prompt
    const issues = this.getIssuesForWorkflow(workflow);

    // Build initial prompt
    const prompt = this.promptBuilder.buildInitialPrompt(workflow, issues);

    // Build agent config with MCP servers
    const agentConfig = this.buildOrchestratorConfig(workflow);

    // Determine agent type (default to claude-code)
    const agentType = workflow.config.orchestratorAgentType ?? "claude-code";

    // Create orchestrator execution
    const execution = await this.executionService.createExecution(
      null, // No issue - this is the orchestrator itself
      {
        mode: "local", // Orchestrator runs in main repo
        baseBranch: workflow.baseBranch,
        ...agentConfig,
      },
      prompt,
      agentType
    );

    // Store orchestrator execution ID and session ID on workflow
    this.updateWorkflow(workflow.id, {
      orchestratorExecutionId: execution.id,
      orchestratorSessionId: execution.session_id,
    });
  }

  /**
   * Build the orchestrator agent configuration.
   *
   * Configures MCP servers for workflow control and sudocode access.
   */
  private buildOrchestratorConfig(workflow: Workflow): {
    mcpServers?: Record<string, unknown>;
    model?: string;
    appendSystemPrompt?: string;
  } {
    const config: {
      mcpServers?: Record<string, unknown>;
      model?: string;
      appendSystemPrompt?: string;
    } = {};

    // Add workflow MCP server
    const mcpServerPath =
      this.config.mcpServerPath ||
      path.join(__dirname, "../mcp/index.js");

    config.mcpServers = {
      "sudocode-workflow": {
        command: "node",
        args: [
          mcpServerPath,
          "--workflow-id",
          workflow.id,
          "--db-path",
          this.config.dbPath,
          "--repo-path",
          this.config.repoPath,
        ],
      },
    };

    // Set model if specified
    if (workflow.config.orchestratorModel) {
      config.model = workflow.config.orchestratorModel;
    }

    // Add system prompt extension for orchestrator role
    config.appendSystemPrompt = `
You are a workflow orchestrator managing the execution of coding tasks.
You have access to workflow MCP tools to control execution flow.

IMPORTANT: You are orchestrating workflow "${workflow.id}".
Use the workflow tools to:
- Check workflow status with workflow_status
- Execute issues with execute_issue
- Inspect results with execution_trajectory and execution_changes
- Handle failures appropriately based on the workflow config
- Mark the workflow complete when done with workflow_complete
`;

    return config;
  }

  /**
   * Get issues for the workflow (for initial prompt).
   */
  private getIssuesForWorkflow(workflow: Workflow): Issue[] {
    const issues: Issue[] = [];

    for (const step of workflow.steps) {
      const issue = getIssue(this.db, step.issueId);
      if (issue) {
        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * Cancel all running step executions for a workflow.
   */
  private async cancelRunningExecutions(workflow: Workflow): Promise<void> {
    // Find executions linked to this workflow
    const executions = this.db
      .prepare(
        `
        SELECT id FROM executions
        WHERE workflow_execution_id = ?
          AND status IN ('pending', 'running', 'preparing')
      `
      )
      .all(workflow.id) as Array<{ id: string }>;

    for (const { id } of executions) {
      try {
        await this.executionService.cancelExecution(id);
      } catch (error) {
        console.warn(`Failed to cancel execution ${id}:`, error);
      }
    }
  }
}

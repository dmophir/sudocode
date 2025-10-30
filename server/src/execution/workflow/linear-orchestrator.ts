/**
 * Linear Workflow Orchestrator Implementation
 *
 * Executes workflow steps sequentially with state management and checkpointing.
 *
 * @module execution/workflow/linear-orchestrator
 */

import type { IWorkflowOrchestrator, IWorkflowStorage } from './orchestrator.js';
import type { IResilientExecutor } from '../resilience/executor.js';
import type { ResilientExecutionResult } from '../resilience/types.js';
import type { ExecutionTask } from '../engine/types.js';
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowExecution,
  WorkflowCheckpoint,
  StepStatus,
  WorkflowStartHandler,
  WorkflowCompleteHandler,
  WorkflowFailedHandler,
  StepStartHandler,
  StepCompleteHandler,
  StepFailedHandler,
  WorkflowCheckpointHandler,
  WorkflowResumeHandler,
  WorkflowPauseHandler,
  WorkflowCancelHandler,
} from './types.js';
import {
  renderTemplate,
  generateId,
  extractValue,
  evaluateCondition,
} from './utils.js';

/**
 * LinearOrchestrator - Sequential workflow execution with state management
 *
 * Implements the IWorkflowOrchestrator interface to provide:
 * - Sequential step execution
 * - State persistence via checkpoints
 * - Crash recovery and resumption
 * - Event-driven monitoring
 */
export class LinearOrchestrator implements IWorkflowOrchestrator {
  // Internal state
  private _executions = new Map<string, WorkflowExecution>();
  private _storage?: IWorkflowStorage;
  private _executor: IResilientExecutor;

  // Event handlers
  private _workflowStartHandlers: WorkflowStartHandler[] = [];
  private _workflowCompleteHandlers: WorkflowCompleteHandler[] = [];
  private _workflowFailedHandlers: WorkflowFailedHandler[] = [];
  private _stepStartHandlers: StepStartHandler[] = [];
  private _stepCompleteHandlers: StepCompleteHandler[] = [];
  private _stepFailedHandlers: StepFailedHandler[] = [];
  private _checkpointHandlers: WorkflowCheckpointHandler[] = [];
  private _resumeHandlers: WorkflowResumeHandler[] = [];
  private _pauseHandlers: WorkflowPauseHandler[] = [];
  private _cancelHandlers: WorkflowCancelHandler[] = [];

  /**
   * Create a new LinearOrchestrator
   *
   * @param executor - Resilient executor for running tasks
   * @param storage - Optional storage for checkpoints
   */
  constructor(executor: IResilientExecutor, storage?: IWorkflowStorage) {
    this._executor = executor;
    this._storage = storage;
  }

  /**
   * Start a new workflow execution
   *
   * @param workflow - Workflow definition to execute
   * @param workDir - Working directory for task execution
   * @param options - Execution options
   * @returns Promise resolving to execution ID
   */
  async startWorkflow(
    _workflow: WorkflowDefinition,
    _workDir: string,
    _options?: {
      checkpointInterval?: number;
      initialContext?: Record<string, any>;
    }
  ): Promise<string> {
    // Implementation in ISSUE-084
    throw new Error('Not implemented yet');
  }

  /**
   * Resume a workflow from a checkpoint
   *
   * @param executionId - Execution ID to resume
   * @param options - Resume options
   * @returns Promise resolving to execution ID
   */
  async resumeWorkflow(
    _executionId: string,
    _options?: {
      checkpointInterval?: number;
    }
  ): Promise<string> {
    // Implementation in ISSUE-085
    throw new Error('Not implemented yet');
  }

  /**
   * Pause a running workflow
   *
   * @param executionId - Execution ID to pause
   */
  async pauseWorkflow(executionId: string): Promise<void> {
    const execution = this._executions.get(executionId);
    if (!execution) {
      return; // Silently ignore non-existent executions
    }

    if (execution.status !== 'running') {
      throw new Error(
        `Cannot pause workflow in ${execution.status} state`
      );
    }

    execution.status = 'paused';
    execution.pausedAt = new Date();

    // Emit pause event
    this._pauseHandlers.forEach((handler) => {
      handler(executionId);
    });
  }

  /**
   * Cancel a running workflow
   *
   * @param executionId - Execution ID to cancel
   */
  async cancelWorkflow(executionId: string): Promise<void> {
    const execution = this._executions.get(executionId);
    if (!execution) {
      return; // Silently ignore non-existent executions
    }

    if (['completed', 'cancelled'].includes(execution.status)) {
      return; // Already done
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date();

    // Emit cancel event
    this._cancelHandlers.forEach((handler) => {
      handler(executionId);
    });
  }

  /**
   * Get current execution state
   *
   * @param executionId - Execution ID to query
   * @returns Execution state or null if not found
   */
  getExecution(executionId: string): WorkflowExecution | null {
    return this._executions.get(executionId) || null;
  }

  /**
   * Get status of a specific step
   *
   * @param executionId - Execution ID
   * @param stepId - Step ID to query
   * @returns Step status or null if not found
   */
  getStepStatus(executionId: string, stepId: string): StepStatus | null {
    const execution = this._executions.get(executionId);
    if (!execution) {
      return null;
    }

    // Find step index
    const stepIndex = execution.definition.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) {
      return null;
    }

    // Determine status based on execution state
    let status: StepStatus['status'];
    const result = execution.stepResults[stepIndex];

    if (stepIndex < execution.currentStepIndex) {
      // Step already executed
      status = result?.success ? 'completed' : 'failed';
    } else if (stepIndex === execution.currentStepIndex) {
      // Currently executing
      status = 'running';
    } else {
      // Not yet executed
      status = 'pending';
    }

    return {
      stepId,
      status,
      result,
      attempts: 1, // TODO: Track actual attempts
    };
  }

  /**
   * Wait for workflow to complete
   *
   * @param executionId - Execution ID to wait for
   * @returns Promise resolving to workflow execution
   */
  async waitForWorkflow(_executionId: string): Promise<WorkflowExecution> {
    // Implementation in ISSUE-086
    throw new Error('Not implemented yet');
  }

  /**
   * List all checkpoints for a workflow
   *
   * @param workflowId - Optional workflow ID to filter by
   * @returns Promise resolving to list of checkpoints
   */
  async listCheckpoints(workflowId?: string): Promise<WorkflowCheckpoint[]> {
    if (!this._storage) {
      return [];
    }

    return this._storage.listCheckpoints(workflowId);
  }

  /**
   * Register handler for workflow start events
   */
  onWorkflowStart(handler: WorkflowStartHandler): void {
    this._workflowStartHandlers.push(handler);
  }

  /**
   * Register handler for workflow completion events
   */
  onWorkflowComplete(handler: WorkflowCompleteHandler): void {
    this._workflowCompleteHandlers.push(handler);
  }

  /**
   * Register handler for workflow failure events
   */
  onWorkflowFailed(handler: WorkflowFailedHandler): void {
    this._workflowFailedHandlers.push(handler);
  }

  /**
   * Register handler for step start events
   */
  onStepStart(handler: StepStartHandler): void {
    this._stepStartHandlers.push(handler);
  }

  /**
   * Register handler for step completion events
   */
  onStepComplete(handler: StepCompleteHandler): void {
    this._stepCompleteHandlers.push(handler);
  }

  /**
   * Register handler for step failure events
   */
  onStepFailed(handler: StepFailedHandler): void {
    this._stepFailedHandlers.push(handler);
  }

  /**
   * Register handler for checkpoint events
   */
  onCheckpoint(handler: WorkflowCheckpointHandler): void {
    this._checkpointHandlers.push(handler);
  }

  /**
   * Register handler for resume events
   */
  onResume(handler: WorkflowResumeHandler): void {
    this._resumeHandlers.push(handler);
  }

  /**
   * Register handler for pause events
   */
  onPause(handler: WorkflowPauseHandler): void {
    this._pauseHandlers.push(handler);
  }

  /**
   * Register handler for cancel events
   */
  onCancel(handler: WorkflowCancelHandler): void {
    this._cancelHandlers.push(handler);
  }

  /**
   * Execute a single workflow step
   *
   * @param step - Workflow step to execute
   * @param execution - Current workflow execution state
   * @param workDir - Working directory for task execution
   * @returns Promise resolving to execution result
   * @private
   */
  // @ts-expect-error - Will be used in workflow execution (ISSUE-084)
  private async _executeStep(
    step: WorkflowStep,
    execution: WorkflowExecution,
    workDir: string
  ): Promise<ResilientExecutionResult> {
    // 1. Render prompt template with context
    const prompt = renderTemplate(step.prompt, execution.context);

    // 2. Build execution task
    const task: ExecutionTask = {
      id: generateId('task'),
      type: step.taskType,
      prompt,
      workDir,
      priority: 0,
      dependencies: [],
      createdAt: new Date(),
      config: step.taskConfig || {},
    };

    // 3. Execute with resilience (includes retry logic)
    const result = await this._executor.executeTask(task, step.retryPolicy);

    return result;
  }

  /**
   * Apply output mapping from step result to workflow context
   *
   * @param step - Workflow step with output mapping
   * @param result - Execution result from step
   * @param context - Workflow context to update
   * @private
   */
  // @ts-expect-error - Will be used in workflow execution (ISSUE-084)
  private _applyOutputMapping(
    step: WorkflowStep,
    result: ResilientExecutionResult,
    context: Record<string, any>
  ): void {
    if (!step.outputMapping) {
      return;
    }

    // Map each output from result to context
    for (const [contextKey, resultPath] of Object.entries(step.outputMapping)) {
      const value = extractValue(result, resultPath);
      context[contextKey] = value;
    }
  }

  /**
   * Check if all step dependencies are met
   *
   * @param step - Workflow step to check
   * @param execution - Current workflow execution state
   * @returns True if all dependencies are met, false otherwise
   * @private
   */
  // @ts-expect-error - Will be used in workflow execution (ISSUE-084)
  private _areDependenciesMet(
    step: WorkflowStep,
    execution: WorkflowExecution
  ): boolean {
    if (!step.dependencies || step.dependencies.length === 0) {
      return true; // No dependencies
    }

    // Check if all dependencies are in completed steps
    for (const depId of step.dependencies) {
      const depIndex = execution.definition.steps.findIndex((s) => s.id === depId);
      if (depIndex === -1) {
        // Dependency not found in workflow
        return false;
      }

      if (depIndex >= execution.currentStepIndex) {
        // Dependency hasn't been executed yet
        return false;
      }

      const depResult = execution.stepResults[depIndex];
      if (!depResult || !depResult.success) {
        // Dependency failed or hasn't completed
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a step condition
   *
   * @param step - Workflow step with condition
   * @param context - Workflow context
   * @returns True if condition evaluates to true or no condition exists
   * @private
   */
  // @ts-expect-error - Will be used in workflow execution (ISSUE-084)
  private _shouldExecuteStep(
    step: WorkflowStep,
    context: Record<string, any>
  ): boolean {
    if (!step.condition) {
      return true; // No condition means always execute
    }

    return evaluateCondition(step.condition, context);
  }
}

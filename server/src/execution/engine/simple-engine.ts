/**
 * Simple Execution Engine
 *
 * Queue-based execution engine that spawns a process per task
 * with concurrency limits. Implements the "simple first" approach.
 *
 * @module execution/engine/simple-engine
 */

import type { IExecutionEngine } from './engine.js';
import type {
  ExecutionTask,
  ExecutionResult,
  TaskStatus,
  EngineMetrics,
  TaskCompleteHandler,
  TaskFailedHandler,
  EngineConfig,
  RunningTask,
  TaskResolver,
} from './types.js';
import type { IProcessManager } from '../process/manager.js';

/**
 * SimpleExecutionEngine - Queue-based task execution with concurrency control
 *
 * Key features:
 * - FIFO queue for task ordering
 * - Configurable concurrency limit (default: 3)
 * - Automatic retry on failure
 * - Event emission for task lifecycle
 * - Promise-based waiting
 * - Graceful shutdown
 */
export class SimpleExecutionEngine implements IExecutionEngine {
  // Task queue (FIFO)
  private taskQueue: ExecutionTask[] = [];

  // Running tasks tracking
  private runningTasks = new Map<string, RunningTask>();

  // Completed task results
  private completedResults = new Map<string, ExecutionResult>();

  // Promise resolvers for waiting
  private taskResolvers = new Map<string, TaskResolver>();

  // Engine metrics
  private metrics: EngineMetrics;

  // Event handlers
  private completeHandlers: TaskCompleteHandler[] = [];
  private failedHandlers: TaskFailedHandler[] = [];

  /**
   * Create a new SimpleExecutionEngine
   *
   * @param processManager - Process manager for spawning Claude processes
   * @param config - Engine configuration options
   */
  constructor(
    // @ts-expect-error - processManager will be used in ISSUE-053 (task execution)
    private _processManager: IProcessManager,
    // @ts-expect-error - config will be used in future implementations
    private _config: EngineConfig = {}
  ) {
    // Initialize metrics
    this.metrics = {
      maxConcurrent: _config.maxConcurrent ?? 3,
      currentlyRunning: 0,
      availableSlots: _config.maxConcurrent ?? 3,
      queuedTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      successRate: 1.0,
      throughput: 0,
      totalProcessesSpawned: 0,
      activeProcesses: 0,
    };
  }

  /**
   * Submit a single task for execution
   *
   * Adds task to queue and attempts to start execution if capacity available.
   *
   * @param task - The task to execute
   * @returns Promise resolving to the task ID
   */
  async submitTask(task: ExecutionTask): Promise<string> {
    // Add to queue
    this.taskQueue.push(task);
    this.metrics.queuedTasks++;

    // Try to start immediately if capacity available
    this.processQueue();

    return task.id;
  }

  /**
   * Submit multiple tasks for execution
   *
   * @param tasks - Array of tasks to execute
   * @returns Promise resolving to array of task IDs
   */
  async submitTasks(tasks: ExecutionTask[]): Promise<string[]> {
    const ids: string[] = [];

    for (const task of tasks) {
      const id = await this.submitTask(task);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Process the task queue
   *
   * Dequeues tasks and starts execution while capacity is available.
   * Checks dependencies before execution and re-queues if not met.
   *
   * @private
   */
  private processQueue(): void {
    // Check if we have capacity and tasks to process
    while (
      this.taskQueue.length > 0 &&
      this.runningTasks.size < this.metrics.maxConcurrent
    ) {
      const task = this.taskQueue.shift()!;
      this.metrics.queuedTasks--;

      // Check dependencies (will implement in ISSUE-054)
      if (!this.areDependenciesMet(task)) {
        // Re-queue at end
        this.taskQueue.push(task);
        this.metrics.queuedTasks++;
        break; // Stop processing to avoid infinite loop
      }

      // Start execution (will implement in ISSUE-053)
      this.executeTask(task).catch((error) => {
        this.handleTaskFailure(task.id, error);
      });
    }
  }

  /**
   * Check if all task dependencies are met
   *
   * @param task - Task to check
   * @returns True if all dependencies completed successfully
   * @private
   */
  private areDependenciesMet(task: ExecutionTask): boolean {
    // Stub for now - will implement in ISSUE-054
    // For now, assume no dependencies or all met
    for (const depId of task.dependencies) {
      const result = this.completedResults.get(depId);
      if (!result || !result.success) {
        return false;
      }
    }
    return true;
  }

  /**
   * Execute a task
   *
   * Stub for now - will implement in ISSUE-053
   *
   * @param task - Task to execute
   * @private
   */
  private async executeTask(_task: ExecutionTask): Promise<void> {
    // TODO: Implement in ISSUE-053
    throw new Error('executeTask not yet implemented');
  }

  /**
   * Handle task failure
   *
   * Stub for now - will implement with retry logic in ISSUE-055
   *
   * @param taskId - ID of failed task
   * @param error - Error that occurred
   * @private
   */
  private handleTaskFailure(_taskId: string, _error: Error): void {
    // TODO: Implement in ISSUE-055
    this.metrics.failedTasks++;

    // Resolve promise with error
    const resolver = this.taskResolvers.get(_taskId);
    if (resolver) {
      resolver.reject(_error);
      this.taskResolvers.delete(_taskId);
    }

    // Emit event
    for (const handler of this.failedHandlers) {
      handler(_taskId, _error);
    }
  }

  /**
   * Cancel a queued or running task
   *
   * Stub for now - will implement in ISSUE-059
   */
  async cancelTask(_taskId: string): Promise<void> {
    // TODO: Implement in ISSUE-059
    throw new Error('cancelTask not yet implemented');
  }

  /**
   * Get current status of a task
   *
   * Stub for now - will implement in ISSUE-057
   */
  getTaskStatus(taskId: string): TaskStatus | null {
    // TODO: Implement in ISSUE-057
    // Check completed
    const result = this.completedResults.get(taskId);
    if (result) {
      return { state: 'completed', result };
    }

    // Check running
    const running = this.runningTasks.get(taskId);
    if (running) {
      return {
        state: 'running',
        processId: running.process.id,
        startedAt: running.startedAt,
      };
    }

    // Check queued
    const queuePos = this.taskQueue.findIndex((t) => t.id === taskId);
    if (queuePos >= 0) {
      return { state: 'queued', position: queuePos };
    }

    return null;
  }

  /**
   * Wait for a task to complete
   *
   * Stub for now - will implement in ISSUE-060
   */
  async waitForTask(taskId: string): Promise<ExecutionResult> {
    // TODO: Implement in ISSUE-060
    // Check if already completed
    const existing = this.completedResults.get(taskId);
    if (existing) return existing;

    // Wait for completion
    return new Promise((resolve, reject) => {
      this.taskResolvers.set(taskId, { resolve, reject });
    });
  }

  /**
   * Wait for multiple tasks to complete
   *
   * Stub for now - will implement in ISSUE-060
   */
  async waitForTasks(taskIds: string[]): Promise<ExecutionResult[]> {
    // TODO: Implement in ISSUE-060
    return Promise.all(taskIds.map((id) => this.waitForTask(id)));
  }

  /**
   * Get current engine metrics
   *
   * Returns defensive copy of current metrics.
   *
   * @returns Current engine metrics
   */
  getMetrics(): EngineMetrics {
    // Return defensive copy
    return { ...this.metrics };
  }

  /**
   * Register handler for task completion events
   */
  onTaskComplete(handler: TaskCompleteHandler): void {
    this.completeHandlers.push(handler);
  }

  /**
   * Register handler for task failure events
   */
  onTaskFailed(handler: TaskFailedHandler): void {
    this.failedHandlers.push(handler);
  }

  /**
   * Gracefully shutdown the engine
   *
   * Stub for now - will implement in ISSUE-061
   */
  async shutdown(): Promise<void> {
    // TODO: Implement in ISSUE-061
    throw new Error('shutdown not yet implemented');
  }
}

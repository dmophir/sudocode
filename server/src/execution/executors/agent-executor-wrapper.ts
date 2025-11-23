/**
 * AgentExecutorWrapper - Generic wrapper for any agent adapter
 *
 * Provides a simplified execution interface that works with any IAgentAdapter.
 * For production Claude Code executions, ClaudeExecutorWrapper is still used
 * due to its specialized protocol handling.
 *
 * @module execution/executors/agent-executor-wrapper
 */

import type { IAgentAdapter } from 'agent-execution-engine/agents';
import type { BaseAgentConfig } from '@sudocode-ai/types/agents';
import type { ProcessConfig } from 'agent-execution-engine/process';
import type Database from 'better-sqlite3';
import type { ExecutionTask } from 'agent-execution-engine/engine';
import type { ExecutionLifecycleService } from '../../services/execution-lifecycle.js';
import type { ExecutionLogsStore } from '../../services/execution-logs-store.js';
import type { TransportManager } from '../transport/transport-manager.js';
import {
  updateExecution,
  getExecution,
} from '../../services/executions.js';
import { broadcastExecutionUpdate } from '../../services/websocket.js';

/**
 * Configuration for AgentExecutorWrapper
 */
export interface AgentExecutorWrapperConfig<TConfig extends BaseAgentConfig> {
  adapter: IAgentAdapter<TConfig>;
  agentConfig: TConfig;
  lifecycleService: ExecutionLifecycleService;
  logsStore: ExecutionLogsStore;
  projectId: string;
  db: Database.Database;
  transportManager?: TransportManager;
}

/**
 * Generic wrapper for any agent adapter
 *
 * Provides basic execution lifecycle management for any agent that implements
 * IAgentAdapter. This is a simplified version compared to ClaudeExecutorWrapper,
 * which has specialized logic for Claude Code's protocol peer.
 *
 * @example
 * ```typescript
 * const wrapper = new AgentExecutorWrapper({
 *   adapter: codexAdapter,
 *   agentConfig: {
 *     workDir: '/path/to/repo',
 *     apiKey: 'sk-...',
 *     model: 'code-davinci-002',
 *   },
 *   lifecycleService,
 *   logsStore,
 *   projectId: 'my-project',
 *   db,
 *   transportManager,
 * });
 *
 * await wrapper.executeWithLifecycle(executionId, task, workDir);
 * ```
 */
export class AgentExecutorWrapper<TConfig extends BaseAgentConfig> {
  private adapter: IAgentAdapter<TConfig>;
  private _agentConfig: TConfig; // TODO: Use when implementing full execution
  private _logsStore: ExecutionLogsStore; // TODO: Use when implementing full execution
  private transportManager?: TransportManager;
  private projectId: string;
  private db: Database.Database;
  private processConfig: ProcessConfig;

  constructor(config: AgentExecutorWrapperConfig<TConfig>) {
    this.adapter = config.adapter;
    this._agentConfig = config.agentConfig;
    this._logsStore = config.logsStore;
    this.transportManager = config.transportManager;
    this.projectId = config.projectId;
    this.db = config.db;

    // Build process configuration from agent-specific config
    this.processConfig = this.adapter.buildProcessConfig(this._agentConfig);

    console.log('[AgentExecutorWrapper] Initialized', {
      agentType: this.adapter.metadata.name,
      projectId: this.projectId,
      workDir: this.processConfig.workDir,
      hasTransport: !!this.transportManager,
      hasLogsStore: !!this._logsStore,
    });
  }

  /**
   * Execute a task with full lifecycle management
   *
   * @param executionId - Unique execution identifier
   * @param task - Task to execute
   * @param workDir - Working directory for execution
   *
   * Note: This is a simplified implementation that doesn't use the full
   * agent-execution-engine executor infrastructure. For production Claude Code
   * executions, use ClaudeExecutorWrapper instead.
   */
  async executeWithLifecycle(
    executionId: string,
    task: ExecutionTask,
    workDir: string
  ): Promise<void> {
    console.log(`[AgentExecutorWrapper] Starting execution ${executionId}`, {
      agentType: this.adapter.metadata.name,
      taskId: task.id,
      workDir,
    });

    try {
      // Update execution status to running
      updateExecution(this.db, executionId, { status: 'running' });
      const execution = getExecution(this.db, executionId);
      if (execution) {
        broadcastExecutionUpdate(
          this.projectId,
          executionId,
          'status_changed',
          execution,
          execution.issue_id || undefined
        );
      }

      // For now, this is a placeholder that will be implemented when we add
      // full agent adapters. The actual execution logic will depend on the
      // agent type and its specific requirements.

      // Log that this agent is not yet fully implemented
      const message = `Agent '${this.adapter.metadata.name}' execution is not yet fully implemented. Use ClaudeExecutorWrapper for Claude Code executions.`;
      console.warn(`[AgentExecutorWrapper] ${message}`);

      throw new Error(message);

    } catch (error) {
      console.error(
        `[AgentExecutorWrapper] Execution failed for ${executionId}:`,
        error
      );
      await this.handleError(executionId, error as Error);
      throw error;
    }
  }

  /**
   * Resume a task from a previous session
   *
   * @param executionId - Unique execution identifier
   * @param sessionId - Session ID to resume from
   * @param task - Task to resume
   * @param workDir - Working directory for execution
   */
  async resumeWithLifecycle(
    _executionId: string,
    _sessionId: string,
    _task: ExecutionTask,
    _workDir: string
  ): Promise<void> {
    console.log(
      `[AgentExecutorWrapper] Resume not yet implemented for agent '${this.adapter.metadata.name}'`
    );
    throw new Error(
      `Resume functionality not yet implemented for agent '${this.adapter.metadata.name}'`
    );
  }

  /**
   * Cancel a running execution
   *
   * @param executionId - Execution ID to cancel
   */
  async cancel(executionId: string): Promise<void> {
    console.log(`[AgentExecutorWrapper] Cancel execution ${executionId}`);

    updateExecution(this.db, executionId, {
      status: 'stopped',
      completed_at: new Date().toISOString(),
    });

    const updatedExecution = getExecution(this.db, executionId);
    if (updatedExecution) {
      broadcastExecutionUpdate(
        this.projectId,
        executionId,
        'status_changed',
        updatedExecution,
        updatedExecution.issue_id || undefined
      );
    }
  }

  /**
   * Handle execution error
   *
   * @private
   */
  private async handleError(
    executionId: string,
    error: Error
  ): Promise<void> {
    console.error(
      `[AgentExecutorWrapper] Execution ${executionId} failed:`,
      error
    );

    updateExecution(this.db, executionId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: error.message,
    });

    const execution = getExecution(this.db, executionId);
    if (execution) {
      broadcastExecutionUpdate(
        this.projectId,
        executionId,
        'status_changed',
        execution,
        execution.issue_id || undefined
      );
    }
  }
}

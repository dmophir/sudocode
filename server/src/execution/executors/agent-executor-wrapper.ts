/**
 * AgentExecutorWrapper - Generic wrapper for any agent adapter
 *
 * Provides a unified execution interface that works with any IAgentAdapter.
 * Supports Claude Code, Codex, Cursor, Copilot, and any future agents.
 *
 * @module execution/executors/agent-executor-wrapper
 */

import type { IAgentAdapter, NormalizedEntry } from 'agent-execution-engine/agents';
import {
  ClaudeCodeExecutor,
  CodexExecutor,
  CursorExecutor,
  CopilotExecutor,
} from 'agent-execution-engine/agents';
import type { AgentType, BaseAgentConfig } from '@sudocode-ai/types/agents';
import type { ProcessConfig } from 'agent-execution-engine/process';
import type Database from 'better-sqlite3';
import type { ExecutionTask } from 'agent-execution-engine/engine';
import type { ExecutionLifecycleService } from '../../services/execution-lifecycle.js';
import type { ExecutionLogsStore } from '../../services/execution-logs-store.js';
import type { TransportManager } from '../transport/transport-manager.js';
import { NormalizedEntryToAgUiAdapter } from '../output/normalized-to-ag-ui-adapter.js';
import { AgUiEventAdapter } from '../output/ag-ui-adapter.js';
import {
  updateExecution,
  getExecution,
} from '../../services/executions.js';
import { broadcastExecutionUpdate } from '../../services/websocket.js';

/**
 * Base executor interface that all agent executors implement
 */
interface IAgentExecutor {
  executeTask(task: ExecutionTask): Promise<{ process: any }>;
  resumeTask?(task: ExecutionTask, sessionId: string): Promise<{ process: any }>;
  normalizeOutput(
    outputStream: AsyncIterable<any>,
    workDir: string
  ): AsyncIterable<NormalizedEntry>;
  getCapabilities?(): {
    supportsSessionResume?: boolean;
    requiresSetup?: boolean;
    supportsApprovals?: boolean;
    supportsMcp?: boolean;
    protocol?: string;
  };
}

/**
 * Configuration for AgentExecutorWrapper
 */
export interface AgentExecutorWrapperConfig<TConfig extends BaseAgentConfig> {
  adapter: IAgentAdapter<TConfig>;
  agentConfig: TConfig;
  /** Agent type for executor selection */
  agentType: AgentType;
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
  private executor: IAgentExecutor;
  /** Agent type used for executor selection and logging */
  private readonly agentType: AgentType;
  private _agentConfig: TConfig;
  private logsStore: ExecutionLogsStore;
  private transportManager?: TransportManager;
  private projectId: string;
  private db: Database.Database;
  private processConfig: ProcessConfig;
  private activeExecutions: Map<string, { cancel: () => void }>;

  constructor(config: AgentExecutorWrapperConfig<TConfig>) {
    this.adapter = config.adapter;
    this.agentType = config.agentType;
    this._agentConfig = config.agentConfig;
    this.logsStore = config.logsStore;
    this.transportManager = config.transportManager;
    this.projectId = config.projectId;
    this.db = config.db;
    this.activeExecutions = new Map();

    // Build process configuration from agent-specific config
    this.processConfig = this.adapter.buildProcessConfig(this._agentConfig);

    // Create executor instance based on agent type
    this.executor = this.createExecutor(config.agentType, this._agentConfig);

    console.log('[AgentExecutorWrapper] Initialized', {
      agentType: this.agentType,
      adapterName: this.adapter.metadata.name,
      projectId: this.projectId,
      workDir: this.processConfig.workDir,
      hasTransport: !!this.transportManager,
      hasLogsStore: !!this.logsStore,
    });
  }

  /**
   * Create the appropriate executor for the given agent type
   *
   * @param agentType - Type of agent
   * @param agentConfig - Agent configuration
   * @returns Executor instance
   */
  private createExecutor(agentType: AgentType, agentConfig: TConfig): IAgentExecutor {
    switch (agentType) {
      case 'claude-code':
        return new ClaudeCodeExecutor({
          workDir: agentConfig.workDir,
          executablePath: (agentConfig as any).claudePath,
          print: (agentConfig as any).print ?? true,
          outputFormat: (agentConfig as any).outputFormat ?? 'stream-json',
          verbose: (agentConfig as any).verbose ?? true,
          dangerouslySkipPermissions: (agentConfig as any).dangerouslySkipPermissions ?? true,
        }) as IAgentExecutor;

      case 'codex':
        return new CodexExecutor(agentConfig as any) as IAgentExecutor;

      case 'cursor':
        return new CursorExecutor(agentConfig as any) as IAgentExecutor;

      case 'copilot':
        return new CopilotExecutor(agentConfig as any) as IAgentExecutor;

      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }

  /**
   * Execute a task with full lifecycle management
   *
   * @param executionId - Unique execution identifier
   * @param task - Task to execute
   * @param workDir - Working directory for execution
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

    // 1. Setup AG-UI system
    const { agUiAdapter, normalizedAdapter } =
      this.setupAgUiSystem(executionId);

    // 2. Connect to transport
    if (this.transportManager) {
      this.transportManager.connectAdapter(agUiAdapter, executionId);
      console.log(
        `[AgentExecutorWrapper] Connected AG-UI adapter to transport for ${executionId}`
      );
    }

    try {
      // 3. Emit run started event
      agUiAdapter.emitRunStarted({
        model: (task.config as any)?.model || this.adapter.metadata.name,
        timestamp: new Date().toISOString(),
      });

      // 4. Update execution status to running
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

      // 5. Execute task with agent executor
      console.log(
        `[AgentExecutorWrapper] Spawning ${this.adapter.metadata.name} process for ${executionId}`,
        {
          taskId: task.id,
          workDir,
          promptLength: task.prompt.length,
        }
      );
      const spawned = await this.executor.executeTask(task);
      console.log(
        `[AgentExecutorWrapper] ${this.adapter.metadata.name} process spawned for ${executionId}`,
        {
          pid: spawned.process.process?.pid,
          spawnfile: spawned.process.process?.spawnfile,
        }
      );

      // 6. Store cancellation handle
      this.activeExecutions.set(executionId, {
        cancel: () => {
          if (spawned.process.process) {
            spawned.process.process.kill('SIGTERM');
          }
        },
      });

      // 7. Create output stream from process stdout/stderr
      const outputStream = this.createOutputChunks(spawned.process);
      const normalized = this.executor.normalizeOutput(outputStream, workDir);

      // 8. Process normalized output (runs concurrently with process)
      const processOutputPromise = this.processNormalizedOutput(
        executionId,
        normalized,
        normalizedAdapter
      );

      // 9. Capture stderr for debugging
      const childProcess = spawned.process.process;
      if (childProcess && childProcess.stderr) {
        let stderrOutput = '';
        childProcess.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString();
          stderrOutput += chunk;
          console.error(
            `[AgentExecutorWrapper] ${this.adapter.metadata.name} stderr for ${executionId}:`,
            chunk
          );
        });
      }

      // 10. Wait for output processing to complete
      await processOutputPromise;

      console.log(
        `[AgentExecutorWrapper] Output processing completed for ${executionId}`
      );

      // 11. Wait for process to exit
      const exitCode = await new Promise<number>((resolve) => {
        if (!childProcess) {
          resolve(0);
          return;
        }

        childProcess.on('exit', (code: number | null) => {
          console.log(
            `[AgentExecutorWrapper] Process exited with code ${code} for ${executionId}`
          );
          resolve(code ?? 0);
        });

        childProcess.on('error', (error: Error) => {
          console.error(
            `[AgentExecutorWrapper] Process error for ${executionId}:`,
            error
          );
          resolve(1);
        });
      });

      // 12. Handle completion
      if (exitCode === 0) {
        await this.handleSuccess(executionId);
        agUiAdapter.emitRunFinished({ exitCode });
      } else {
        throw new Error(`Process exited with code ${exitCode}`);
      }
    } catch (error) {
      console.error(
        `[AgentExecutorWrapper] Execution failed for ${executionId}:`,
        error
      );
      await this.handleError(executionId, error as Error);
      agUiAdapter.emitRunError(
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    } finally {
      // Cleanup
      this.activeExecutions.delete(executionId);
      if (this.transportManager) {
        this.transportManager.disconnectAdapter(agUiAdapter);
        console.log(
          `[AgentExecutorWrapper] Disconnected AG-UI adapter for ${executionId}`
        );
      }
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
    executionId: string,
    sessionId: string,
    task: ExecutionTask,
    workDir: string
  ): Promise<void> {
    // Check if executor supports resume
    const capabilities = this.executor.getCapabilities?.();
    if (!capabilities?.supportsSessionResume || !this.executor.resumeTask) {
      console.log(
        `[AgentExecutorWrapper] Resume not supported for agent '${this.adapter.metadata.name}'`
      );
      throw new Error(
        `Resume functionality not supported for agent '${this.adapter.metadata.name}'`
      );
    }

    console.log(
      `[AgentExecutorWrapper] Resuming session ${sessionId} for ${executionId}`
    );

    // Setup AG-UI system
    const { agUiAdapter, normalizedAdapter } = this.setupAgUiSystem(executionId);

    if (this.transportManager) {
      this.transportManager.connectAdapter(agUiAdapter, executionId);
    }

    try {
      agUiAdapter.emitRunStarted({
        model: (task.config as any)?.model || this.adapter.metadata.name,
        sessionId,
        resumed: true,
      } as any);

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

      // Use resumeTask instead of executeTask
      const spawned = await this.executor.resumeTask(task, sessionId);

      this.activeExecutions.set(executionId, {
        cancel: () => {
          if (spawned.process.process) {
            spawned.process.process.kill('SIGTERM');
          }
        },
      });

      // Create output streams
      const outputChunks = this.createOutputChunks(spawned.process);
      const normalized = this.executor.normalizeOutput(outputChunks, workDir);

      const processOutputPromise = this.processNormalizedOutput(
        executionId,
        normalized,
        normalizedAdapter
      );

      const exitCode = await new Promise<number>((resolve, reject) => {
        const childProcess = spawned.process.process;
        if (!childProcess) {
          reject(new Error('No child process available'));
          return;
        }

        childProcess.on('exit', (code: number | null) => resolve(code || 0));
        childProcess.on('error', (error: Error) => reject(error));
      });

      await processOutputPromise;

      if (exitCode === 0) {
        await this.handleSuccess(executionId);
        agUiAdapter.emitRunFinished({ exitCode });
      } else {
        throw new Error(`Process exited with code ${exitCode}`);
      }
    } catch (error) {
      await this.handleError(executionId, error as Error);
      agUiAdapter.emitRunError(
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
      if (this.transportManager) {
        this.transportManager.disconnectAdapter(agUiAdapter);
      }
    }
  }

  /**
   * Cancel a running execution
   *
   * @param executionId - Execution ID to cancel
   */
  async cancel(executionId: string): Promise<void> {
    console.log(`[AgentExecutorWrapper] Cancel execution ${executionId}`);

    // Kill the process if active
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      execution.cancel();
      this.activeExecutions.delete(executionId);
    } else {
      console.warn(
        `[AgentExecutorWrapper] No active execution found for ${executionId}`
      );
    }

    // Update database status
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
   * Setup AG-UI system for execution
   *
   * @private
   */
  private setupAgUiSystem(executionId: string): {
    agUiAdapter: AgUiEventAdapter;
    normalizedAdapter: NormalizedEntryToAgUiAdapter;
  } {
    const agUiAdapter = new AgUiEventAdapter(executionId);
    const normalizedAdapter = new NormalizedEntryToAgUiAdapter(agUiAdapter);

    console.log(
      `[AgentExecutorWrapper] Setup AG-UI system for ${executionId}`
    );

    return { agUiAdapter, normalizedAdapter };
  }

  /**
   * Process normalized output from agent
   *
   * @private
   */
  private async processNormalizedOutput(
    executionId: string,
    normalized: AsyncIterable<NormalizedEntry>,
    normalizedAdapter: NormalizedEntryToAgUiAdapter
  ): Promise<void> {
    console.log(
      `[AgentExecutorWrapper] Processing normalized output for ${executionId}`
    );

    let entryCount = 0;

    for await (const entry of normalized) {
      entryCount++;

      // Log first 10 entries and every 100th entry for debugging
      if (entryCount <= 10 || entryCount % 100 === 0) {
        console.log(
          `[AgentExecutorWrapper] Entry ${entryCount} for ${executionId}:`,
          {
            index: entry.index,
            kind: entry.type.kind,
            timestamp: entry.timestamp,
          }
        );
      }

      try {
        // 1. Store normalized entry for historical replay
        this.logsStore.appendNormalizedEntry(executionId, entry);

        // 2. Convert to AG-UI and broadcast for real-time streaming
        await normalizedAdapter.processEntry(entry);
      } catch (error) {
        console.error(
          `[AgentExecutorWrapper] Error processing entry for ${executionId}:`,
          {
            entryIndex: entry.index,
            entryType: entry.type.kind,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        // Continue processing (don't fail entire execution for one entry)
      }
    }

    console.log(
      `[AgentExecutorWrapper] Finished processing ${entryCount} entries for ${executionId}`
    );
  }

  /**
   * Handle successful execution
   *
   * @private
   */
  private async handleSuccess(executionId: string): Promise<void> {
    console.log(`[AgentExecutorWrapper] Execution ${executionId} completed successfully`);

    updateExecution(this.db, executionId, {
      status: 'completed',
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

  /**
   * Create output chunk stream from ManagedProcess
   *
   * @private
   */
  private async *createOutputChunks(
    process: any
  ): AsyncIterable<{ type: 'stdout' | 'stderr'; data: Buffer; timestamp: Date }> {
    if (!process.streams) {
      throw new Error('Process does not have streams available');
    }

    const { stdout, stderr } = process.streams;

    // Merge stdout and stderr
    const streams = [];
    if (stdout) {
      streams.push(this.streamToChunks(stdout, 'stdout'));
    }
    if (stderr) {
      streams.push(this.streamToChunks(stderr, 'stderr'));
    }

    // Yield chunks from all streams
    for (const stream of streams) {
      for await (const chunk of stream) {
        yield chunk;
      }
    }
  }

  /**
   * Convert a readable stream to output chunks
   *
   * @private
   */
  private async *streamToChunks(
    stream: any,
    type: 'stdout' | 'stderr'
  ): AsyncIterable<{ type: 'stdout' | 'stderr'; data: Buffer; timestamp: Date }> {
    for await (const chunk of stream) {
      yield {
        type,
        data: Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        timestamp: new Date(),
      };
    }
  }
}

/**
 * LinearOrchestrator Lifecycle Service Integration Tests
 *
 * Tests for ExecutionLifecycleService integration with LinearOrchestrator.
 * Verifies that cleanup is called appropriately on completion, failure, and cancellation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LinearOrchestrator } from '../../../../src/execution/workflow/linear-orchestrator.js';
import type { ExecutionLifecycleService } from '../../../../src/services/execution-lifecycle.js';
import type { IResilientExecutor } from '../../../../src/execution/resilience/executor.js';
import type { ResilientExecutionResult } from '../../../../src/execution/resilience/types.js';
import type { WorkflowDefinition } from '../../../../src/execution/workflow/types.js';

describe('LinearOrchestrator Lifecycle Service Integration', () => {
  let mockExecutor: IResilientExecutor;
  let cleanupCalls: string[];
  let mockLifecycleService: ExecutionLifecycleService;

  beforeEach(() => {
    cleanupCalls = [];

    // Create mock executor
    mockExecutor = {
      executeTask: async (): Promise<ResilientExecutionResult> => {
        return {
          taskId: 'task-1',
          executionId: 'exec-1',
          success: true,
          exitCode: 0,
          output: 'Step completed',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
          attempts: [],
          totalAttempts: 1,
          finalAttempt: {
            attemptNumber: 1,
            success: true,
            startedAt: new Date(),
            willRetry: false,
          },
        };
      },
      executeTasks: async () => [],
      getCircuitBreaker: () => null,
      resetCircuitBreaker: () => {},
      getRetryMetrics: () => ({
        totalRetries: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageAttemptsToSuccess: 0,
        circuitBreakers: new Map(),
      }),
      onRetryAttempt: () => {},
      onCircuitOpen: () => {},
    } as IResilientExecutor;

    // Create mock lifecycle service
    mockLifecycleService = {
      cleanupExecution: async (executionId: string) => {
        cleanupCalls.push(executionId);
      },
    } as any as ExecutionLifecycleService;
  });

  it('should call cleanup on successful workflow completion', async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      undefined,
      mockLifecycleService
    );

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    await orchestrator.startWorkflow(workflow, '/test', {
      executionId: 'db-exec-123',
    });

    // Wait a bit for async cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(cleanupCalls.length, 1, 'Cleanup should be called once');
    assert.strictEqual(
      cleanupCalls[0],
      'db-exec-123',
      'Should cleanup the correct execution'
    );
  });

  it('should call cleanup on workflow failure', async () => {
    // Create failing executor
    const failingExecutor: IResilientExecutor = {
      executeTask: async (): Promise<ResilientExecutionResult> => {
        throw new Error('Execution failed');
      },
      executeTasks: async () => [],
      getCircuitBreaker: () => null,
      resetCircuitBreaker: () => {},
      getRetryMetrics: () => ({
        totalRetries: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageAttemptsToSuccess: 0,
        circuitBreakers: new Map(),
      }),
      onRetryAttempt: () => {},
      onCircuitOpen: () => {},
    } as IResilientExecutor;

    const orchestrator = new LinearOrchestrator(
      failingExecutor,
      undefined,
      undefined,
      mockLifecycleService
    );

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    // Start workflow (will fail in background)
    await orchestrator.startWorkflow(workflow, '/test', {
      executionId: 'db-exec-456',
    });

    // Wait for failure and cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(cleanupCalls.length, 1, 'Cleanup should be called once');
    assert.strictEqual(
      cleanupCalls[0],
      'db-exec-456',
      'Should cleanup the correct execution'
    );
  });

  it('should call cleanup on workflow cancellation', async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      undefined,
      mockLifecycleService
    );

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    const executionId = await orchestrator.startWorkflow(workflow, '/test', {
      executionId: 'db-exec-789',
    });

    // Cancel immediately
    await orchestrator.cancelWorkflow(executionId);

    assert.strictEqual(cleanupCalls.length, 1, 'Cleanup should be called once');
    assert.strictEqual(
      cleanupCalls[0],
      'db-exec-789',
      'Should cleanup the correct execution'
    );
  });

  it('should not call cleanup when no executionId provided (backward compatibility)', async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      undefined,
      mockLifecycleService
    );

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    // Start without executionId
    await orchestrator.startWorkflow(workflow, '/test');

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(
      cleanupCalls.length,
      0,
      'Cleanup should not be called without executionId'
    );
  });

  it('should not call cleanup when no lifecycle service provided (backward compatibility)', async () => {
    const orchestrator = new LinearOrchestrator(mockExecutor);

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    // Should not throw even with executionId
    await orchestrator.startWorkflow(workflow, '/test', {
      executionId: 'db-exec-999',
    });

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should complete successfully
    assert.strictEqual(
      cleanupCalls.length,
      0,
      'Cleanup should not be called without lifecycle service'
    );
  });

  it('should handle cleanup errors gracefully on success', async () => {
    // Create lifecycle service that throws
    const failingLifecycleService = {
      cleanupExecution: async (executionId: string) => {
        cleanupCalls.push(executionId);
        throw new Error('Cleanup failed');
      },
    } as any as ExecutionLifecycleService;

    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      undefined,
      failingLifecycleService
    );

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    // Should not throw even if cleanup fails
    await orchestrator.startWorkflow(workflow, '/test', {
      executionId: 'db-exec-error',
    });

    // Wait for cleanup attempt
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(
      cleanupCalls.length,
      1,
      'Cleanup should have been attempted'
    );
  });

  it('should handle cleanup errors gracefully on failure', async () => {
    // Create failing executor
    const failingExecutor: IResilientExecutor = {
      executeTask: async (): Promise<ResilientExecutionResult> => {
        throw new Error('Execution failed');
      },
      executeTasks: async () => [],
      getCircuitBreaker: () => null,
      resetCircuitBreaker: () => {},
      getRetryMetrics: () => ({
        totalRetries: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageAttemptsToSuccess: 0,
        circuitBreakers: new Map(),
      }),
      onRetryAttempt: () => {},
      onCircuitOpen: () => {},
    } as IResilientExecutor;

    // Create lifecycle service that throws
    const failingLifecycleService = {
      cleanupExecution: async (executionId: string) => {
        cleanupCalls.push(executionId);
        throw new Error('Cleanup failed');
      },
    } as any as ExecutionLifecycleService;

    const orchestrator = new LinearOrchestrator(
      failingExecutor,
      undefined,
      undefined,
      failingLifecycleService
    );

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    // Should not throw even if both execution and cleanup fail
    await orchestrator.startWorkflow(workflow, '/test', {
      executionId: 'db-exec-error-2',
    });

    // Wait for cleanup attempt
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(
      cleanupCalls.length,
      1,
      'Cleanup should have been attempted'
    );
  });

  it('should handle cleanup errors gracefully on cancellation', async () => {
    // Create lifecycle service that throws
    const failingLifecycleService = {
      cleanupExecution: async (executionId: string) => {
        cleanupCalls.push(executionId);
        throw new Error('Cleanup failed');
      },
    } as any as ExecutionLifecycleService;

    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      undefined,
      failingLifecycleService
    );

    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      steps: [
        {
          id: 'step-1',
          taskType: 'issue',
          prompt: 'Test step',
        },
      ],
    };

    const executionId = await orchestrator.startWorkflow(workflow, '/test', {
      executionId: 'db-exec-error-3',
    });

    // Should not throw even if cleanup fails
    await orchestrator.cancelWorkflow(executionId);

    assert.strictEqual(
      cleanupCalls.length,
      1,
      'Cleanup should have been attempted'
    );
  });
});

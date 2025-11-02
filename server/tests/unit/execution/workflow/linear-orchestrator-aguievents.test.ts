/**
 * LinearOrchestrator AG-UI Events Integration Tests
 *
 * Tests for AG-UI event emission during workflow execution.
 * Verifies that LinearOrchestrator correctly emits lifecycle events
 * (RUN_STARTED, RUN_FINISHED, RUN_ERROR, STEP_STARTED, STEP_FINISHED)
 * through the AgUiEventAdapter.
 */

import { randomUUID } from "crypto";
import { describe, it, beforeEach, expect } from "vitest";
import { LinearOrchestrator } from "../../../../src/execution/workflow/linear-orchestrator.js";
import { AgUiEventAdapter } from "../../../../src/execution/output/ag-ui-adapter.js";
import { EventType } from "@ag-ui/core";
import type { IResilientExecutor } from "../../../../src/execution/resilience/executor.js";
import type { ResilientExecutionResult } from "../../../../src/execution/resilience/types.js";
import type { WorkflowDefinition } from "../../../../src/execution/workflow/types.js";

describe("LinearOrchestrator AG-UI Events", () => {
  let mockExecutor: IResilientExecutor;
  let adapter: AgUiEventAdapter;
  let capturedEvents: any[];

  beforeEach(() => {
    // Create mock executor
    mockExecutor = {
      executeTask: async (): Promise<ResilientExecutionResult> => {
        return {
          taskId: "task-1",
          executionId: "exec-1",
          success: true,
          exitCode: 0,
          output: "Step completed",
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

    // Create adapter and capture events
    adapter = new AgUiEventAdapter("test-run-id");
    capturedEvents = [];
    adapter.onEvent((event) => {
      capturedEvents.push(event);
    });
  });

  it("should emit RUN_STARTED when workflow starts", async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    await orchestrator.startWorkflow(workflow, "/test", {
      executionId: randomUUID(),
    });

    // Find RUN_STARTED event
    const runStartedEvent = capturedEvents.find(
      (e) => e.type === EventType.RUN_STARTED
    );
    expect(runStartedEvent, "RUN_STARTED event should be emitted").toBeTruthy();
    expect(runStartedEvent.runId).toBe("test-run-id");
  });

  it("should emit STEP_STARTED for each workflow step", async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step 1",
        },
        {
          id: "step-2",
          taskType: "spec",
          prompt: "Test step 2",
        },
      ],
    };

    const executionId = randomUUID();
    await orchestrator.startWorkflow(workflow, "/test", { executionId });
    await orchestrator.waitForWorkflow(executionId);

    // Find all STEP_STARTED events
    const stepStartedEvents = capturedEvents.filter(
      (e) => e.type === EventType.STEP_STARTED
    );
    expect(stepStartedEvents.length).toBe(2);
    expect(stepStartedEvents[0].stepName).toBe("issue");
    expect(stepStartedEvents[1].stepName).toBe("spec");
  });

  it("should emit STEP_FINISHED for each completed step", async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    const executionId = randomUUID();
    await orchestrator.startWorkflow(workflow, "/test", { executionId });
    await orchestrator.waitForWorkflow(executionId);

    // Find STEP_FINISHED event
    const stepFinishedEvent = capturedEvents.find(
      (e) => e.type === EventType.STEP_FINISHED
    );
    expect(
      stepFinishedEvent,
      "STEP_FINISHED event should be emitted"
    ).toBeTruthy();
    expect(stepFinishedEvent.stepName).toBe("step-1");
    expect(stepFinishedEvent.rawEvent?.status).toBe("success");
  });

  it("should emit RUN_FINISHED when workflow completes", async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    const executionId = randomUUID();
    await orchestrator.startWorkflow(workflow, "/test", { executionId });
    await orchestrator.waitForWorkflow(executionId);

    // Find RUN_FINISHED event
    const runFinishedEvent = capturedEvents.find(
      (e) => e.type === EventType.RUN_FINISHED
    );
    expect(
      runFinishedEvent,
      "RUN_FINISHED event should be emitted"
    ).toBeTruthy();
    expect(runFinishedEvent.runId).toBe("test-run-id");
  });

  it("should emit RUN_ERROR when workflow fails", async () => {
    // Create failing executor
    const failingExecutor: IResilientExecutor = {
      executeTask: async (): Promise<ResilientExecutionResult> => {
        throw new Error("Execution failed");
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
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    const executionId = randomUUID();
    await orchestrator.startWorkflow(workflow, "/test", { executionId });
    const execution = await orchestrator.waitForWorkflow(executionId);

    // Verify workflow failed
    expect(execution.status).toBe("failed");

    // Find RUN_ERROR event
    const runErrorEvent = capturedEvents.find(
      (e) => e.type === EventType.RUN_ERROR
    );
    expect(runErrorEvent, "RUN_ERROR event should be emitted").toBeTruthy();
    expect(runErrorEvent.message).toBe("Execution failed");
  });

  it("should emit STEP_FINISHED with error status when step fails", async () => {
    // Create executor that fails on first call
    let callCount = 0;
    const partiallyFailingExecutor: IResilientExecutor = {
      executeTask: async (): Promise<ResilientExecutionResult> => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Step failed");
        }
        return {
          taskId: "task-1",
          executionId: "exec-1",
          success: true,
          exitCode: 0,
          output: "Success",
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

    const orchestrator = new LinearOrchestrator(
      partiallyFailingExecutor,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    const executionId = randomUUID();
    await orchestrator.startWorkflow(workflow, "/test", { executionId });
    await orchestrator.waitForWorkflow(executionId);

    // Find STEP_FINISHED event with error status
    const stepFinishedEvent = capturedEvents.find(
      (e) =>
        e.type === EventType.STEP_FINISHED && e.rawEvent?.status === "error"
    );
    expect(
      stepFinishedEvent,
      "STEP_FINISHED event with error status should be emitted"
    ).toBeTruthy();
  });

  it("should emit events in correct order", async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    const executionId = randomUUID();
    await orchestrator.startWorkflow(workflow, "/test", { executionId });
    await orchestrator.waitForWorkflow(executionId);

    // Filter to lifecycle events only
    const lifecycleEvents = capturedEvents.filter((e) =>
      [
        EventType.RUN_STARTED,
        EventType.STEP_STARTED,
        EventType.STEP_FINISHED,
        EventType.RUN_FINISHED,
      ].includes(e.type)
    );

    // Verify order
    expect(
      lifecycleEvents.length >= 4,
      "Should have at least 4 lifecycle events"
    ).toBeTruthy();

    // Find positions of each event type
    const runStartedIndex = lifecycleEvents.findIndex(
      (e) => e.type === EventType.RUN_STARTED
    );
    const stepStartedIndex = lifecycleEvents.findIndex(
      (e) => e.type === EventType.STEP_STARTED
    );
    const stepFinishedIndex = lifecycleEvents.findIndex(
      (e) => e.type === EventType.STEP_FINISHED
    );
    const runFinishedIndex = lifecycleEvents.findIndex(
      (e) => e.type === EventType.RUN_FINISHED
    );

    expect(
      runStartedIndex < stepStartedIndex,
      "RUN_STARTED should come before STEP_STARTED"
    ).toBeTruthy();
    expect(
      stepStartedIndex < stepFinishedIndex,
      "STEP_STARTED should come before STEP_FINISHED"
    ).toBeTruthy();
    expect(
      stepFinishedIndex < runFinishedIndex,
      "STEP_FINISHED should come before RUN_FINISHED"
    ).toBeTruthy();
  });

  it("should work without adapter (backward compatibility)", async () => {
    const orchestrator = new LinearOrchestrator(mockExecutor);

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    // Should not throw even without adapter
    await orchestrator.startWorkflow(workflow, "/test", {
      executionId: randomUUID(),
    });
  });

  it("should include workflow metadata in RUN_STARTED rawEvent", async () => {
    const orchestrator = new LinearOrchestrator(
      mockExecutor,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow-123",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    await orchestrator.startWorkflow(workflow, "/test", {
      executionId: randomUUID(),
    });

    const runStartedEvent = capturedEvents.find(
      (e) => e.type === EventType.RUN_STARTED
    );
    expect(runStartedEvent).toBeTruthy();
    expect(runStartedEvent.rawEvent).toBeTruthy();
    expect(runStartedEvent.rawEvent.workflowId).toBe("test-workflow-123");
  });

  it("should include step output in STEP_FINISHED rawEvent", async () => {
    const outputData = "test-output-string";
    const executorWithOutput: IResilientExecutor = {
      executeTask: async (): Promise<ResilientExecutionResult> => {
        return {
          taskId: "task-1",
          executionId: "exec-1",
          success: true,
          exitCode: 0,
          output: outputData,
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

    const orchestrator = new LinearOrchestrator(
      executorWithOutput,
      undefined,
      adapter
    );

    const workflow: WorkflowDefinition = {
      id: "test-workflow",
      steps: [
        {
          id: "step-1",
          taskType: "issue",
          prompt: "Test step",
        },
      ],
    };

    const executionId = randomUUID();
    await orchestrator.startWorkflow(workflow, "/test", { executionId });
    await orchestrator.waitForWorkflow(executionId);

    const stepFinishedEvent = capturedEvents.find(
      (e) => e.type === EventType.STEP_FINISHED
    );
    expect(stepFinishedEvent).toBeTruthy();
    expect(stepFinishedEvent.rawEvent).toBeTruthy();
    expect(stepFinishedEvent.rawEvent.output).toEqual(outputData);
  });
});

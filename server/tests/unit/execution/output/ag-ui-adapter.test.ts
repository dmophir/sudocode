/**
 * Tests for AgUiEventAdapter
 *
 * Tests the transformation of SPEC-007 output processing events into AG-UI protocol events.
 */

import { describe, it, expect, vi } from "vitest";
import { AgUiEventAdapter } from "../../../../src/execution/output/ag-ui-adapter.js";
import { EventType } from "@ag-ui/core";
import type {
  IOutputProcessor,
  ToolCall,
  FileChange,
  ProcessingMetrics,
  ToolCallHandler,
  FileChangeHandler,
  ProgressHandler,
  ErrorHandler,
  MessageHandler,
  UsageHandler,
  OutputMessage,
  UsageMetrics,
} from "../../../../src/execution/output/types.js";

describe("AgUiEventAdapter", () => {
  describe("constructor", () => {
    it("should create adapter with runId", () => {
      const adapter = new AgUiEventAdapter("run-123");
      expect(adapter.getRunId()).toBe("run-123");
    });

    it("should use runId as threadId when threadId not provided", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      adapter.emitRunStarted();

      const call = listener.mock.calls[0];
      const event = call[0];
      expect(event.runId).toBe("run-123");
      expect(event.threadId).toBe("run-123");
    });

    it("should use provided threadId when specified", () => {
      const adapter = new AgUiEventAdapter("run-123", "thread-456");
      const listener = vi.fn();
      adapter.onEvent(listener);

      adapter.emitRunStarted();

      const call = listener.mock.calls[0];
      const event = call[0];
      expect(event.runId).toBe("run-123");
      expect(event.threadId).toBe("thread-456");
    });
  });

  describe("event listener registration", () => {
    it("should register event listeners", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();

      adapter.onEvent(listener);
      adapter.emitRunStarted();

      expect(listener.mock.calls.length).toBe(2); // RUN_STARTED + STATE_SNAPSHOT
    });

    it("should support multiple listeners", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      adapter.onEvent(listener1);
      adapter.onEvent(listener2);
      adapter.emitRunStarted();

      expect(listener1.mock.calls.length).toBe(2);
      expect(listener2.mock.calls.length).toBe(2);
    });

    it("should remove event listeners", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();

      adapter.onEvent(listener);
      adapter.offEvent(listener);
      adapter.emitRunStarted();

      expect(listener.mock.calls.length).toBe(0);
    });

    it("should handle listener errors gracefully", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const normalListener = vi.fn();

      adapter.onEvent(errorListener);
      adapter.onEvent(normalListener);

      // Should not throw
      expect(() => {
        adapter.emitRunStarted();
      }).not.toThrow();

      // Normal listener should still be called
      expect(normalListener.mock.calls.length).toBe(2);
    });
  });

  describe("connectToProcessor", () => {
    it("should subscribe to all processor events", () => {
      const adapter = new AgUiEventAdapter("run-123");

      let toolCallHandler: ToolCallHandler | null = null;
      let fileChangeHandler: FileChangeHandler | null = null;
      let progressHandler: ProgressHandler | null = null;
      let errorHandler: ErrorHandler | null = null;
      let messageHandler: MessageHandler | null = null;
      let usageHandler: UsageHandler | null = null;

      const mockProcessor: IOutputProcessor = {
        processLine: async () => {},
        getMetrics: () => ({
          totalMessages: 0,
          toolCalls: [],
          fileChanges: [],
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheTokens: 0,
            totalTokens: 0,
          },
          errors: [],
          startedAt: new Date(),
          lastUpdate: new Date(),
        }),
        getToolCalls: () => [],
        getFileChanges: () => [],
        onToolCall: (handler) => {
          toolCallHandler = handler;
        },
        onFileChange: (handler) => {
          fileChangeHandler = handler;
        },
        onProgress: (handler) => {
          progressHandler = handler;
        },
        onError: (handler) => {
          errorHandler = handler;
        },
        onMessage: (handler) => {
          messageHandler = handler;
        },
        onUsage: (handler) => {
          usageHandler = handler;
        },
      };

      adapter.connectToProcessor(mockProcessor);

      expect(toolCallHandler).not.toBe(null);
      expect(fileChangeHandler).not.toBe(null);
      expect(progressHandler).not.toBe(null);
      expect(errorHandler).not.toBe(null);
      expect(messageHandler).not.toBe(null);
      expect(usageHandler).not.toBe(null);
    });
  });

  describe("tool call event transformation", () => {
    it("should emit TOOL_CALL_START and TOOL_CALL_ARGS for new tool call", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const toolCall: ToolCall = {
        id: "tool-1",
        name: "Read",
        input: { file_path: "/test.ts" },
        status: "pending",
        timestamp: new Date(),
      };

      // Trigger tool call handler
      const toolCallHandler = getMockHandler(
        mockProcessor,
        "onToolCall"
      ) as ToolCallHandler;
      toolCallHandler(toolCall);

      // Should emit TOOL_CALL_START and TOOL_CALL_ARGS
      expect(listener.mock.calls.length).toBe(2);

      const startEvent = listener.mock.calls[0][0];
      expect(startEvent.type).toBe(EventType.TOOL_CALL_START);
      expect(startEvent.toolCallId).toBe("tool-1");
      expect(startEvent.toolCallName).toBe("Read");

      const argsEvent = listener.mock.calls[1][0];
      expect(argsEvent.type).toBe(EventType.TOOL_CALL_ARGS);
      expect(argsEvent.toolCallId).toBe("tool-1");
      expect(argsEvent.delta).toBe('{"file_path":"/test.ts"}');
    });

    it("should emit TOOL_CALL_END and TOOL_CALL_RESULT on success", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const toolCallHandler = getMockHandler(
        mockProcessor,
        "onToolCall"
      ) as ToolCallHandler;

      // First call - pending
      const pendingToolCall: ToolCall = {
        id: "tool-1",
        name: "Read",
        input: { file_path: "/test.ts" },
        status: "pending",
        timestamp: new Date(),
      };
      toolCallHandler(pendingToolCall);

      listener.mockClear();

      // Second call - success
      const successToolCall: ToolCall = {
        ...pendingToolCall,
        status: "success",
        result: "file contents",
        completedAt: new Date(),
      };
      toolCallHandler(successToolCall);

      // Should emit TOOL_CALL_END, TOOL_CALL_RESULT, and STATE_DELTA
      expect(listener.mock.calls.length).toBe(3);

      const endEvent = listener.mock.calls[0][0];
      expect(endEvent.type).toBe(EventType.TOOL_CALL_END);
      expect(endEvent.toolCallId).toBe("tool-1");

      const resultEvent = listener.mock.calls[1][0];
      expect(resultEvent.type).toBe(EventType.TOOL_CALL_RESULT);
      expect(resultEvent.toolCallId).toBe("tool-1");
      expect(resultEvent.content).toBe("file contents");
    });

    it("should emit TOOL_CALL_RESULT with error on failure", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const toolCallHandler = getMockHandler(
        mockProcessor,
        "onToolCall"
      ) as ToolCallHandler;

      // Pending call
      toolCallHandler({
        id: "tool-1",
        name: "Read",
        input: { file_path: "/test.ts" },
        status: "pending",
        timestamp: new Date(),
      });

      listener.mockClear();

      // Error call
      const errorToolCall: ToolCall = {
        id: "tool-1",
        name: "Read",
        input: { file_path: "/test.ts" },
        status: "error",
        error: "File not found",
        timestamp: new Date(),
        completedAt: new Date(),
      };
      toolCallHandler(errorToolCall);

      const resultEvent = listener.mock.calls[1][0];
      expect(resultEvent.type).toBe(EventType.TOOL_CALL_RESULT);
      expect(resultEvent.content).toBe("File not found");
    });
  });

  describe("file change event transformation", () => {
    it("should emit CUSTOM event for file changes", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const fileChange: FileChange = {
        path: "/src/test.ts",
        operation: "write",
        timestamp: new Date(),
        toolCallId: "tool-1",
        changes: {
          linesAdded: 10,
          linesDeleted: 5,
        },
      };

      const fileChangeHandler = getMockHandler(
        mockProcessor,
        "onFileChange"
      ) as FileChangeHandler;
      fileChangeHandler(fileChange);

      // Should emit CUSTOM event and STATE_DELTA
      expect(listener.mock.calls.length).toBe(2);

      const customEvent = listener.mock.calls[0][0];
      expect(customEvent.type).toBe(EventType.CUSTOM);
      expect(customEvent.name).toBe("file_change");
      expect(customEvent.value).toEqual({
        path: "/src/test.ts",
        operation: "write",
        toolCallId: "tool-1",
        changes: {
          linesAdded: 10,
          linesDeleted: 5,
        },
      });
    });
  });

  describe("progress event transformation", () => {
    it("should emit STATE_DELTA for progress updates", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const metrics: ProcessingMetrics = {
        totalMessages: 10,
        toolCalls: [],
        fileChanges: [],
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheTokens: 20,
          totalTokens: 150,
        },
        errors: [],
        startedAt: new Date(),
        lastUpdate: new Date(),
      };

      const progressHandler = getMockHandler(
        mockProcessor,
        "onProgress"
      ) as ProgressHandler;
      progressHandler(metrics);

      expect(listener.mock.calls.length).toBe(1);

      const deltaEvent = listener.mock.calls[0][0];
      expect(deltaEvent.type).toBe(EventType.STATE_DELTA);
      expect(Array.isArray(deltaEvent.delta)).toBeTruthy();

      // Check JSON Patch format
      const totalMessagesOp = deltaEvent.delta.find(
        (op: any) => op.path === "/totalMessages"
      );
      expect(totalMessagesOp).toBeTruthy();
      expect(totalMessagesOp.op).toBe("replace");
      expect(totalMessagesOp.value).toBe(10);
    });
  });

  describe("error event transformation", () => {
    it("should emit RUN_ERROR for errors", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const error = {
        message: "Test error",
        timestamp: new Date(),
        details: { code: "ERR_TEST" },
      };

      const errorHandler = getMockHandler(
        mockProcessor,
        "onError"
      ) as ErrorHandler;
      errorHandler(error);

      // Should emit RUN_ERROR and STATE_DELTA
      expect(listener.mock.calls.length).toBe(2);

      const errorEvent = listener.mock.calls[0][0];
      expect(errorEvent.type).toBe(EventType.RUN_ERROR);
      expect(errorEvent.message).toBe("Test error");
      expect(errorEvent.rawEvent).toBeTruthy();
      expect(errorEvent.rawEvent.details).toEqual({ code: "ERR_TEST" });
    });
  });

  describe("message event transformation", () => {
    it("should emit TEXT_MESSAGE_* events for text messages", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const textMessage: OutputMessage = {
        type: "text",
        content: "Hello, this is Claude!",
        timestamp: new Date(),
      };

      const messageHandler = getMockHandler(
        mockProcessor,
        "onMessage"
      ) as MessageHandler;
      messageHandler(textMessage);

      // Should emit TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END
      expect(listener.mock.calls.length).toBe(3);

      const startEvent = listener.mock.calls[0][0];
      expect(startEvent.type).toBe(EventType.CUSTOM);
      expect(startEvent.name).toBe("TEXT_MESSAGE_START");
      expect(startEvent.value.messageId).toBeTruthy();

      const contentEvent = listener.mock.calls[1][0];
      expect(contentEvent.type).toBe(EventType.CUSTOM);
      expect(contentEvent.name).toBe("TEXT_MESSAGE_CONTENT");
      expect(contentEvent.value.content).toBe("Hello, this is Claude!");
      expect(contentEvent.value.messageId).toBe(startEvent.value.messageId);

      const endEvent = listener.mock.calls[2][0];
      expect(endEvent.type).toBe(EventType.CUSTOM);
      expect(endEvent.name).toBe("TEXT_MESSAGE_END");
      expect(endEvent.value.messageId).toBe(startEvent.value.messageId);
    });

    it("should ignore non-text messages", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const toolUseMessage: OutputMessage = {
        type: "tool_use",
        id: "tool-1",
        name: "Read",
        input: { file_path: "/test.ts" },
        timestamp: new Date(),
      };

      const messageHandler = getMockHandler(
        mockProcessor,
        "onMessage"
      ) as MessageHandler;
      messageHandler(toolUseMessage);

      // Should not emit any events for non-text messages
      expect(listener.mock.calls.length).toBe(0);
    });

    it("should generate unique message IDs for each text message", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const messageHandler = getMockHandler(
        mockProcessor,
        "onMessage"
      ) as MessageHandler;

      // First message
      const message1: OutputMessage = {
        type: "text",
        content: "First message",
        timestamp: new Date(),
      };
      messageHandler(message1);

      const firstMessageId = listener.mock.calls[0][0].value.messageId;

      listener.mockClear();

      // Second message
      const message2: OutputMessage = {
        type: "text",
        content: "Second message",
        timestamp: new Date(),
      };
      messageHandler(message2);

      const secondMessageId = listener.mock.calls[0][0].value.messageId;

      // Message IDs should be different
      expect(firstMessageId).not.toBe(secondMessageId);
    });
  });

  describe("usage event transformation", () => {
    it("should emit USAGE_UPDATE event for usage metrics", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const usage: UsageMetrics = {
        inputTokens: 100,
        outputTokens: 200,
        cacheTokens: 50,
        totalTokens: 300,
        cost: 0.015,
        provider: "anthropic",
        model: "claude-sonnet-4",
      };

      const usageHandler = getMockHandler(
        mockProcessor,
        "onUsage"
      ) as UsageHandler;
      usageHandler(usage);

      // Should emit USAGE_UPDATE and STATE_DELTA
      expect(listener.mock.calls.length).toBe(2);

      const usageEvent = listener.mock.calls[0][0];
      expect(usageEvent.type).toBe(EventType.CUSTOM);
      expect(usageEvent.name).toBe("USAGE_UPDATE");
      expect(usageEvent.value).toEqual({
        inputTokens: 100,
        outputTokens: 200,
        cacheTokens: 50,
        totalTokens: 300,
        cost: 0.015,
        provider: "anthropic",
        model: "claude-sonnet-4",
      });

      const deltaEvent = listener.mock.calls[1][0];
      expect(deltaEvent.type).toBe(EventType.STATE_DELTA);
      expect(Array.isArray(deltaEvent.delta)).toBeTruthy();
    });

    it("should update state with usage metrics", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      const usage: UsageMetrics = {
        inputTokens: 100,
        outputTokens: 200,
        cacheTokens: 50,
        totalTokens: 300,
      };

      const usageHandler = getMockHandler(
        mockProcessor,
        "onUsage"
      ) as UsageHandler;
      usageHandler(usage);

      const state = adapter.getState();
      expect(state.usage).toEqual({
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
      });
    });
  });

  describe("lifecycle methods", () => {
    it("should emit RUN_STARTED and STATE_SNAPSHOT", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      adapter.emitRunStarted({ model: "claude-sonnet-4" });

      expect(listener.mock.calls.length).toBe(2);

      const runStartedEvent = listener.mock.calls[0][0];
      expect(runStartedEvent.type).toBe(EventType.RUN_STARTED);
      expect(runStartedEvent.runId).toBe("run-123");
      expect(runStartedEvent.rawEvent).toBeTruthy();

      const snapshotEvent = listener.mock.calls[1][0];
      expect(snapshotEvent.type).toBe(EventType.STATE_SNAPSHOT);
      expect(snapshotEvent.snapshot).toBeTruthy();
    });

    it("should emit RUN_FINISHED with result", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const result = { success: true, summary: "Task completed" };
      adapter.emitRunFinished(result);

      expect(listener.mock.calls.length).toBe(1);

      const runFinishedEvent = listener.mock.calls[0][0];
      expect(runFinishedEvent.type).toBe(EventType.RUN_FINISHED);
      expect(runFinishedEvent.runId).toBe("run-123");
      expect(runFinishedEvent.result).toEqual(result);
    });

    it("should emit STATE_SNAPSHOT with metrics", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      mockProcessor.getMetrics = () => ({
        totalMessages: 5,
        toolCalls: [{} as ToolCall, {} as ToolCall],
        fileChanges: [{} as FileChange],
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheTokens: 20,
          totalTokens: 150,
        },
        errors: [],
        startedAt: new Date(),
        lastUpdate: new Date(),
      });

      adapter.connectToProcessor(mockProcessor);
      adapter.emitStateSnapshot();

      expect(listener.mock.calls.length).toBe(1);

      const snapshotEvent = listener.mock.calls[0][0];
      expect(snapshotEvent.type).toBe(EventType.STATE_SNAPSHOT);
      expect(snapshotEvent.snapshot.totalMessages).toBe(5);
      expect(snapshotEvent.snapshot.toolCallCount).toBe(2);
      expect(snapshotEvent.snapshot.fileChangeCount).toBe(1);
      expect(snapshotEvent.snapshot.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });
  });

  describe("state management", () => {
    it("should track state across events", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      const mockProcessor = createMockProcessor();
      adapter.connectToProcessor(mockProcessor);

      // Emit progress update
      const progressHandler = getMockHandler(
        mockProcessor,
        "onProgress"
      ) as ProgressHandler;
      progressHandler({
        totalMessages: 5,
        toolCalls: [],
        fileChanges: [],
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheTokens: 20,
          totalTokens: 150,
        },
        errors: [],
        startedAt: new Date(),
        lastUpdate: new Date(),
      });

      const state = adapter.getState();
      expect(state.totalMessages).toBe(5);
      expect(state.toolCallCount).toBe(0);
    });

    it("should return copy of state", () => {
      const adapter = new AgUiEventAdapter("run-123");

      const state1 = adapter.getState();
      state1.customField = "modified";

      const state2 = adapter.getState();
      expect(state2.customField).toBe(undefined);
    });
  });

  describe("event timestamps", () => {
    it("should use numeric timestamps", () => {
      const adapter = new AgUiEventAdapter("run-123");
      const listener = vi.fn();
      adapter.onEvent(listener);

      adapter.emitRunStarted();

      const event = listener.mock.calls[0][0];
      expect(typeof event.timestamp).toBe("number");
      expect(event.timestamp > 0).toBeTruthy();
    });
  });
});

// Helper functions

function createMockProcessor(): IOutputProcessor {
  const handlers: Record<string, any> = {};

  return {
    processLine: async () => {},
    getMetrics: () => ({
      totalMessages: 0,
      toolCalls: [],
      fileChanges: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
      },
      errors: [],
      startedAt: new Date(),
      lastUpdate: new Date(),
    }),
    getToolCalls: () => [],
    getFileChanges: () => [],
    onToolCall: (handler: ToolCallHandler) => {
      handlers.onToolCall = handler;
    },
    onFileChange: (handler: FileChangeHandler) => {
      handlers.onFileChange = handler;
    },
    onProgress: (handler: ProgressHandler) => {
      handlers.onProgress = handler;
    },
    onError: (handler: ErrorHandler) => {
      handlers.onError = handler;
    },
    onMessage: (handler: MessageHandler) => {
      handlers.onMessage = handler;
    },
    onUsage: (handler: UsageHandler) => {
      handlers.onUsage = handler;
    },
    _handlers: handlers, // Internal access for testing
  } as any;
}

function getMockHandler(processor: any, handlerName: string): any {
  return processor._handlers[handlerName];
}

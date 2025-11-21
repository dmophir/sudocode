/**
 * Tests for DirectRunnerAdapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DirectRunnerAdapter } from "../../../../src/execution/adapters/direct-runner-adapter.js";
import type {
  IAgentExecutor,
  ExecutionTask,
  NormalizedEntry,
  AgentCapabilities,
} from "agent-execution-engine/agents";

describe("DirectRunnerAdapter", () => {
  let mockExecutor: IAgentExecutor;
  let mockAgUiAdapter: any;
  let mockLogsStore: any;
  let consoleSpy: any;

  const createMockTask = (): ExecutionTask => ({
    id: "task-1",
    type: "issue",
    prompt: "Test prompt",
    workDir: "/test",
    priority: 0,
    dependencies: [],
    createdAt: new Date(),
    config: {},
  });

  const createMockEntry = (
    index: number,
    kind: string = "assistant_message"
  ): NormalizedEntry => {
    const base = {
      index,
      content: `Test content ${index}`,
      timestamp: new Date(),
    };

    if (kind === "tool_use") {
      return {
        ...base,
        type: {
          kind: "tool_use" as any,
          tool: {
            toolName: "TestTool",
            action: { kind: "tool" as any, toolName: "TestTool", args: {} },
            status: "success" as any,
          },
        },
      };
    }

    return {
      ...base,
      type: { kind: kind as any },
    };
  };

  beforeEach(() => {
    // Mock executor with all required methods
    mockExecutor = {
      executeTask: vi.fn(),
      resumeTask: vi.fn(),
      normalizeOutput: vi.fn(),
      getCapabilities: vi.fn(() => ({
        supportsSessionResume: true,
        requiresSetup: false,
        supportsApprovals: false,
        supportsMcp: false,
        protocol: "stream-json",
      })),
      checkAvailability: vi.fn(async () => true),
    } as any;

    // Mock AG-UI adapter
    mockAgUiAdapter = {
      emit: vi.fn(),
      emitRunError: vi.fn(),
    };

    // Mock logs store
    mockLogsStore = {
      appendNormalizedLog: vi.fn(),
    };

    // Spy on console.error
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe("constructor", () => {
    it("should create adapter with all dependencies", () => {
      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      expect(adapter).toBeInstanceOf(DirectRunnerAdapter);
    });

    it("should create adapter without optional dependencies", () => {
      const adapter = new DirectRunnerAdapter(mockExecutor);

      expect(adapter).toBeInstanceOf(DirectRunnerAdapter);
    });
  });

  // ============================================================================
  // executeAndStream Tests
  // ============================================================================

  describe("executeAndStream", () => {
    it("should execute task and stream output", async () => {
      // Mock spawned process
      const mockProcess = {
        pid: 1234,
        streams: {
          stdout: (async function* () {
            yield Buffer.from("output");
          })(),
        },
        on: vi.fn((event, handler) => {
          if (event === "exit") {
            setTimeout(() => handler(0), 10);
          }
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      // Mock normalized output
      const mockEntry = createMockEntry(0);
      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield mockEntry;
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      const task = createMockTask();
      await adapter.executeAndStream(task, "exec-1", "/test");

      expect(mockExecutor.executeTask).toHaveBeenCalledWith(task);
      expect(mockLogsStore.appendNormalizedLog).toHaveBeenCalledWith(
        "exec-1",
        mockEntry
      );
      expect(mockAgUiAdapter.emit).toHaveBeenCalled();
    });

    it("should work without AG-UI adapter", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0);
      });

      const adapter = new DirectRunnerAdapter(mockExecutor, undefined, mockLogsStore);

      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(mockLogsStore.appendNormalizedLog).toHaveBeenCalled();
      // Should not throw even without adapter
    });

    it("should work without logs store", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0);
      });

      const adapter = new DirectRunnerAdapter(mockExecutor, mockAgUiAdapter, undefined);

      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(mockAgUiAdapter.emit).toHaveBeenCalled();
      // Should not throw even without logs store
    });

    it("should handle log persistence failure gracefully", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0);
      });

      // Make log store throw error
      mockLogsStore.appendNormalizedLog = vi.fn(() => {
        throw new Error("Database error");
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      // Should not throw despite log store error
      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to persist log"),
        expect.any(Object)
      );
    });

    it("should handle event emission failure gracefully", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0);
      });

      // Make adapter emit throw error
      mockAgUiAdapter.emit = vi.fn(() => {
        throw new Error("Transport error");
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      // Should not throw despite emit error
      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to emit event"),
        expect.any(Object)
      );
    });

    it("should handle process exit with non-zero code", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "exit") {
            setTimeout(() => handler(1), 10); // Exit code 1
          }
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {});

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      await expect(
        adapter.executeAndStream(createMockTask(), "exec-1", "/test")
      ).rejects.toThrow("Process exited with code 1");

      expect(mockAgUiAdapter.emitRunError).toHaveBeenCalled();
    });

    it("should handle process already exited", async () => {
      const mockProcess = {
        pid: null, // Already exited
        streams: { stdout: (async function* () {})() },
        on: vi.fn(),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0);
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      // Should complete immediately without waiting
      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(mockProcess.on).not.toHaveBeenCalled();
    });

    it("should process multiple normalized entries", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0, "assistant_message");
        yield createMockEntry(1, "tool_use");
        yield createMockEntry(2, "assistant_message");
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(mockLogsStore.appendNormalizedLog).toHaveBeenCalledTimes(3);
      expect(mockAgUiAdapter.emit).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // resumeAndStream Tests
  // ============================================================================

  describe("resumeAndStream", () => {
    it("should resume task with session ID", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.resumeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0);
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      const task = createMockTask();
      await adapter.resumeAndStream(task, "exec-1", "session-123", "/test");

      expect(mockExecutor.resumeTask).toHaveBeenCalledWith(
        task,
        "session-123"
      );
      expect(mockLogsStore.appendNormalizedLog).toHaveBeenCalled();
    });

    it("should throw error when executor doesn't support resume", async () => {
      mockExecutor.getCapabilities = vi.fn(() => ({
        supportsSessionResume: false, // Not supported
        requiresSetup: false,
        supportsApprovals: false,
        supportsMcp: false,
        protocol: "stream-json",
      }));

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      await expect(
        adapter.resumeAndStream(createMockTask(), "exec-1", "session-123", "/test")
      ).rejects.toThrow("Executor does not support session resume");

      expect(mockAgUiAdapter.emitRunError).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Capabilities and Availability Tests
  // ============================================================================

  describe("getCapabilities", () => {
    it("should return executor capabilities", () => {
      const mockCapabilities: AgentCapabilities = {
        supportsSessionResume: true,
        requiresSetup: false,
        supportsApprovals: true,
        supportsMcp: false,
        protocol: "stream-json",
      };

      mockExecutor.getCapabilities = vi.fn(() => mockCapabilities);

      const adapter = new DirectRunnerAdapter(mockExecutor);
      const capabilities = adapter.getCapabilities();

      expect(capabilities).toEqual(mockCapabilities);
      expect(mockExecutor.getCapabilities).toHaveBeenCalled();
    });
  });

  describe("checkAvailability", () => {
    it("should return true when executor is available", async () => {
      mockExecutor.checkAvailability = vi.fn(async () => true);

      const adapter = new DirectRunnerAdapter(mockExecutor);
      const isAvailable = await adapter.checkAvailability();

      expect(isAvailable).toBe(true);
      expect(mockExecutor.checkAvailability).toHaveBeenCalled();
    });

    it("should return false when executor is not available", async () => {
      mockExecutor.checkAvailability = vi.fn(async () => false);

      const adapter = new DirectRunnerAdapter(mockExecutor);
      const isAvailable = await adapter.checkAvailability();

      expect(isAvailable).toBe(false);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe("error handling", () => {
    it("should handle executor execution failure", async () => {
      mockExecutor.executeTask = vi.fn(async () => {
        throw new Error("Executor failed");
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      await expect(
        adapter.executeAndStream(createMockTask(), "exec-1", "/test")
      ).rejects.toThrow("Executor failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Execution error"),
        expect.any(Object)
      );
      expect(mockAgUiAdapter.emitRunError).toHaveBeenCalledWith(
        "Executor failed",
        expect.any(String)
      );
    });

    it("should handle process error event", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() },
        on: vi.fn((event, handler) => {
          if (event === "error") {
            setTimeout(() => handler(new Error("Process error")), 10);
          }
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {});

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      await expect(
        adapter.executeAndStream(createMockTask(), "exec-1", "/test")
      ).rejects.toThrow("Process error");
    });

    it("should handle non-Error exceptions", async () => {
      mockExecutor.executeTask = vi.fn(async () => {
        throw "String error"; // Non-Error exception
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      await expect(
        adapter.executeAndStream(createMockTask(), "exec-1", "/test")
      ).rejects.toBe("String error");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Execution error"),
        expect.objectContaining({
          error: "String error",
        })
      );
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("edge cases", () => {
    it("should handle empty output stream", async () => {
      const mockProcess = {
        pid: 1234,
        streams: { stdout: (async function* () {})() }, // Empty stream
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {
        // No entries
      });

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(mockLogsStore.appendNormalizedLog).not.toHaveBeenCalled();
    });

    it("should handle process without streams", async () => {
      const mockProcess = {
        pid: 1234,
        streams: undefined, // No streams
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      mockExecutor.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      mockExecutor.normalizeOutput = vi.fn(async function* () {});

      const adapter = new DirectRunnerAdapter(
        mockExecutor,
        mockAgUiAdapter,
        mockLogsStore
      );

      // Should handle gracefully
      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");
    });

    it("should use executor's createOutputChunks when available", async () => {
      const mockCreateOutputChunks = vi.fn(async function* () {
        yield { type: "stdout", data: Buffer.from("test"), timestamp: new Date() };
      });

      const executorWithChunks = {
        ...mockExecutor,
        createOutputChunks: mockCreateOutputChunks,
      };

      const mockProcess = {
        pid: 1234,
        on: vi.fn((event, handler) => {
          if (event === "exit") setTimeout(() => handler(0), 10);
        }),
      };

      executorWithChunks.executeTask = vi.fn(async () => ({
        process: mockProcess,
      }));

      executorWithChunks.normalizeOutput = vi.fn(async function* () {
        yield createMockEntry(0);
      });

      const adapter = new DirectRunnerAdapter(
        executorWithChunks as any,
        mockAgUiAdapter,
        mockLogsStore
      );

      await adapter.executeAndStream(createMockTask(), "exec-1", "/test");

      expect(mockCreateOutputChunks).toHaveBeenCalledWith(mockProcess);
    });
  });
});

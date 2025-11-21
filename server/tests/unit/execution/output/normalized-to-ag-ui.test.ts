/**
 * Tests for Normalized Entry to AG-UI Transformation
 *
 * @module tests/unit/execution/output/normalized-to-ag-ui
 */

import { describe, it, expect } from "vitest";
import { normalizedEntryToAgUiEvents } from "../../../../src/execution/output/normalized-to-ag-ui.js";
import type { NormalizedEntry } from "agent-execution-engine/agents";

describe("normalizedEntryToAgUiEvents", () => {
  describe("assistant_message", () => {
    it("should transform simple text message", () => {
      const entry: NormalizedEntry = {
        index: 0,
        timestamp: new Date("2025-01-21T10:00:00Z"),
        type: { kind: "assistant_message" },
        content: "Hello, world!",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "CUSTOM",
        name: "TEXT_MESSAGE_CONTENT",
        value: { content: "Hello, world!" },
        timestamp: new Date("2025-01-21T10:00:00Z").getTime(),
      });
    });

    it("should handle empty content", () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: "assistant_message" },
        content: "",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0].value).toEqual({ content: "" });
    });

    it("should handle multi-line content", () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: "assistant_message" },
        content: "Line 1\nLine 2\nLine 3",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0].value.content).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should handle content with markdown", () => {
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: "assistant_message" },
        content: "# Title\n\n**Bold** and *italic*",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0].value.content).toBe("# Title\n\n**Bold** and *italic*");
    });

    it("should use Date.now() when timestamp is missing", () => {
      const before = Date.now();
      const entry: NormalizedEntry = {
        index: 0,
        type: { kind: "assistant_message" },
        content: "No timestamp",
      };

      const events = normalizedEntryToAgUiEvents(entry);
      const after = Date.now();

      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("tool_use", () => {
    it("should transform file_read tool with success status", () => {
      const entry: NormalizedEntry = {
        index: 1,
        timestamp: new Date("2025-01-21T10:00:01Z"),
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Read",
            action: { kind: "file_read", path: "/src/index.ts" },
            status: "success",
            result: { success: true, data: "file contents here" },
          },
        },
        content: "Reading file",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(4); // START, ARGS, END, RESULT
      expect(events[0]).toMatchObject({
        type: "TOOL_CALL_START",
        toolCallId: "Read-1",
        toolCallName: "Read",
      });
      expect(events[1].type).toBe("TOOL_CALL_ARGS");
      expect(events[2].type).toBe("TOOL_CALL_END");
      expect(events[3]).toMatchObject({
        type: "TOOL_CALL_RESULT",
        toolCallId: "Read-1",
        content: "file contents here",
        isError: false,
      });
    });

    it("should transform file_write tool", () => {
      const entry: NormalizedEntry = {
        index: 2,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Write",
            action: { kind: "file_write", path: "/src/output.txt" },
            status: "success",
            result: { success: true, data: "File written" },
          },
        },
        content: "Writing file",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events[1]).toMatchObject({
        type: "TOOL_CALL_ARGS",
        toolCallId: "Write-2",
      });

      const args = JSON.parse(events[1].delta);
      expect(args).toEqual({
        kind: "file_write",
        path: "/src/output.txt",
      });
    });

    it("should transform file_edit tool with changes", () => {
      const entry: NormalizedEntry = {
        index: 3,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Edit",
            action: {
              kind: "file_edit",
              path: "/src/app.ts",
              changes: [
                { type: "edit", unifiedDiff: "@@ -1,3 +1,3 @@" },
              ],
            },
            status: "success",
            result: { success: true },
          },
        },
        content: "Editing file",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      const args = JSON.parse(events[1].delta);
      expect(args.kind).toBe("file_edit");
      expect(args.path).toBe("/src/app.ts");
      expect(args.changes).toHaveLength(1);
    });

    it("should transform command_run tool", () => {
      const entry: NormalizedEntry = {
        index: 4,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Bash",
            action: {
              kind: "command_run",
              command: "npm test",
              result: {
                exitCode: 0,
                stdout: "Tests passed",
                stderr: "",
              },
            },
            status: "success",
            result: { success: true, data: "Command executed" },
          },
        },
        content: "Running command",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      const args = JSON.parse(events[1].delta);
      expect(args.kind).toBe("command_run");
      expect(args.command).toBe("npm test");
      expect(args.result).toMatchObject({
        exitCode: 0,
        stdout: "Tests passed",
      });
    });

    it("should transform search tool", () => {
      const entry: NormalizedEntry = {
        index: 5,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Grep",
            action: { kind: "search", query: "TODO" },
            status: "success",
            result: { success: true, data: "Found 3 matches" },
          },
        },
        content: "Searching files",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      const args = JSON.parse(events[1].delta);
      expect(args).toEqual({
        kind: "search",
        query: "TODO",
      });
    });

    it("should transform generic tool with args", () => {
      const entry: NormalizedEntry = {
        index: 6,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "CustomTool",
            action: {
              kind: "tool",
              toolName: "CustomTool",
              args: { param1: "value1", param2: 42 },
            },
            status: "success",
            result: { success: true, data: { output: "result" } },
          },
        },
        content: "Using custom tool",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      const args = JSON.parse(events[1].delta);
      expect(args.kind).toBe("tool");
      expect(args.toolName).toBe("CustomTool");
      expect(args.args).toEqual({ param1: "value1", param2: 42 });
    });

    it("should only emit START and ARGS for running tool", () => {
      const entry: NormalizedEntry = {
        index: 7,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Read",
            action: { kind: "file_read", path: "/src/file.ts" },
            status: "running",
          },
        },
        content: "Tool running",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(2); // Only START and ARGS
      expect(events[0].type).toBe("TOOL_CALL_START");
      expect(events[1].type).toBe("TOOL_CALL_ARGS");
    });

    it("should only emit START and ARGS for created tool", () => {
      const entry: NormalizedEntry = {
        index: 8,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Write",
            action: { kind: "file_write", path: "/output.txt" },
            status: "created",
          },
        },
        content: "Tool created",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("TOOL_CALL_START");
      expect(events[1].type).toBe("TOOL_CALL_ARGS");
    });

    it("should mark result as error when tool fails", () => {
      const entry: NormalizedEntry = {
        index: 9,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Bash",
            action: { kind: "command_run", command: "invalid-command" },
            status: "failed",
            result: {
              success: false,
              error: "Command not found",
            },
          },
        },
        content: "Tool failed",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      const resultEvent = events.find((e) => e.type === "TOOL_CALL_RESULT");
      expect(resultEvent).toBeDefined();
      expect(resultEvent?.isError).toBe(true);
      expect(resultEvent?.content).toBe("Error: Command not found");
    });

    it("should handle tool with no result", () => {
      const entry: NormalizedEntry = {
        index: 10,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Read",
            action: { kind: "file_read", path: "/test.txt" },
            status: "success",
          },
        },
        content: "No result",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      // Should have START, ARGS, END but no RESULT
      expect(events).toHaveLength(3);
      expect(events.some((e) => e.type === "TOOL_CALL_RESULT")).toBe(false);
    });

    it("should serialize complex object result", () => {
      const entry: NormalizedEntry = {
        index: 11,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "CustomTool",
            action: { kind: "tool", toolName: "CustomTool" },
            status: "success",
            result: {
              success: true,
              data: {
                nested: { value: 42, array: [1, 2, 3] },
              },
            },
          },
        },
        content: "Complex result",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      const resultEvent = events.find((e) => e.type === "TOOL_CALL_RESULT");
      expect(resultEvent).toBeDefined();

      // Should be valid JSON
      const parsed = JSON.parse(resultEvent!.content);
      expect(parsed.nested.value).toBe(42);
      expect(parsed.nested.array).toEqual([1, 2, 3]);
    });
  });

  describe("thinking", () => {
    it("should transform thinking with reasoning", () => {
      const entry: NormalizedEntry = {
        index: 12,
        type: {
          kind: "thinking",
          reasoning: "I need to analyze the code structure first",
        },
        content: "Thinking...",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "CUSTOM",
        name: "THINKING",
        value: {
          reasoning: "I need to analyze the code structure first",
        },
      });
    });

    it("should use content when reasoning is missing", () => {
      const entry: NormalizedEntry = {
        index: 13,
        type: { kind: "thinking" },
        content: "Analyzing the problem...",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events[0].value.reasoning).toBe("Analyzing the problem...");
    });

    it("should prefer reasoning over content", () => {
      const entry: NormalizedEntry = {
        index: 14,
        type: {
          kind: "thinking",
          reasoning: "Reasoning text",
        },
        content: "Content text",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events[0].value.reasoning).toBe("Reasoning text");
    });
  });

  describe("error", () => {
    it("should transform error with message only", () => {
      const entry: NormalizedEntry = {
        index: 15,
        type: {
          kind: "error",
          error: {
            message: "Something went wrong",
          },
        },
        content: "Error occurred",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "RUN_ERROR",
        message: "Something went wrong",
      });
    });

    it("should include error code and stack", () => {
      const entry: NormalizedEntry = {
        index: 16,
        type: {
          kind: "error",
          error: {
            message: "File not found",
            code: "ENOENT",
            stack: "Error: File not found\n  at ...",
          },
        },
        content: "Error",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events[0]).toMatchObject({
        type: "RUN_ERROR",
        message: "File not found",
        errorType: "ENOENT",
        stack: "Error: File not found\n  at ...",
      });
    });
  });

  describe("system_message", () => {
    it("should transform system message", () => {
      const entry: NormalizedEntry = {
        index: 17,
        type: { kind: "system_message" },
        content: "Session started: sess-abc123",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "CUSTOM",
        name: "SYSTEM_MESSAGE",
        value: { content: "Session started: sess-abc123" },
      });
    });
  });

  describe("user_message", () => {
    it("should transform user message", () => {
      const entry: NormalizedEntry = {
        index: 18,
        type: { kind: "user_message" },
        content: "Please analyze this code",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "CUSTOM",
        name: "USER_MESSAGE",
        value: { content: "Please analyze this code" },
      });
    });
  });

  describe("edge cases", () => {
    it("should return empty array for unknown entry type", () => {
      const entry = {
        index: 19,
        type: { kind: "unknown_type" as any },
        content: "Unknown",
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toEqual([]);
    });

    it("should generate unique tool IDs based on index", () => {
      const entry1: NormalizedEntry = {
        index: 100,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Read",
            action: { kind: "file_read", path: "/a.txt" },
            status: "running",
          },
        },
        content: "Tool 1",
      };

      const entry2: NormalizedEntry = {
        index: 200,
        type: {
          kind: "tool_use",
          tool: {
            toolName: "Read",
            action: { kind: "file_read", path: "/b.txt" },
            status: "running",
          },
        },
        content: "Tool 2",
      };

      const events1 = normalizedEntryToAgUiEvents(entry1);
      const events2 = normalizedEntryToAgUiEvents(entry2);

      expect(events1[0].toolCallId).toBe("Read-100");
      expect(events2[0].toolCallId).toBe("Read-200");
    });

    it("should handle entries with metadata field", () => {
      const entry: NormalizedEntry = {
        index: 20,
        type: { kind: "assistant_message" },
        content: "Message with metadata",
        metadata: { source: "test", custom: "value" },
      };

      const events = normalizedEntryToAgUiEvents(entry);

      expect(events).toHaveLength(1);
      expect(events[0].value.content).toBe("Message with metadata");
    });
  });
});

/**
 * Normalized Entry to AG-UI Transformation
 *
 * Converts agent-execution-engine's unified NormalizedEntry format
 * to AG-UI events for streaming to frontend clients.
 *
 * Part of Phase 1 - Direct Runner Pattern Migration.
 *
 * @module execution/output/normalized-to-ag-ui
 */

import type {
  NormalizedEntry,
  ActionType,
  ToolResult,
} from "agent-execution-engine/agents";

/**
 * AG-UI Event - Generic event structure
 * Compatible with @ag-ui/core event types
 */
export interface AgUiEvent {
  type: string;
  timestamp: number;
  [key: string]: any;
}

/**
 * Transform a normalized entry from agent-execution-engine to AG-UI events
 *
 * @param entry - Normalized entry from agent executor
 * @returns Array of AG-UI events (may be empty for unknown types)
 *
 * @example
 * ```typescript
 * const entry: NormalizedEntry = {
 *   index: 0,
 *   type: { kind: 'assistant_message' },
 *   content: 'Hello, world!',
 * };
 *
 * const events = normalizedEntryToAgUiEvents(entry);
 * // Returns: [{ type: 'CUSTOM', name: 'TEXT_MESSAGE_CONTENT', value: { content: 'Hello, world!' } }]
 * ```
 */
export function normalizedEntryToAgUiEvents(
  entry: NormalizedEntry
): AgUiEvent[] {
  const timestamp = entry.timestamp?.getTime() || Date.now();

  switch (entry.type.kind) {
    case "assistant_message":
      return transformAssistantMessage(entry, timestamp);

    case "tool_use":
      return transformToolUse(entry, timestamp);

    case "thinking":
      return transformThinking(entry, timestamp);

    case "error":
      return transformError(entry, timestamp);

    case "system_message":
      return transformSystemMessage(entry, timestamp);

    case "user_message":
      return transformUserMessage(entry, timestamp);

    default:
      // Unknown entry type - return empty array
      return [];
  }
}

/**
 * Transform assistant message to AG-UI TEXT_MESSAGE_CONTENT event
 *
 * @param entry - Normalized entry with assistant_message type
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Array containing single TEXT_MESSAGE_CONTENT event
 */
function transformAssistantMessage(
  entry: NormalizedEntry,
  timestamp: number
): AgUiEvent[] {
  return [
    {
      type: "CUSTOM",
      timestamp,
      name: "TEXT_MESSAGE_CONTENT",
      value: { content: entry.content },
    },
  ];
}

/**
 * Transform tool use to AG-UI tool call events
 *
 * Generates multiple events based on tool status:
 * - created/running: TOOL_CALL_START + TOOL_CALL_ARGS
 * - success/failed: TOOL_CALL_START + TOOL_CALL_ARGS + TOOL_CALL_END + TOOL_CALL_RESULT
 *
 * @param entry - Normalized entry with tool_use type
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Array of tool-related AG-UI events
 */
function transformToolUse(
  entry: NormalizedEntry,
  timestamp: number
): AgUiEvent[] {
  if (entry.type.kind !== "tool_use") return [];

  const tool = entry.type.tool;
  const toolId = generateToolId(tool.toolName, entry.index);
  const events: AgUiEvent[] = [];

  // TOOL_CALL_START - always emit for tool_use entries
  events.push({
    type: "TOOL_CALL_START",
    timestamp,
    toolCallId: toolId,
    toolCallName: tool.toolName,
  });

  // TOOL_CALL_ARGS - serialize action based on type
  const args = serializeToolAction(tool.action);
  if (args) {
    events.push({
      type: "TOOL_CALL_ARGS",
      timestamp,
      toolCallId: toolId,
      delta: JSON.stringify(args),
    });
  }

  // TOOL_CALL_END and TOOL_CALL_RESULT - emit when tool completes
  if (tool.status === "success" || tool.status === "failed") {
    events.push({
      type: "TOOL_CALL_END",
      timestamp,
      toolCallId: toolId,
    });

    if (tool.result) {
      events.push({
        type: "TOOL_CALL_RESULT",
        timestamp,
        messageId: `msg-${toolId}`,
        toolCallId: toolId,
        content: serializeToolResult(tool.result),
        isError: tool.status === "failed",
      });
    }
  }

  return events;
}

/**
 * Transform thinking entry to AG-UI THINKING event
 *
 * @param entry - Normalized entry with thinking type
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Array containing single THINKING event
 */
function transformThinking(
  entry: NormalizedEntry,
  timestamp: number
): AgUiEvent[] {
  if (entry.type.kind !== "thinking") return [];

  return [
    {
      type: "CUSTOM",
      timestamp,
      name: "THINKING",
      value: {
        reasoning: entry.type.reasoning || entry.content,
      },
    },
  ];
}

/**
 * Transform error entry to AG-UI RUN_ERROR event
 *
 * @param entry - Normalized entry with error type
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Array containing single RUN_ERROR event
 */
function transformError(
  entry: NormalizedEntry,
  timestamp: number
): AgUiEvent[] {
  if (entry.type.kind !== "error") return [];

  return [
    {
      type: "RUN_ERROR",
      timestamp,
      message: entry.type.error.message,
      errorType: entry.type.error.code,
      stack: entry.type.error.stack,
    },
  ];
}

/**
 * Transform system message to AG-UI SYSTEM_MESSAGE event
 *
 * @param entry - Normalized entry with system_message type
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Array containing single SYSTEM_MESSAGE event
 */
function transformSystemMessage(
  entry: NormalizedEntry,
  timestamp: number
): AgUiEvent[] {
  return [
    {
      type: "CUSTOM",
      timestamp,
      name: "SYSTEM_MESSAGE",
      value: { content: entry.content },
    },
  ];
}

/**
 * Transform user message to AG-UI USER_MESSAGE event
 *
 * @param entry - Normalized entry with user_message type
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Array containing single USER_MESSAGE event
 */
function transformUserMessage(
  entry: NormalizedEntry,
  timestamp: number
): AgUiEvent[] {
  return [
    {
      type: "CUSTOM",
      timestamp,
      name: "USER_MESSAGE",
      value: { content: entry.content },
    },
  ];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique tool call ID
 *
 * Combines tool name and entry index to create a deterministic,
 * unique identifier for tool calls.
 *
 * @param toolName - Name of the tool (e.g., 'Bash', 'Read', 'Write')
 * @param index - Entry index from normalized output
 * @returns Tool call ID string
 *
 * @example
 * ```typescript
 * generateToolId('Bash', 5) // Returns: 'Bash-5'
 * ```
 */
function generateToolId(toolName: string, index: number): string {
  return `${toolName}-${index}`;
}

/**
 * Serialize tool action to plain object
 *
 * Converts ActionType discriminated union to a serializable object
 * suitable for JSON transmission.
 *
 * @param action - Tool action from normalized entry
 * @returns Serializable action object or null if unknown type
 */
function serializeToolAction(
  action: ActionType
): Record<string, any> | null {
  switch (action.kind) {
    case "file_read":
      return {
        kind: "file_read",
        path: action.path,
      };

    case "file_write":
      return {
        kind: "file_write",
        path: action.path,
      };

    case "file_edit":
      return {
        kind: "file_edit",
        path: action.path,
        changes: action.changes,
      };

    case "command_run":
      return {
        kind: "command_run",
        command: action.command,
        result: action.result,
      };

    case "search":
      return {
        kind: "search",
        query: action.query,
      };

    case "tool":
      return {
        kind: "tool",
        toolName: action.toolName,
        args: action.args,
        result: action.result,
      };

    default:
      return null;
  }
}

/**
 * Serialize tool result to string
 *
 * Converts tool result data to a string suitable for display.
 * Handles both string results and complex objects.
 *
 * @param result - Tool result from normalized entry
 * @returns Serialized result string
 */
function serializeToolResult(result: ToolResult): string {
  // If result has string data, return it directly
  if (typeof result.data === "string") {
    return result.data;
  }

  // If result has error, include it
  if (result.error) {
    return `Error: ${result.error}`;
  }

  // Otherwise, stringify the result data
  if (result.data !== undefined && result.data !== null) {
    try {
      return JSON.stringify(result.data, null, 2);
    } catch (error) {
      // Handle circular references or non-serializable data
      return String(result.data);
    }
  }

  // Fallback for empty results
  return "";
}

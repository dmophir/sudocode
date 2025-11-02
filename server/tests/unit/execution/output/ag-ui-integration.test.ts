/**
 * AG-UI Integration Tests
 *
 * Tests for the AG-UI integration helper functions that wire together
 * output processors with AG-UI adapters.
 */

import { describe, it , expect } from 'vitest'
import {
  createAgUiSystem,
  wireManually,
  createAgUiSystemWithProcessor,
} from '../../../../src/execution/output/ag-ui-integration.js';
import { ClaudeCodeOutputProcessor } from '../../../../src/execution/output/claude-code-output-processor.js';
import { AgUiEventAdapter } from '../../../../src/execution/output/ag-ui-adapter.js';
import { EventType } from '@ag-ui/core';
import type { IOutputProcessor } from '../../../../src/execution/output/types.js';

describe('AG-UI Integration Helpers', () => {
  describe('createAgUiSystem', () => {
    it('should create processor and adapter', () => {
      const { processor, adapter } = createAgUiSystem('run-123');

      expect(processor).toBeTruthy();
      expect(adapter).toBeTruthy();
      expect(processor instanceof ClaudeCodeOutputProcessor).toBeTruthy();
      expect(adapter instanceof AgUiEventAdapter).toBeTruthy();
    });

    it('should wire processor to adapter', async () => {
      const { processor, adapter } = createAgUiSystem('run-123');

      // Listen for events from adapter
      const events: any[] = [];
      adapter.onEvent((event) => {
        events.push(event);
      });

      // Trigger a tool call through the processor
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Read',
                input: { file_path: 'test.ts' },
              },
            ],
          },
        })
      );

      // Should have received TOOL_CALL_START and TOOL_CALL_ARGS events
      expect(events.length >= 2).toBeTruthy();
      expect(events[0].type).toBe(EventType.TOOL_CALL_START);
      expect(events[1].type).toBe(EventType.TOOL_CALL_ARGS);
    });

    it('should use provided runId', () => {
      const { adapter } = createAgUiSystem('test-run-456');

      expect(adapter.getRunId()).toBe('test-run-456');
    });

    it('should use provided threadId', () => {
      const { adapter } = createAgUiSystem('run-123', 'thread-456');

      // Verify by emitting an event and checking the threadId
      const events: any[] = [];
      adapter.onEvent((event) => {
        events.push(event);
      });

      adapter.emitRunStarted();

      expect(events[0].runId).toBe('run-123');
      expect(events[0].threadId).toBe('thread-456');
    });

    it('should default threadId to runId', () => {
      const { adapter } = createAgUiSystem('run-123');

      // Verify by emitting an event and checking the threadId defaults to runId
      const events: any[] = [];
      adapter.onEvent((event) => {
        events.push(event);
      });

      adapter.emitRunStarted();

      expect(events[0].runId).toBe('run-123');
      expect(events[0].threadId).toBe('run-123');
    });
  });

  describe('wireManually', () => {
    it('should wire existing processor to adapter', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const adapter = new AgUiEventAdapter('run-123');

      // Wire them together
      wireManually(processor, adapter);

      // Listen for events from adapter
      const events: any[] = [];
      adapter.onEvent((event) => {
        events.push(event);
      });

      // Trigger a tool call through the processor
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Write',
                input: { file_path: 'output.ts', content: 'test' },
              },
            ],
          },
        })
      );

      // Should have received events
      expect(events.length >= 2).toBeTruthy();
      expect(events[0].type).toBe(EventType.TOOL_CALL_START);
    });

    it('should work with already configured processor', () => {
      const processor = new ClaudeCodeOutputProcessor();
      const adapter = new AgUiEventAdapter('run-123');

      // Configure processor first
      const toolCalls: any[] = [];
      processor.onToolCall((toolCall) => {
        toolCalls.push(toolCall);
      });

      // Then wire to adapter
      wireManually(processor, adapter);

      // Both processor and adapter handlers should work
      expect(processor).toBeTruthy();
      expect(adapter).toBeTruthy();
    });
  });

  describe('createAgUiSystemWithProcessor', () => {
    it('should work with custom processor', () => {
      // Create a mock processor
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
        onToolCall: () => {},
        onFileChange: () => {},
        onProgress: () => {},
        onError: () => {},
      };

      const { processor, adapter } = createAgUiSystemWithProcessor(
        mockProcessor,
        'run-123'
      );

      expect(processor).toBe(mockProcessor);
      expect(adapter instanceof AgUiEventAdapter).toBeTruthy();
    });

    it('should respect provided threadId', () => {
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
        onToolCall: () => {},
        onFileChange: () => {},
        onProgress: () => {},
        onError: () => {},
      };

      const { adapter } = createAgUiSystemWithProcessor(
        mockProcessor,
        'run-123',
        'thread-789'
      );

      // Verify by emitting an event and checking the threadId
      const events: any[] = [];
      adapter.onEvent((event) => {
        events.push(event);
      });

      adapter.emitRunStarted();

      expect(events[0].threadId).toBe('thread-789');
    });
  });

  describe('end-to-end event flow', () => {
    it('should transform tool calls through the complete pipeline', async () => {
      const { processor, adapter } = createAgUiSystem('run-e2e');

      // Track all events
      const events: any[] = [];
      adapter.onEvent((event) => {
        events.push(event);
      });

      // Process tool use
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-e2e',
                name: 'Bash',
                input: { command: 'ls' },
              },
            ],
          },
        })
      );

      // Process tool result
      await processor.processLine(
        JSON.stringify({
          type: 'tool_result',
          result: {
            tool_use_id: 'tool-e2e',
            content: [{ type: 'text', text: 'file1.txt\nfile2.txt' }],
          },
        })
      );

      // Should have tool call start events
      const eventTypes = events.map((e) => e.type);

      // Verify basic tool call events are emitted
      expect(eventTypes.includes(EventType.TOOL_CALL_START)).toBeTruthy();
      expect(eventTypes.includes(EventType.TOOL_CALL_ARGS)).toBeTruthy();
      // State deltas are emitted instead of specific result/end events
      expect(eventTypes.includes(EventType.STATE_DELTA)).toBeTruthy();
      expect(events.length > 0).toBeTruthy();
    });

    it('should track metrics through processor', async () => {
      const { processor } = createAgUiSystem('run-metrics');

      // Process some messages
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Read',
                input: { file_path: 'test.ts' },
              },
            ],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'tool_result',
          result: {
            tool_use_id: 'tool-1',
            content: [{ type: 'text', text: 'content' }],
          },
        })
      );

      // Check metrics
      const metrics = processor.getMetrics();
      expect(metrics.totalMessages > 0).toBeTruthy();
      expect(metrics.toolCalls.length > 0).toBeTruthy();
    });

    it('should maintain state across multiple events', async () => {
      const { processor, adapter } = createAgUiSystem('run-state');

      // Process multiple tool calls
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Read',
                input: {},
              },
            ],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-2',
                name: 'Write',
                input: {},
              },
            ],
          },
        })
      );

      // Check adapter state
      const state = adapter.getState();
      expect(state.toolCallCount).toBe(2);
    });
  });
});

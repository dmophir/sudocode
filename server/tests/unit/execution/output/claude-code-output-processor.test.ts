/**
 * Unit tests for ClaudeCodeOutputProcessor
 *
 * Tests the core functionality of parsing Claude Code's stream-json output,
 * tracking tool calls, detecting file changes, and aggregating metrics.
 */

import { describe, it , expect } from 'vitest'
import { ClaudeCodeOutputProcessor } from '../../../../src/execution/output/claude-code-output-processor.js';
import type {
  ToolCall,
  FileChange,
  ProcessingMetrics,
} from '../../../../src/execution/output/types.js';

describe('ClaudeCodeOutputProcessor', () => {
  describe('Initialization', () => {
    it('should initialize with empty metrics', () => {
      const processor = new ClaudeCodeOutputProcessor();
      const metrics = processor.getMetrics();

      expect(metrics.totalMessages).toBe(0);
      expect(metrics.toolCalls).toEqual([]);
      expect(metrics.fileChanges).toEqual([]);
      expect(metrics.errors).toEqual([]);
      expect(metrics.usage.inputTokens).toBe(0);
      expect(metrics.usage.outputTokens).toBe(0);
      expect(metrics.usage.cacheTokens).toBe(0);
      expect(metrics.usage.totalTokens).toBe(0);
      expect(metrics.usage.cost).toBe(0);
      expect(metrics.usage.provider).toBe('anthropic');
    });

    it('should initialize with empty tool calls', () => {
      const processor = new ClaudeCodeOutputProcessor();
      expect(processor.getToolCalls()).toEqual([]);
    });

    it('should initialize with empty file changes', () => {
      const processor = new ClaudeCodeOutputProcessor();
      expect(processor.getFileChanges()).toEqual([]);
    });
  });

  describe('Line Parsing', () => {
    it('should skip empty lines', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      await processor.processLine('');
      await processor.processLine('   ');
      await processor.processLine('\n');

      const metrics = processor.getMetrics();
      expect(metrics.totalMessages).toBe(0);
    });

    it('should handle malformed JSON gracefully', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      let errorCalls = 0;
      const errorHandler = () => {
        errorCalls++;
      };
      processor.onError(errorHandler);

      await processor.processLine('not valid json');

      const metrics = processor.getMetrics();
      expect(metrics.errors.length).toBe(1);
      expect(metrics.errors[0].message.includes('Failed to parse')).toBeTruthy();
      expect(errorCalls).toBe(1);
    });

    it('should parse valid JSON and increment message count', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      await processor.processLine('{"type":"assistant","message":{"content":"Hello"}}');

      const metrics = processor.getMetrics();
      expect(metrics.totalMessages).toBe(1);
    });

    it('should track line numbers for error reporting', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const errorCalls: any[] = [];
      processor.onError((error) => {
        errorCalls.push(error);
      });

      await processor.processLine('{}');
      await processor.processLine('invalid json');

      expect(errorCalls.length).toBe(1);
      expect(errorCalls[0].message.includes('line 2')).toBeTruthy();
    });
  });

  describe('Message Type Detection', () => {
    it('should detect text messages', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const json = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello, world!' }],
        },
      });

      await processor.processLine(json);

      const metrics = processor.getMetrics();
      expect(metrics.totalMessages).toBe(1);
    });

    it('should detect tool_use messages', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const toolCallArgs: any[] = [];
      processor.onToolCall((arg) => {
        toolCallArgs.push(arg);
      });

      const json = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'Read',
              input: { file_path: 'test.ts' },
            },
          ],
        },
      });

      await processor.processLine(json);

      expect(toolCallArgs.length).toBe(1);
      const toolCall = toolCallArgs[0] as ToolCall;
      expect(toolCall.id).toBe('tool-123');
      expect(toolCall.name).toBe('Read');
      expect(toolCall.status).toBe('pending');
    });

    it('should detect usage messages', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const json = JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 10,
        },
      });

      await processor.processLine(json);

      const metrics = processor.getMetrics();
      expect(metrics.usage.inputTokens).toBe(100);
      expect(metrics.usage.outputTokens).toBe(50);
      expect(metrics.usage.cacheTokens).toBe(10);
    });

    it('should detect error messages', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const errorCalls: any[] = [];
      processor.onError((error) => {
        errorCalls.push(error);
      });

      const json = JSON.stringify({
        type: 'error',
        error: {
          message: 'Something went wrong',
        },
      });

      await processor.processLine(json);

      expect(errorCalls.length).toBe(1);
      expect(errorCalls[0].message).toBe('Something went wrong');
    });
  });

  describe('Tool Call Tracking', () => {
    it('should track tool_use with pending status', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const json = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-456',
              name: 'Bash',
              input: { command: 'ls -la' },
            },
          ],
        },
      });

      await processor.processLine(json);

      const toolCalls = processor.getToolCalls();
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].id).toBe('tool-456');
      expect(toolCalls[0].name).toBe('Bash');
      expect(toolCalls[0].status).toBe('pending');
      expect(toolCalls[0].input).toEqual({ command: 'ls -la' });
    });

    it('should update tool call status on tool_result', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // First, process tool_use
      const toolUseJson = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-789',
              name: 'Read',
              input: { file_path: 'test.ts' },
            },
          ],
        },
      });
      await processor.processLine(toolUseJson);

      // Then, process tool_result
      const toolResultJson = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-789',
              content: 'file contents here',
              is_error: false,
            },
          ],
        },
      });
      await processor.processLine(toolResultJson);

      const toolCalls = processor.getToolCalls();
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].status).toBe('success');
      expect(toolCalls[0].result).toBe('file contents here');
      expect(toolCalls[0].completedAt !== undefined).toBeTruthy();
    });

    it('should mark tool call as error on error result', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Process tool_use
      const toolUseJson = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-error',
              name: 'Bash',
              input: { command: 'invalid-command' },
            },
          ],
        },
      });
      await processor.processLine(toolUseJson);

      // Process error result
      const toolResultJson = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-error',
              content: 'Command not found',
              is_error: true,
            },
          ],
        },
      });
      await processor.processLine(toolResultJson);

      const toolCalls = processor.getToolCalls();
      expect(toolCalls[0].status).toBe('error');
      expect(toolCalls[0].error).toBe('Command not found');
    });

    it('should handle tool_result without matching tool_use gracefully', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const toolResultJson = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'nonexistent-tool',
              content: 'result',
              is_error: false,
            },
          ],
        },
      });

      // Should not throw
      await processor.processLine(toolResultJson);

      const toolCalls = processor.getToolCalls();
      expect(toolCalls.length).toBe(0);
    });
  });

  describe('File Change Detection', () => {
    it('should detect file read from Read tool', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const fileChangeCalls: any[] = [];
      processor.onFileChange((change) => {
        fileChangeCalls.push(change);
      });

      // Tool use
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'read-1',
                name: 'Read',
                input: { file_path: '/path/to/file.ts' },
              },
            ],
          },
        })
      );

      // Tool result
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'read-1',
                content: 'file contents',
                is_error: false,
              },
            ],
          },
        })
      );

      expect(fileChangeCalls.length).toBe(1);
      const fileChange = fileChangeCalls[0] as FileChange;
      expect(fileChange.path).toBe('/path/to/file.ts');
      expect(fileChange.operation).toBe('read');
      expect(fileChange.toolCallId).toBe('read-1');
    });

    it('should detect file write from Write tool', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const fileChangeCalls: any[] = [];
      processor.onFileChange((change) => {
        fileChangeCalls.push(change);
      });

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'write-1',
                name: 'Write',
                input: { file_path: '/path/to/new.ts', content: 'code' },
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
                type: 'tool_result',
                tool_use_id: 'write-1',
                content: 'File written successfully',
                is_error: false,
              },
            ],
          },
        })
      );

      expect(fileChangeCalls.length).toBe(1);
      const fileChange = fileChangeCalls[0] as FileChange;
      expect(fileChange.path).toBe('/path/to/new.ts');
      expect(fileChange.operation).toBe('write');
    });

    it('should detect file edit from Edit tool', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const fileChangeCalls: any[] = [];
      processor.onFileChange((change) => {
        fileChangeCalls.push(change);
      });

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'edit-1',
                name: 'Edit',
                input: {
                  file_path: '/path/to/edit.ts',
                  old_string: 'old',
                  new_string: 'new',
                },
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
                type: 'tool_result',
                tool_use_id: 'edit-1',
                content: 'Edit successful',
                is_error: false,
              },
            ],
          },
        })
      );

      expect(fileChangeCalls.length).toBe(1);
      const fileChange = fileChangeCalls[0] as FileChange;
      expect(fileChange.path).toBe('/path/to/edit.ts');
      expect(fileChange.operation).toBe('edit');
    });

    it('should not detect file changes for non-file-operation tools', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      let fileChangeCallCount = 0;
      processor.onFileChange(() => {
        fileChangeCallCount++;
      });

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bash-1',
                name: 'Bash',
                input: { command: 'echo hello' },
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
                type: 'tool_result',
                tool_use_id: 'bash-1',
                content: 'hello',
                is_error: false,
              },
            ],
          },
        })
      );

      expect(fileChangeCallCount).toBe(0);
    });

    it('should track file changes in metrics', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'read-2',
                name: 'Read',
                input: { file_path: 'test.ts' },
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
                type: 'tool_result',
                tool_use_id: 'read-2',
                content: 'contents',
                is_error: false,
              },
            ],
          },
        })
      );

      const fileChanges = processor.getFileChanges();
      expect(fileChanges.length).toBe(1);
      expect(fileChanges[0].path).toBe('test.ts');
    });
  });

  describe('Usage Metrics', () => {
    it('should aggregate token usage', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      await processor.processLine(
        JSON.stringify({
          type: 'result',
          usage: {
            input_tokens: 100,
            output_tokens: 200,
            cache_read_input_tokens: 50,
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'result',
          usage: {
            input_tokens: 150,
            output_tokens: 100,
            cache_creation_input_tokens: 25,
          },
        })
      );

      const metrics = processor.getMetrics();
      expect(metrics.usage.inputTokens).toBe(250);
      expect(metrics.usage.outputTokens).toBe(300);
      expect(metrics.usage.cacheTokens).toBe(75);
      expect(metrics.usage.totalTokens).toBe(550);
    });

    it('should calculate cost correctly', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      await processor.processLine(
        JSON.stringify({
          type: 'result',
          usage: {
            input_tokens: 1_000_000, // 1M tokens
            output_tokens: 1_000_000, // 1M tokens
            cache_read_input_tokens: 1_000_000, // 1M tokens
          },
        })
      );

      const metrics = processor.getMetrics();
      // Input: $3/M, Output: $15/M, Cache: $0.30/M
      // Cost = (1M * 3) + (1M * 15) + (1M * 0.30) = $18.30
      const expectedCost = 18.3;
      expect(metrics.usage.cost !== undefined).toBeTruthy();
      expect(Math.abs(metrics.usage.cost - expectedCost) < 0.01).toBeTruthy();
    });
  });

  describe('Event Handlers', () => {
    it('should emit onToolCall when tool is invoked', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      let callCount = 0;
      processor.onToolCall(() => {
        callCount++;
      });

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tool-event',
                name: 'Test',
                input: {},
              },
            ],
          },
        })
      );

      expect(callCount).toBe(1);
    });

    it('should emit onFileChange when file is modified', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      let callCount = 0;
      processor.onFileChange(() => {
        callCount++;
      });

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'write-event',
                name: 'Write',
                input: { file_path: 'test.ts', content: 'code' },
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
                type: 'tool_result',
                tool_use_id: 'write-event',
                content: 'success',
                is_error: false,
              },
            ],
          },
        })
      );

      expect(callCount).toBe(1);
    });

    it('should emit onProgress periodically', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      const progressCalls: any[] = [];
      processor.onProgress((metrics) => {
        progressCalls.push(metrics);
      });

      await processor.processLine('{"type":"assistant","message":{"content":"test"}}');

      expect(progressCalls.length > 0).toBeTruthy();
      const metrics = progressCalls[0] as ProcessingMetrics;
      expect(metrics.totalMessages).toBe(1);
    });

    it('should emit onError for errors', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      let callCount = 0;
      processor.onError(() => {
        callCount++;
      });

      await processor.processLine(
        JSON.stringify({
          type: 'error',
          error: { message: 'Test error' },
        })
      );

      expect(callCount).toBe(1);
    });

    it('should support multiple event handlers', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      let handler1CallCount = 0;
      let handler2CallCount = 0;

      processor.onToolCall(() => {
        handler1CallCount++;
      });
      processor.onToolCall(() => {
        handler2CallCount++;
      });

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'multi-handler',
                name: 'Test',
                input: {},
              },
            ],
          },
        })
      );

      expect(handler1CallCount).toBe(1);
      expect(handler2CallCount).toBe(1);
    });

    it('should handle errors in event handlers gracefully', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      let normalHandlerCalled = false;

      processor.onToolCall(() => {
        throw new Error('Handler error');
      });
      processor.onToolCall(() => {
        normalHandlerCalled = true;
      });

      // Should not throw despite handler error
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'error-handler',
                name: 'Test',
                input: {},
              },
            ],
          },
        })
      );

      // Normal handler should still be called
      expect(normalHandlerCalled).toBeTruthy();
    });
  });

  describe('Metrics Consistency', () => {
    it('should return defensive copies of metrics arrays', () => {
      const processor = new ClaudeCodeOutputProcessor();
      const metrics1 = processor.getMetrics();
      metrics1.toolCalls.push({
        id: 'fake',
        name: 'fake',
        input: {},
        status: 'pending',
        timestamp: new Date(),
      });

      const metrics2 = processor.getMetrics();
      expect(metrics2.toolCalls.length).toBe(0);
    });

    it('should keep tool calls in both Map and metrics array in sync', async () => {
      const processor = new ClaudeCodeOutputProcessor();
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'sync-test',
                name: 'Test',
                input: {},
              },
            ],
          },
        })
      );

      const toolCallsFromMap = processor.getToolCalls();
      const toolCallsFromMetrics = processor.getMetrics().toolCalls;

      expect(toolCallsFromMap.length).toBe(1);
      expect(toolCallsFromMetrics.length).toBe(1);
      expect(toolCallsFromMap[0].id).toBe(toolCallsFromMetrics[0].id);
    });
  });

  describe('Query Methods', () => {
    it('should filter tool calls by name', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Add multiple tool calls with different names
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'ls' } },
            ],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: 'test.ts' } },
            ],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 'bash-2', name: 'Bash', input: { command: 'pwd' } },
            ],
          },
        })
      );

      const bashCalls = processor.getToolCallsByName('Bash');
      const readCalls = processor.getToolCallsByName('Read');

      expect(bashCalls.length).toBe(2);
      expect(readCalls.length).toBe(1);
      expect(bashCalls[0].name).toBe('Bash');
      expect(readCalls[0].name).toBe('Read');
    });

    it('should filter file changes by path', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Add file changes to different paths
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'read-1',
                name: 'Read',
                input: { file_path: 'src/index.ts' },
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
                type: 'tool_result',
                tool_use_id: 'read-1',
                content: 'content',
                is_error: false,
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
                id: 'read-2',
                name: 'Read',
                input: { file_path: 'src/test.ts' },
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
                type: 'tool_result',
                tool_use_id: 'read-2',
                content: 'content',
                is_error: false,
              },
            ],
          },
        })
      );

      const indexChanges = processor.getFileChangesByPath('src/index.ts');
      const testChanges = processor.getFileChangesByPath('src/test.ts');

      expect(indexChanges.length).toBe(1);
      expect(testChanges.length).toBe(1);
      expect(indexChanges[0].path).toBe('src/index.ts');
    });

    it('should filter file changes by operation', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Add Read, Write, and Edit operations
      const operations = [
        { id: 'read-1', name: 'Read', path: 'file1.ts' },
        { id: 'write-1', name: 'Write', path: 'file2.ts' },
        { id: 'edit-1', name: 'Edit', path: 'file3.ts' },
        { id: 'read-2', name: 'Read', path: 'file4.ts' },
      ];

      for (const op of operations) {
        await processor.processLine(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: op.id,
                  name: op.name,
                  input: { file_path: op.path },
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
                  type: 'tool_result',
                  tool_use_id: op.id,
                  content: 'success',
                  is_error: false,
                },
              ],
            },
          })
        );
      }

      const reads = processor.getFileChangesByOperation('read');
      const writes = processor.getFileChangesByOperation('write');
      const edits = processor.getFileChangesByOperation('edit');

      expect(reads.length).toBe(2);
      expect(writes.length).toBe(1);
      expect(edits.length).toBe(1);
    });

    it('should get only failed tool calls', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Add successful and failed tool calls
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'success-1', name: 'Bash', input: {} }],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'success-1',
                content: 'success',
                is_error: false,
              },
            ],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'fail-1', name: 'Bash', input: {} }],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'fail-1',
                content: 'error',
                is_error: true,
              },
            ],
          },
        })
      );

      const failed = processor.getFailedToolCalls();

      expect(failed.length).toBe(1);
      expect(failed[0].status).toBe('error');
      expect(failed[0].id).toBe('fail-1');
    });

    it('should get only successful tool calls', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Add successful and failed tool calls
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'success-1', name: 'Bash', input: {} }],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'success-1',
                content: 'success',
                is_error: false,
              },
            ],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'fail-1', name: 'Bash', input: {} }],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'fail-1',
                content: 'error',
                is_error: true,
              },
            ],
          },
        })
      );

      const successful = processor.getSuccessfulToolCalls();

      expect(successful.length).toBe(1);
      expect(successful[0].status).toBe('success');
      expect(successful[0].id).toBe('success-1');
    });

    it('should get total cost', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      await processor.processLine(
        JSON.stringify({
          type: 'result',
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_input_tokens: 100,
          },
        })
      );

      const cost = processor.getTotalCost();

      // Input: 1000 * $3/1M = $0.003
      // Output: 500 * $15/1M = $0.0075
      // Cache: 100 * $0.30/1M = $0.00003
      // Total: ~$0.01053
      expect(cost > 0).toBeTruthy();
      expect(cost < 1).toBeTruthy(); // Should be a small fraction of a dollar
    });

    it('should return zero cost when no usage tracked', () => {
      const processor = new ClaudeCodeOutputProcessor();
      const cost = processor.getTotalCost();
      expect(cost).toBe(0);
    });
  });

  describe('Execution Summary', () => {
    it('should generate complete execution summary', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Add various tool calls
      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'bash-1', name: 'Bash', input: {} }],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'bash-1',
                content: 'success',
                is_error: false,
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
              { type: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: 'test.ts' } },
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
                type: 'tool_result',
                tool_use_id: 'read-1',
                content: 'contents',
                is_error: false,
              },
            ],
          },
        })
      );

      // Add usage
      await processor.processLine(
        JSON.stringify({
          type: 'result',
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
          },
        })
      );

      const summary = processor.getExecutionSummary();

      expect(summary.totalMessages).toBe(5);
      expect(summary.toolCallsByType['Bash']).toBe(1);
      expect(summary.toolCallsByType['Read']).toBe(1);
      expect(summary.fileOperationsByType['read']).toBe(1);
      expect(summary.successRate).toBe(100);
      expect(summary.totalTokens.input).toBe(1000);
      expect(summary.totalTokens.output).toBe(500);
      expect(summary.totalCost > 0).toBeTruthy();
      expect(summary.duration >= 0).toBeTruthy();
      expect(summary.startTime instanceof Date).toBeTruthy();
    });

    it('should calculate success rate correctly', async () => {
      const processor = new ClaudeCodeOutputProcessor();

      // Add 2 successful and 1 failed
      for (let i = 0; i < 2; i++) {
        await processor.processLine(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [{ type: 'tool_use', id: `success-${i}`, name: 'Bash', input: {} }],
            },
          })
        );

        await processor.processLine(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: `success-${i}`,
                  content: 'ok',
                  is_error: false,
                },
              ],
            },
          })
        );
      }

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'fail-1', name: 'Bash', input: {} }],
          },
        })
      );

      await processor.processLine(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'fail-1',
                content: 'error',
                is_error: true,
              },
            ],
          },
        })
      );

      const summary = processor.getExecutionSummary();

      // 2 successful out of 3 total = 66.67%
      expect(Math.abs(summary.successRate - 66.67) < 0.1).toBeTruthy();
    });

    it('should handle empty state gracefully', () => {
      const processor = new ClaudeCodeOutputProcessor();
      const summary = processor.getExecutionSummary();

      expect(summary.totalMessages).toBe(0);
      expect(summary.toolCallsByType).toEqual({});
      expect(summary.fileOperationsByType).toEqual({});
      expect(summary.successRate).toBe(0);
      expect(summary.totalCost).toBe(0);
    });
  });
});

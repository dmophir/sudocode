/**
 * Tests for todoExtractor utility functions
 *
 * Tests both legacy ToolCallTracking format (buildTodoHistory) and
 * ACP ToolCall format (buildTodoHistoryFromToolCalls) used for Claude Code.
 */

import { describe, it, expect } from 'vitest'
import {
  buildTodoHistory,
  buildTodoHistoryFromToolCalls,
} from '@/utils/todoExtractor'
import type { ToolCallTracking } from '@/types/stream'
import type { ToolCall } from '@/hooks/useSessionUpdateStream'

describe('todoExtractor', () => {
  describe('buildTodoHistoryFromToolCalls (ACP format)', () => {
    it('should return empty array for no tool calls', () => {
      const result = buildTodoHistoryFromToolCalls([])
      expect(result).toEqual([])
    })

    it('should return empty array when no TodoWrite/TodoRead calls', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'Bash',
          status: 'success',
          rawInput: { command: 'npm test' },
          timestamp: new Date(1000),
        },
      ]
      const result = buildTodoHistoryFromToolCalls(toolCalls)
      expect(result).toEqual([])
    })

    it('should extract todos from TodoWrite with rawInput as object', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            todos: [
              { content: 'Task 1', status: 'pending', activeForm: 'Task 1' },
              { content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' },
            ],
          },
          timestamp: new Date(1000),
          completedAt: new Date(1100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('Task 1')
      expect(result[0].status).toBe('pending')
      expect(result[1].content).toBe('Task 2')
      expect(result[1].status).toBe('in_progress')
    })

    it('should extract todos from TodoWrite with rawInput as JSON string', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'success',
          rawInput: JSON.stringify({
            todos: [
              { content: 'Task A', status: 'completed', activeForm: 'Task A done' },
            ],
          }),
          timestamp: new Date(1000),
          completedAt: new Date(1100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Task A')
      expect(result[0].status).toBe('completed')
      expect(result[0].wasCompleted).toBe(true)
    })

    it('should handle nested args format from Claude Code', () => {
      // Claude Code sometimes sends: { args: { todos: [...] } }
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            args: {
              todos: [
                { content: 'Nested task', status: 'pending', activeForm: 'Nested task' },
              ],
            },
          },
          timestamp: new Date(1000),
          completedAt: new Date(1100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Nested task')
    })

    it('should extract todos from TodoRead result', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoRead',
          status: 'success',
          rawInput: {},
          result: {
            todos: [
              { content: 'Read task 1', status: 'pending' },
              { content: 'Read task 2', status: 'completed' },
            ],
          },
          timestamp: new Date(1000),
          completedAt: new Date(1100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('Read task 1')
      expect(result[1].content).toBe('Read task 2')
      expect(result[1].wasCompleted).toBe(true)
    })

    it('should use rawOutput as fallback for TodoRead result', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoRead',
          status: 'success',
          rawInput: {},
          rawOutput: {
            todos: [{ content: 'From rawOutput', status: 'pending' }],
          },
          timestamp: new Date(1000),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('From rawOutput')
    })

    it('should only process completed (success) tool calls', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'pending', // Not success
          rawInput: { todos: [{ content: 'Pending task', status: 'pending' }] },
          timestamp: new Date(1000),
        },
        {
          id: 'tool-2',
          title: 'TodoWrite',
          status: 'running', // Not success
          rawInput: { todos: [{ content: 'Running task', status: 'pending' }] },
          timestamp: new Date(2000),
        },
        {
          id: 'tool-3',
          title: 'TodoWrite',
          status: 'success', // Only this should be processed
          rawInput: { todos: [{ content: 'Completed task', status: 'pending' }] },
          timestamp: new Date(3000),
          completedAt: new Date(3100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Completed task')
    })

    it('should track todo state changes across multiple writes', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            todos: [
              { content: 'Task 1', status: 'pending', activeForm: 'Task 1' },
              { content: 'Task 2', status: 'pending', activeForm: 'Task 2' },
            ],
          },
          timestamp: new Date(1000),
          completedAt: new Date(1100),
        },
        {
          id: 'tool-2',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            todos: [
              { content: 'Task 1', status: 'completed', activeForm: 'Task 1 done' },
              { content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' },
            ],
          },
          timestamp: new Date(2000),
          completedAt: new Date(2100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(2)
      // Task 1 should be marked as completed
      const task1 = result.find((t) => t.content === 'Task 1')
      expect(task1?.status).toBe('completed')
      expect(task1?.wasCompleted).toBe(true)
      // Task 2 should be in_progress
      const task2 = result.find((t) => t.content === 'Task 2')
      expect(task2?.status).toBe('in_progress')
    })

    it('should mark todos as removed when they disappear from the list', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            todos: [
              { content: 'Task A', status: 'pending' },
              { content: 'Task B', status: 'pending' },
              { content: 'Task C', status: 'pending' },
            ],
          },
          timestamp: new Date(1000),
          completedAt: new Date(1100),
        },
        {
          id: 'tool-2',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            todos: [
              // Task B removed
              { content: 'Task A', status: 'completed' },
              { content: 'Task C', status: 'in_progress' },
            ],
          },
          timestamp: new Date(2000),
          completedAt: new Date(2100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      expect(result).toHaveLength(3)
      const taskB = result.find((t) => t.content === 'Task B')
      expect(taskB?.wasRemoved).toBe(true)
    })

    it('should handle malformed rawInput gracefully', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'success',
          rawInput: 'not valid json {{',
          timestamp: new Date(1000),
        },
        {
          id: 'tool-2',
          title: 'TodoWrite',
          status: 'success',
          rawInput: { notTodos: [] }, // Missing todos array
          timestamp: new Date(2000),
        },
      ]

      // Should not throw, just return empty
      const result = buildTodoHistoryFromToolCalls(toolCalls)
      expect(result).toEqual([])
    })

    it('should sort tool calls by timestamp before processing', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'tool-2',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            todos: [{ content: 'Task', status: 'completed' }],
          },
          timestamp: new Date(2000), // Later
          completedAt: new Date(2100),
        },
        {
          id: 'tool-1',
          title: 'TodoWrite',
          status: 'success',
          rawInput: {
            todos: [{ content: 'Task', status: 'pending' }],
          },
          timestamp: new Date(1000), // Earlier (but second in array)
          completedAt: new Date(1100),
        },
      ]

      const result = buildTodoHistoryFromToolCalls(toolCalls)

      // Should process in timestamp order, so final state is 'completed'
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('completed')
    })
  })

  describe('buildTodoHistory (legacy ToolCallTracking format)', () => {
    it('should extract todos from legacy format', () => {
      const toolCalls = new Map<string, ToolCallTracking>([
        [
          'tool-1',
          {
            toolCallId: 'tool-1',
            toolCallName: 'TodoWrite',
            args: JSON.stringify({
              todos: [{ content: 'Legacy task', status: 'pending', activeForm: 'Legacy task' }],
            }),
            status: 'completed',
            result: 'Success',
            startTime: 1000,
            endTime: 1100,
          },
        ],
      ])

      const result = buildTodoHistory(toolCalls)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Legacy task')
    })

    it('should handle nested args structure in legacy format', () => {
      const toolCalls = new Map<string, ToolCallTracking>([
        [
          'tool-1',
          {
            toolCallId: 'tool-1',
            toolCallName: 'TodoWrite',
            args: JSON.stringify({
              toolName: 'TodoWrite',
              args: {
                todos: [{ content: 'Nested legacy', status: 'completed' }],
              },
            }),
            status: 'completed',
            result: 'Success',
            startTime: 1000,
            endTime: 1100,
          },
        ],
      ])

      const result = buildTodoHistory(toolCalls)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Nested legacy')
      expect(result[0].wasCompleted).toBe(true)
    })
  })
})

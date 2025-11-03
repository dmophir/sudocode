/**
 * AgentTrajectory Component Tests
 *
 * Tests for the unified agent trajectory visualization
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentTrajectory } from '@/components/executions/AgentTrajectory'
import type { MessageBuffer, ToolCallTracking } from '@/hooks/useAgUiStream'

describe('AgentTrajectory', () => {
  describe('Empty State', () => {
    it('should return null when no messages or tool calls', () => {
      const messages = new Map<string, MessageBuffer>()
      const toolCalls = new Map<string, ToolCallTracking>()

      const { container } = render(
        <AgentTrajectory messages={messages} toolCalls={toolCalls} />
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Message Display', () => {
    it('should display messages with role badge', () => {
      const messages = new Map<string, MessageBuffer>()
      messages.set('msg-1', {
        messageId: 'msg-1',
        timestamp: Date.now(),
        role: 'assistant',
        content: 'Hello, this is a test message!',
        complete: true,
      })

      const toolCalls = new Map<string, ToolCallTracking>()

      render(<AgentTrajectory messages={messages} toolCalls={toolCalls} />)

      expect(screen.getByText('assistant')).toBeInTheDocument()
      expect(screen.getByText('Hello, this is a test message!')).toBeInTheDocument()
    })

    it('should show spinner for incomplete messages', () => {
      const messages = new Map<string, MessageBuffer>()
      messages.set('msg-1', {
        messageId: 'msg-1',
        timestamp: Date.now(),
        role: 'assistant',
        content: 'Streaming...',
        complete: false,
      })

      const toolCalls = new Map<string, ToolCallTracking>()

      const { container } = render(
        <AgentTrajectory messages={messages} toolCalls={toolCalls} />
      )

      const spinners = container.querySelectorAll('.animate-spin')
      expect(spinners.length).toBeGreaterThan(0)
    })
  })

  describe('Tool Call Display', () => {
    it('should display tool calls with status badge', () => {
      const messages = new Map<string, MessageBuffer>()
      const toolCalls = new Map<string, ToolCallTracking>()
      toolCalls.set('tool-1', {
        toolCallId: 'tool-1',
        toolCallName: 'Read',
        args: '{"file": "test.ts"}',
        status: 'completed',
        result: 'File contents here',
        startTime: 1000,
        endTime: 2000,
      })

      render(<AgentTrajectory messages={messages} toolCalls={toolCalls} />)

      expect(screen.getByText('Read')).toBeInTheDocument()
      const completedBadges = screen.getAllByText('completed')
      expect(completedBadges.length).toBeGreaterThan(0)
      expect(screen.getByText('1.00s')).toBeInTheDocument()
    })

    it('should display tool call with error', () => {
      const messages = new Map<string, MessageBuffer>()
      const toolCalls = new Map<string, ToolCallTracking>()
      toolCalls.set('tool-1', {
        toolCallId: 'tool-1',
        toolCallName: 'Write',
        args: '{"file": "test.ts"}',
        status: 'error',
        error: 'File not found',
        startTime: 1000,
        endTime: 2000,
      })

      render(<AgentTrajectory messages={messages} toolCalls={toolCalls} />)

      expect(screen.getByText('Write')).toBeInTheDocument()
      expect(screen.getByText('File not found')).toBeInTheDocument()
    })
  })

  describe('Chronological Ordering', () => {
    it('should display messages and tool calls in chronological order', () => {
      const messages = new Map<string, MessageBuffer>()
      messages.set('msg-1', {
        messageId: 'msg-1',
        timestamp: 1000,
        role: 'assistant',
        content: 'First message',
        complete: true,
      })
      messages.set('msg-2', {
        messageId: 'msg-2',
        timestamp: 3000,
        role: 'assistant',
        content: 'Third message',
        complete: true,
      })

      const toolCalls = new Map<string, ToolCallTracking>()
      toolCalls.set('tool-1', {
        toolCallId: 'tool-1',
        toolCallName: 'Read',
        args: '{}',
        status: 'completed',
        startTime: 2000,
        endTime: 2500,
      })

      const { container } = render(
        <AgentTrajectory messages={messages} toolCalls={toolCalls} />
      )

      // Get all trajectory items in order
      const items = container.querySelectorAll('.flex.gap-3.items-start')
      expect(items.length).toBe(3)

      // Verify order: msg-1 (1000), tool-1 (2000), msg-2 (3000)
      // We can check by looking at the content
      const firstItem = items[0]
      expect(firstItem.textContent).toContain('First message')

      const secondItem = items[1]
      expect(secondItem.textContent).toContain('Read')

      const thirdItem = items[2]
      expect(thirdItem.textContent).toContain('Third message')
    })
  })

  describe('Markdown Rendering', () => {
    it('should render markdown when renderMarkdown is true', () => {
      const messages = new Map<string, MessageBuffer>()
      messages.set('msg-1', {
        messageId: 'msg-1',
        timestamp: Date.now(),
        role: 'assistant',
        content: '**Bold text** and *italic text*',
        complete: true,
      })

      const toolCalls = new Map<string, ToolCallTracking>()

      const { container } = render(
        <AgentTrajectory messages={messages} toolCalls={toolCalls} renderMarkdown={true} />
      )

      // ReactMarkdown will render these as <strong> and <em> tags
      expect(container.querySelector('strong')).toBeInTheDocument()
      expect(container.querySelector('em')).toBeInTheDocument()
    })

    it('should render plain text when renderMarkdown is false', () => {
      const messages = new Map<string, MessageBuffer>()
      messages.set('msg-1', {
        messageId: 'msg-1',
        timestamp: Date.now(),
        role: 'assistant',
        content: '**Bold text** and *italic text*',
        complete: true,
      })

      const toolCalls = new Map<string, ToolCallTracking>()

      const { container } = render(
        <AgentTrajectory messages={messages} toolCalls={toolCalls} renderMarkdown={false} />
      )

      // Should not have strong or em tags
      expect(container.querySelector('strong')).not.toBeInTheDocument()
      expect(container.querySelector('em')).not.toBeInTheDocument()
      // Should have the raw markdown text
      expect(screen.getByText('**Bold text** and *italic text*')).toBeInTheDocument()
    })
  })

  describe('Mixed Content', () => {
    it('should handle multiple messages and tool calls together', () => {
      const messages = new Map<string, MessageBuffer>()
      messages.set('msg-1', {
        messageId: 'msg-1',
        timestamp: 1000,
        role: 'assistant',
        content: 'First message',
        complete: true,
      })
      messages.set('msg-2', {
        messageId: 'msg-2',
        timestamp: 3000,
        role: 'assistant',
        content: 'Second message',
        complete: true,
      })

      const toolCalls = new Map<string, ToolCallTracking>()
      toolCalls.set('tool-1', {
        toolCallId: 'tool-1',
        toolCallName: 'Read',
        args: '{}',
        status: 'completed',
        startTime: 2000,
        endTime: 2500,
      })
      toolCalls.set('tool-2', {
        toolCallId: 'tool-2',
        toolCallName: 'Write',
        args: '{}',
        status: 'completed',
        startTime: 4000,
        endTime: 4500,
      })

      render(<AgentTrajectory messages={messages} toolCalls={toolCalls} />)

      // All items should be displayed
      expect(screen.getByText('First message')).toBeInTheDocument()
      expect(screen.getByText('Second message')).toBeInTheDocument()
      expect(screen.getByText('Read')).toBeInTheDocument()
      expect(screen.getByText('Write')).toBeInTheDocument()
    })
  })
})

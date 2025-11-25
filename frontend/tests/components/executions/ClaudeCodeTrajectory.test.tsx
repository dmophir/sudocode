/**
 * Tests for ClaudeCodeTrajectory component
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClaudeCodeTrajectory } from '@/components/executions/ClaudeCodeTrajectory'
import type { MessageBuffer, ToolCallTracking } from '@/hooks/useAgUiStream'

describe('ClaudeCodeTrajectory', () => {
  it('should render messages in chronological order', () => {
    const messages = new Map<string, MessageBuffer>([
      [
        'msg-1',
        {
          messageId: 'msg-1',
          role: 'assistant',
          content: 'First message',
          complete: true,
          timestamp: 1000,
          index: 0,
        },
      ],
      [
        'msg-2',
        {
          messageId: 'msg-2',
          role: 'assistant',
          content: 'Second message',
          complete: true,
          timestamp: 2000,
          index: 1,
        },
      ],
    ])

    render(<ClaudeCodeTrajectory messages={messages} toolCalls={new Map()} />)

    const messageElements = screen.getAllByText(/message/)
    expect(messageElements[0].textContent).toContain('First')
    expect(messageElements[1].textContent).toContain('Second')
  })

  it('should render messages with dot indicator', () => {
    const messages = new Map<string, MessageBuffer>([
      [
        'msg-1',
        {
          messageId: 'msg-1',
          role: 'assistant',
          content: "Let me think about this problem...",
          complete: true,
          timestamp: 1000,
          index: 0,
        },
      ],
    ])

    const { container } = render(<ClaudeCodeTrajectory messages={messages} toolCalls={new Map()} />)

    // Should have the message content
    expect(screen.getByText(/Let me think/)).toBeInTheDocument()
    // Should have the dot indicator (⏺)
    expect(container.textContent).toContain('⏺')
  })

  it('should render tool calls in terminal style', () => {
    const toolCalls = new Map<string, ToolCallTracking>([
      [
        'tool-1',
        {
          toolCallId: 'tool-1',
          toolCallName: 'Bash',
          args: JSON.stringify({ command: 'npm test', description: 'Running tests' }),
          status: 'completed',
          result: 'Tests passed',
          startTime: 1000,
          endTime: 2000,
          index: 0,
        },
      ],
    ])

    const { container } = render(<ClaudeCodeTrajectory messages={new Map()} toolCalls={toolCalls} />)

    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.getByText('1.00s')).toBeInTheDocument()
    // Should have green dot for completed tool (⏺)
    expect(container.querySelector('.text-green-600')).toBeInTheDocument()
    // Should have branch character (∟)
    expect(container.textContent).toContain('∟')
    // Result should show preview (first 2 lines) by default
    expect(screen.getByText('Tests passed')).toBeInTheDocument()
  })

  it('should show tool args inline with preview', () => {
    const toolCalls = new Map<string, ToolCallTracking>([
      [
        'tool-1',
        {
          toolCallId: 'tool-1',
          toolCallName: 'Read',
          args: JSON.stringify({ file_path: '/test.ts', description: 'Reading test file' }, null, 2),
          status: 'completed',
          result: 'file contents...',
          startTime: 1000,
          endTime: 1500,
          index: 0,
        },
      ],
    ])

    const { container } = render(<ClaudeCodeTrajectory messages={new Map()} toolCalls={toolCalls} />)

    expect(screen.getByText('Read')).toBeInTheDocument()
    // Should show inline args summary
    expect(screen.getAllByText(/\/test\.ts/)[0]).toBeInTheDocument()
    // Should show preview of args (first 2 lines) in pre element
    const preElements = container.querySelectorAll('pre')
    expect(preElements.length).toBeGreaterThan(0)
    expect(preElements[0].textContent).toContain('file_path')
    // Should have expand button for remaining lines
    expect(screen.getByText(/\+2 more lines/)).toBeInTheDocument()
  })

  it('should interleave messages and tool calls chronologically', () => {
    const messages = new Map<string, MessageBuffer>([
      [
        'msg-1',
        {
          messageId: 'msg-1',
          role: 'assistant',
          content: 'First message',
          complete: true,
          timestamp: 1000,
          index: 0,
        },
      ],
      [
        'msg-2',
        {
          messageId: 'msg-2',
          role: 'assistant',
          content: 'Third item',
          complete: true,
          timestamp: 3000,
          index: 2,
        },
      ],
    ])

    const toolCalls = new Map<string, ToolCallTracking>([
      [
        'tool-1',
        {
          toolCallId: 'tool-1',
          toolCallName: 'Bash',
          args: '{"command":"echo test"}',
          status: 'completed',
          startTime: 2000,
          endTime: 2500,
          index: 1,
        },
      ],
    ])

    const { container } = render(
      <ClaudeCodeTrajectory messages={messages} toolCalls={toolCalls} />
    )

    // Verify they appear in timestamp order by checking group divs
    const items = container.querySelectorAll('.group')
    expect(items).toHaveLength(3)
  })

  it('should handle streaming messages', () => {
    const messages = new Map<string, MessageBuffer>([
      [
        'msg-1',
        {
          messageId: 'msg-1',
          role: 'assistant',
          content: 'Streaming...',
          complete: false, // Still streaming
          timestamp: 1000,
          index: 0,
        },
      ],
    ])

    const { container } = render(<ClaudeCodeTrajectory messages={messages} toolCalls={new Map()} />)

    // Should show loading indicator (Loader2 spinner) for incomplete messages
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('should render markdown in messages by default', () => {
    const messages = new Map<string, MessageBuffer>([
      [
        'msg-1',
        {
          messageId: 'msg-1',
          role: 'assistant',
          content: '# Heading\n\nThis is **bold** text with `code`.',
          complete: true,
          timestamp: 1000,
          index: 0,
        },
      ],
    ])

    const { container } = render(
      <ClaudeCodeTrajectory messages={messages} toolCalls={new Map()} />
    )

    // Check for markdown elements
    expect(container.querySelector('h1')).toBeInTheDocument()
    expect(container.querySelector('strong')).toBeInTheDocument()
    expect(container.querySelector('code')).toBeInTheDocument()
  })

  it('should disable markdown rendering when renderMarkdown=false', () => {
    const messages = new Map<string, MessageBuffer>([
      [
        'msg-1',
        {
          messageId: 'msg-1',
          role: 'assistant',
          content: '# Heading\n\nThis is **bold** text.',
          complete: true,
          timestamp: 1000,
          index: 0,
        },
      ],
    ])

    const { container } = render(
      <ClaudeCodeTrajectory messages={messages} toolCalls={new Map()} renderMarkdown={false} />
    )

    // Should not have markdown elements
    expect(container.querySelector('h1')).not.toBeInTheDocument()
    expect(container.querySelector('strong')).not.toBeInTheDocument()
  })

  it('should handle empty trajectory', () => {
    const { container } = render(
      <ClaudeCodeTrajectory messages={new Map()} toolCalls={new Map()} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('should show tool errors with proper styling', () => {
    const toolCalls = new Map<string, ToolCallTracking>([
      [
        'tool-1',
        {
          toolCallId: 'tool-1',
          toolCallName: 'Bash',
          args: '{"command":"bad-command"}',
          status: 'error',
          error: 'Command not found',
          startTime: 1000,
          endTime: 1100,
          index: 0,
        },
      ],
    ])

    const { container } = render(<ClaudeCodeTrajectory messages={new Map()} toolCalls={toolCalls} />)

    expect(screen.getByText(/Command not found/)).toBeInTheDocument()
    // Should have red dot for error (⏺)
    expect(container.querySelector('.text-red-600')).toBeInTheDocument()
  })

  it('should render all message patterns with terminal style', () => {
    const messages = new Map<string, MessageBuffer>([
      [
        'msg-1',
        {
          messageId: 'msg-1',
          role: 'assistant',
          content: "Let me think about this...",
          complete: true,
          timestamp: 1000,
          index: 0,
        },
      ],
      [
        'msg-2',
        {
          messageId: 'msg-2',
          role: 'assistant',
          content: "I'll start by checking the files",
          complete: true,
          timestamp: 2000,
          index: 1,
        },
      ],
    ])

    const { container } = render(
      <ClaudeCodeTrajectory messages={messages} toolCalls={new Map()} />
    )

    // Both messages should have dot indicators
    const dots = container.querySelectorAll('.text-primary')
    expect(dots.length).toBeGreaterThanOrEqual(2)

    // Both message contents should be present
    expect(screen.getByText(/Let me think/)).toBeInTheDocument()
    expect(screen.getByText(/I'll start by checking/)).toBeInTheDocument()
  })
})

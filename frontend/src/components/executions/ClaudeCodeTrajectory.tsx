/**
 * ClaudeCodeTrajectory Component
 *
 * Specialized rendering for Claude Code agent executions.
 * Mimics the Claude Code terminal interface with inline, compact rendering.
 *
 * Key differences from generic AgentTrajectory:
 * - Terminal-style inline rendering with colored dots (⏺ and ⎿)
 * - Compact tool call display with truncation and expand/collapse
 * - No card structure - everything flows inline like terminal output
 * - User messages have lighter background, assistant messages have dots
 */

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { MessageBuffer } from '@/hooks/useAgUiStream'
import type { ToolCallTracking } from '@/hooks/useAgUiStream'

export interface ClaudeCodeTrajectoryProps {
  /**
   * Map of messages to display
   */
  messages: Map<string, MessageBuffer>

  /**
   * Map of tool calls to display
   */
  toolCalls: Map<string, ToolCallTracking>

  /**
   * Whether to render markdown in messages (default: true)
   */
  renderMarkdown?: boolean

  /**
   * Custom class name
   */
  className?: string
}

/**
 * Trajectory item representing either a message or a tool call
 */
type TrajectoryItem =
  | {
      type: 'message'
      timestamp: number
      index?: number
      data: MessageBuffer
    }
  | {
      type: 'tool_call'
      timestamp: number
      index?: number
      data: ToolCallTracking
    }

/**
 * Format tool arguments for compact display
 */
function formatToolArgs(toolName: string, args: string): string {
  try {
    const parsed = JSON.parse(args)

    // For Bash, show the command
    if (toolName === 'Bash' && parsed.command) {
      return parsed.command
    }

    // For Read, show the file path
    if (toolName === 'Read' && parsed.file_path) {
      return parsed.file_path
    }

    // For Write/Edit, show file path
    if ((toolName === 'Write' || toolName === 'Edit') && parsed.file_path) {
      return parsed.file_path
    }

    // For other tools, show first key-value pair
    const keys = Object.keys(parsed)
    if (keys.length > 0) {
      const firstKey = keys[0]
      const value = parsed[firstKey]
      if (typeof value === 'string') {
        return value.length > 60 ? value.slice(0, 60) + '...' : value
      }
    }

    return JSON.stringify(parsed)
  } catch {
    return args.length > 60 ? args.slice(0, 60) + '...' : args
  }
}

/**
 * Truncate text with line count and character limit
 * Handles both multi-line text and long single-line text (like compact JSON)
 */
function truncateText(
  text: string,
  maxLines: number = 2,
  maxChars: number = 250
): { truncated: string; hasMore: boolean; lineCount: number; charCount: number } {
  const lines = text.split('\n')
  const lineCount = lines.length

  // First check if we exceed line limit
  if (lineCount > maxLines) {
    const truncated = lines.slice(0, maxLines).join('\n')
    return { truncated, hasMore: true, lineCount, charCount: text.length }
  }

  // If under line limit, check character limit
  if (text.length > maxChars) {
    // Find a good breaking point (try to break at newline, space, or just cut)
    let truncated = text.slice(0, maxChars)
    const lastNewline = truncated.lastIndexOf('\n')
    const lastSpace = truncated.lastIndexOf(' ')

    if (lastNewline > maxChars * 0.8) {
      truncated = truncated.slice(0, lastNewline)
    } else if (lastSpace > maxChars * 0.8) {
      truncated = truncated.slice(0, lastSpace)
    }

    return {
      truncated: truncated + '...',
      hasMore: true,
      lineCount,
      charCount: text.length,
    }
  }

  // Text is short enough, no truncation needed
  return { truncated: text, hasMore: false, lineCount, charCount: text.length }
}

/**
 * ClaudeCodeTrajectory Component
 *
 * Provides Claude Code-specific rendering of execution trajectory,
 * with enhanced visualization for Claude's communication patterns.
 *
 * @example
 * ```tsx
 * <ClaudeCodeTrajectory
 *   messages={messages}
 *   toolCalls={toolCalls}
 *   renderMarkdown
 * />
 * ```
 */
export function ClaudeCodeTrajectory({
  messages,
  toolCalls,
  renderMarkdown = true,
  className = '',
}: ClaudeCodeTrajectoryProps) {
  // Merge messages and tool calls into a chronological timeline
  const trajectory = useMemo(() => {
    const items: TrajectoryItem[] = []

    // Add messages
    messages.forEach((message) => {
      items.push({
        type: 'message',
        timestamp: message.timestamp,
        index: message.index,
        data: message,
      })
    })

    // Add tool calls
    toolCalls.forEach((toolCall) => {
      items.push({
        type: 'tool_call',
        timestamp: toolCall.startTime,
        index: toolCall.index,
        data: toolCall,
      })
    })

    // Sort by timestamp, using index as secondary key for stable ordering
    return items.sort((a, b) => {
      const timeDiff = a.timestamp - b.timestamp
      if (timeDiff !== 0) return timeDiff
      // When timestamps are equal, use index for stable ordering
      if (a.index !== undefined && b.index !== undefined) {
        return a.index - b.index
      }
      return 0
    })
  }, [messages, toolCalls])

  if (trajectory.length === 0) {
    return null
  }

  return (
    <div className={`space-y-1 font-mono text-sm ${className}`}>
      {trajectory.map((item) => {
        if (item.type === 'message') {
          const message = item.data

          return (
            <div key={`msg-${message.messageId}`} className="group">
              {/* Message with dot indicator */}
              <div className="flex items-start gap-2">
                {/* Dot indicator for assistant messages */}
                <span className="mt-0.5 select-none text-foreground">⏺</span>

                {/* Message content */}
                <div className="min-w-0 flex-1 py-0.5">
                  {!message.complete && (
                    <Loader2 className="mb-1 inline h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  {renderMarkdown ? (
                    <ReactMarkdown
                      className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      components={{
                        p: ({ children }) => <p className="mb-1 leading-relaxed">{children}</p>,
                        code: ({ inline, children, ...props }: any) =>
                          inline ? (
                            <code
                              className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
                              {...props}
                            >
                              {children}
                            </code>
                          ) : (
                            <pre className="my-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                              <code {...props}>{children}</code>
                            </pre>
                          ),
                        ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
                        ol: ({ children }) => (
                          <ol className="my-1 list-decimal pl-5">{children}</ol>
                        ),
                        li: ({ children }) => <li className="mb-0.5">{children}</li>,
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            className="text-primary underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                        h1: ({ children }) => (
                          <h1 className="mb-1 mt-2 text-base font-bold">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="mb-1 mt-2 text-sm font-semibold">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mb-1 mt-1 text-sm font-semibold">{children}</h3>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <div className="whitespace-pre-wrap text-xs leading-relaxed">
                      {message.content}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        } else {
          // Tool call - terminal-style inline rendering
          return <ToolCallItem key={`tool-${item.data.toolCallId}`} toolCall={item.data} />
        }
      })}
    </div>
  )
}

/**
 * ToolCallItem - Terminal-style tool call rendering
 */
function ToolCallItem({ toolCall }: { toolCall: ToolCallTracking }) {
  const [showFullArgs, setShowFullArgs] = useState(false)
  const formattedArgs = formatToolArgs(toolCall.toolCallName, toolCall.args)

  const argsData = toolCall.args ? truncateText(toolCall.args, 2) : null
  const resultData = toolCall.result ? truncateText(toolCall.result, 2) : null
  const [showFullResult, setShowFullResult] = useState(false)

  const isSuccess = toolCall.status === 'completed'
  const isError = toolCall.status === 'error'

  return (
    <div className="group">
      {/* Tool call header with colored dot */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 select-none ${isSuccess ? 'text-green-600' : isError ? 'text-red-600' : 'text-yellow-600'}`}
        >
          ⏺
        </span>
        <div className="min-w-0 flex-1">
          {/* Tool name and args inline */}
          <div className="flex items-start gap-2">
            <span className="font-semibold">{toolCall.toolCallName}</span>
            <span className="text-muted-foreground">({formattedArgs})</span>
            {toolCall.endTime && (
              <span className="ml-auto text-xs text-muted-foreground">
                {((toolCall.endTime - toolCall.startTime) / 1000).toFixed(2)}s
              </span>
            )}
          </div>

          {/* Full args - expandable (shown first, before results) */}
          {argsData && (
            <div className="mt-0.5 flex items-start gap-2">
              <span className="select-none text-muted-foreground">∟</span>
              <div className="min-w-0 flex-1">
                {/* Preview of first 2 lines */}
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {showFullArgs ? toolCall.args : argsData.truncated}
                </pre>
                {/* Expand/collapse button */}
                {argsData.hasMore && (
                  <button
                    onClick={() => setShowFullArgs(!showFullArgs)}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showFullArgs ? (
                      <>
                        {'> Hide ('}
                        {argsData.lineCount > 2
                          ? `${argsData.lineCount} lines`
                          : `${argsData.charCount} chars`}
                        {')'}
                      </>
                    ) : argsData.lineCount > 2 ? (
                      <>{'> +' + (argsData.lineCount - 2) + ' more lines'}</>
                    ) : (
                      <>{'> +' + (argsData.charCount - 500) + ' more chars'}</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tool result - show first 2 lines when collapsed */}
          {(toolCall.result || toolCall.error) && (
            <div className="mt-0.5 flex items-start gap-2">
              <span className="select-none text-muted-foreground">∟</span>
              <div className="min-w-0 flex-1">
                {toolCall.error ? (
                  <div className="text-red-600">{toolCall.error}</div>
                ) : resultData ? (
                  <div className="text-muted-foreground">
                    {/* Preview of first 2 lines when collapsed */}
                    {!showFullResult && (
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed">
                        {resultData.truncated}
                      </pre>
                    )}
                    {/* Full result when expanded */}
                    {showFullResult && (
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed">
                        {toolCall.result}
                      </pre>
                    )}
                    {/* Expand/collapse button */}
                    {resultData.hasMore && (
                      <button
                        onClick={() => setShowFullResult(!showFullResult)}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs hover:text-foreground"
                      >
                        {showFullResult ? (
                          <>
                            {'> Hide ('}
                            {resultData.lineCount > 2
                              ? `${resultData.lineCount} lines`
                              : `${resultData.charCount} chars`}
                            {')'}
                          </>
                        ) : resultData.lineCount > 2 ? (
                          <>{'> +' + (resultData.lineCount - 2) + ' more lines'}</>
                        ) : (
                          <>{'> +' + (resultData.charCount - 500) + ' more chars'}</>
                        )}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

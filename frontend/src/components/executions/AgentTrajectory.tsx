/**
 * AgentTrajectory Component
 *
 * Displays the execution trajectory of an AI agent, showing messages, thoughts, and tool calls
 * in chronological order, similar to Claude Code's native experience.
 *
 * Updated for ACP migration to consume SessionUpdate events via useSessionUpdateStream hook.
 */

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Loader2, MessageSquare, Wrench, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { JsonView, defaultStyles, darkStyles } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import type { AgentMessage, ToolCall, AgentThought } from '@/hooks/useSessionUpdateStream'
import { useTheme } from '@/contexts/ThemeContext'

export interface AgentTrajectoryProps {
  /**
   * Array of agent messages to display
   */
  messages: AgentMessage[]

  /**
   * Array of tool calls to display
   */
  toolCalls: ToolCall[]

  /**
   * Array of agent thoughts to display
   */
  thoughts?: AgentThought[]

  /**
   * Whether to render markdown in messages (default: true)
   */
  renderMarkdown?: boolean

  /**
   * Whether to hide system messages (default: true)
   * System messages are those that start with [System]
   */
  hideSystemMessages?: boolean

  /**
   * Custom class name
   */
  className?: string
}

/**
 * Trajectory item representing either a message, thought, or tool call
 */
type TrajectoryItem =
  | {
      type: 'message'
      timestamp: number
      data: AgentMessage
    }
  | {
      type: 'thought'
      timestamp: number
      data: AgentThought
    }
  | {
      type: 'tool_call'
      timestamp: number
      data: ToolCall
    }

/**
 * Check if a string is valid JSON
 */
function isValidJSON(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Format unknown value as displayable string
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/**
 * Render unknown value as JSON or pre-formatted text
 * Explicitly typed to return ReactNode to satisfy TypeScript
 */
function renderUnknownValue(
  value: unknown,
  theme: 'dark' | 'light',
  maxLevel = 2
): React.ReactNode {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === 'string' && isValidJSON(value)) {
    return (
      <JsonView
        data={JSON.parse(value) as Record<string, unknown>}
        shouldExpandNode={(level) => level < maxLevel}
        style={theme === 'dark' ? darkStyles : defaultStyles}
      />
    )
  }
  if (typeof value === 'object' && value !== null) {
    return (
      <JsonView
        data={value as Record<string, unknown>}
        shouldExpandNode={(level) => level < maxLevel}
        style={theme === 'dark' ? darkStyles : defaultStyles}
      />
    )
  }
  return <>{formatValue(value)}</>
}

/**
 * Map tool call status to badge variant
 */
function getStatusVariant(status: ToolCall['status']): 'default' | 'destructive' | 'secondary' {
  switch (status) {
    case 'success':
      return 'default'
    case 'failed':
      return 'destructive'
    default:
      return 'secondary'
  }
}

/**
 * AgentTrajectory Component
 *
 * Merges messages, thoughts, and tool calls into a single chronological timeline
 * to show the agent's execution path.
 *
 * @example
 * ```tsx
 * const { messages, toolCalls, thoughts } = useSessionUpdateStream(executionId)
 *
 * <AgentTrajectory
 *   messages={messages}
 *   toolCalls={toolCalls}
 *   thoughts={thoughts}
 *   renderMarkdown
 * />
 * ```
 */
export function AgentTrajectory({
  messages,
  toolCalls,
  thoughts = [],
  renderMarkdown = true,
  hideSystemMessages = true,
  className = '',
}: AgentTrajectoryProps) {
  const { actualTheme } = useTheme()

  // Merge messages, thoughts, and tool calls into a chronological timeline
  const trajectory = useMemo(() => {
    const items: TrajectoryItem[] = []

    // Add messages (filtering out system messages if requested)
    messages.forEach((message) => {
      // Skip system messages if hideSystemMessages is true
      if (hideSystemMessages && message.content.trim().startsWith('[System]')) {
        return
      }

      items.push({
        type: 'message',
        timestamp: message.timestamp.getTime(),
        data: message,
      })
    })

    // Add thoughts
    thoughts.forEach((thought) => {
      items.push({
        type: 'thought',
        timestamp: thought.timestamp.getTime(),
        data: thought,
      })
    })

    // Add tool calls
    toolCalls.forEach((toolCall) => {
      items.push({
        type: 'tool_call',
        timestamp: toolCall.timestamp.getTime(),
        data: toolCall,
      })
    })

    // Sort by timestamp for chronological ordering
    // Use index as secondary key for stable ordering when timestamps are equal
    return items.sort((a, b) => {
      const timeDiff = a.timestamp - b.timestamp
      if (timeDiff !== 0) return timeDiff
      // Use index for tie-breaking when timestamps are equal
      const aIndex = a.data.index ?? Number.MAX_SAFE_INTEGER
      const bIndex = b.data.index ?? Number.MAX_SAFE_INTEGER
      return aIndex - bIndex
    })
  }, [messages, toolCalls, thoughts, hideSystemMessages])

  if (trajectory.length === 0) {
    return null
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {trajectory.map((item, index) => {
        if (item.type === 'message') {
          const message = item.data
          return (
            <div key={`msg-${message.id}-${index}`} className="flex items-start gap-3">
              {/* Icon */}
              <div className="mt-1 flex-shrink-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    assistant
                  </Badge>
                  {message.isStreaming && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  {renderMarkdown ? (
                    <ReactMarkdown
                      className="prose prose-sm dark:prose-invert max-w-none"
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        code: ({ inline, children, ...props }: any) =>
                          inline ? (
                            <code className="rounded bg-background px-1 py-0.5 text-xs" {...props}>
                              {children}
                            </code>
                          ) : (
                            <pre className="overflow-x-auto rounded bg-background p-2">
                              <code {...props}>{children}</code>
                            </pre>
                          ),
                        ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
                        ol: ({ children }) => (
                          <ol className="mb-2 list-decimal pl-4">{children}</ol>
                        ),
                        li: ({ children }) => <li className="mb-1">{children}</li>,
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            className="text-primary hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
              </div>
            </div>
          )
        } else if (item.type === 'thought') {
          // Agent thought/reasoning
          const thought = item.data
          return (
            <div key={`thought-${thought.id}-${index}`} className="flex items-start gap-3">
              {/* Icon */}
              <div className="mt-1 flex-shrink-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/10">
                  <Brain className="h-4 w-4 text-purple-500" />
                </div>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-purple-500 border-purple-500/50">
                    thinking
                  </Badge>
                  {thought.isStreaming && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-3 text-sm italic text-muted-foreground">
                  <div className="whitespace-pre-wrap">{thought.content}</div>
                </div>
              </div>
            </div>
          )
        } else if (item.type === 'tool_call') {
          // Tool call
          const toolCall = item.data
          const duration =
            toolCall.completedAt && toolCall.timestamp
              ? ((toolCall.completedAt.getTime() - toolCall.timestamp.getTime()) / 1000).toFixed(2)
              : null
          const hasRawInput = toolCall.rawInput !== undefined && toolCall.rawInput !== null

          return (
            <div key={`tool-${toolCall.id}-${index}`} className="flex items-start gap-3">
              {/* Icon */}
              <div className="mt-1 flex-shrink-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/10">
                  <Wrench className="h-4 w-4 text-blue-500" />
                </div>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="rounded-lg border bg-card p-3 text-sm">
                  {/* Header */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{toolCall.title}</span>
                      <Badge variant={getStatusVariant(toolCall.status)} className="text-xs">
                        {toolCall.status}
                      </Badge>
                      {toolCall.status === 'running' && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {duration && (
                      <span className="text-xs text-muted-foreground">{duration}s</span>
                    )}
                  </div>

                  {/* Arguments / Raw Input */}
                  {hasRawInput && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Arguments
                      </summary>
                      <div className="json-viewer-wrapper mt-1 rounded bg-muted/50 p-2 text-xs">
                        {renderUnknownValue(toolCall.rawInput, actualTheme, 2)}
                      </div>
                    </details>
                  )}

                  {/* Result / Raw Output */}
                  {(toolCall.result !== undefined || toolCall.rawOutput !== undefined) && (
                    <details className="mt-2" open={toolCall.status === 'success'}>
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Result
                      </summary>
                      <div className="json-viewer-wrapper mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">
                        {renderUnknownValue(toolCall.result ?? toolCall.rawOutput, actualTheme, 1)}
                      </div>
                    </details>
                  )}

                  {/* Error state */}
                  {toolCall.status === 'failed' && toolCall.result !== undefined && toolCall.result !== null && (
                    <div className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                      {typeof toolCall.result === 'object'
                        ? (toolCall.result as Record<string, unknown>).error as string || formatValue(toolCall.result)
                        : formatValue(toolCall.result)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        } else {
          // Should not reach here with proper TrajectoryItem types
          return null
        }
      })}
    </div>
  )
}

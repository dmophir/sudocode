/**
 * ExecutionMonitor Component
 *
 * Displays execution status using either:
 * - Real-time WebSocket streaming for active executions (running, pending, preparing, paused)
 * - Historical logs API for completed executions (completed, failed, cancelled, stopped)
 *
 * Shows execution progress, metrics, messages, and tool calls.
 *
 * Updated for ACP migration to consume SessionUpdate events via useSessionUpdateStream hook.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useSessionUpdateStream,
  type AgentMessage,
  type ToolCall,
  type ConnectionStatus,
  type ExecutionState,
} from '@/hooks/useSessionUpdateStream'
import { useExecutionLogs } from '@/hooks/useExecutionLogs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AgentTrajectory } from './AgentTrajectory'
import { ClaudeCodeTrajectory } from './ClaudeCodeTrajectory'
import { TodoTracker } from './TodoTracker'
import { buildTodoHistory } from '@/utils/todoExtractor'
import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { Execution } from '@/types/execution'
import type { MessageBuffer, ToolCallTracking } from '@/types/stream'

export interface ExecutionMonitorProps {
  /**
   * Execution ID to monitor
   */
  executionId: string

  /**
   * Execution metadata (optional, for status detection)
   */
  execution?: Execution

  /**
   * Callback when execution completes successfully
   */
  onComplete?: () => void

  /**
   * Callback when execution errors
   */
  onError?: (error: Error) => void

  /**
   * Callback when content changes (new messages/tool calls)
   */
  onContentChange?: () => void

  /**
   * Callback when tool calls are updated (for aggregating todos across executions)
   */
  onToolCallsUpdate?: (
    toolCalls: Map<string, ToolCallTracking>
  ) => void

  /**
   * Callback when execution is cancelled (ESC key pressed)
   */
  onCancel?: () => void

  /**
   * Compact mode - removes card wrapper and header for inline display
   */
  compact?: boolean

  /**
   * Hide the TodoTracker in this monitor (for when it's shown elsewhere)
   */
  hideTodoTracker?: boolean

  /**
   * Show running indicator (dots) when execution is running
   */
  showRunIndicator?: boolean

  /**
   * Custom class name
   */
  className?: string
}

export function RunIndicator() {
  const [dots, setDots] = useState(1)

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev % 3) + 1)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 text-muted-foreground">Running{'.'.repeat(dots)}</span>
      <span className="text-muted-foreground/70">(esc to cancel)</span>
    </div>
  )
}

/**
 * Convert AgentMessage array to MessageBuffer Map for ClaudeCodeTrajectory
 * This is a bridge function for backwards compatibility with ClaudeCodeTrajectory
 * TODO: Update ClaudeCodeTrajectory to use array-based types and remove this bridge
 */
function convertMessagesToMap(messages: AgentMessage[]): Map<string, MessageBuffer> {
  const map = new Map<string, MessageBuffer>()
  messages.forEach((msg) => {
    map.set(msg.id, {
      messageId: msg.id,
      role: 'assistant',
      content: msg.content,
      complete: !msg.isStreaming,
      timestamp: msg.timestamp.getTime(),
      index: msg.index,
    })
  })
  return map
}

/**
 * Convert ToolCall array to ToolCallTracking Map for ClaudeCodeTrajectory
 * This is a bridge function for backwards compatibility with ClaudeCodeTrajectory
 * TODO: Update ClaudeCodeTrajectory to use array-based types and remove this bridge
 */
function convertToolCallsToMap(toolCalls: ToolCall[]): Map<string, ToolCallTracking> {
  const map = new Map<string, ToolCallTracking>()
  toolCalls.forEach((tc) => {
    map.set(tc.id, {
      toolCallId: tc.id,
      toolCallName: tc.title,
      args: tc.rawInput ? (typeof tc.rawInput === 'string' ? tc.rawInput : JSON.stringify(tc.rawInput)) : '',
      status: mapToolCallStatusToLegacy(tc.status),
      result: tc.result !== undefined ? (typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result)) : undefined,
      error: tc.status === 'failed' && tc.result && typeof tc.result === 'object' ? (tc.result as any).error : undefined,
      startTime: tc.timestamp.getTime(),
      endTime: tc.completedAt?.getTime(),
      index: tc.index,
    })
  })
  return map
}

/**
 * Map new ToolCall status to legacy ToolCallTracking status
 */
function mapToolCallStatusToLegacy(
  status: ToolCall['status']
): 'started' | 'executing' | 'completed' | 'error' {
  switch (status) {
    case 'success':
      return 'completed'
    case 'failed':
      return 'failed' as any // Legacy uses 'error' but type says 'completed' | 'started' | 'executing'
    case 'running':
      return 'executing'
    case 'pending':
    default:
      return 'started'
  }
}


/**
 * ExecutionMonitor Component
 *
 * @example
 * ```tsx
 * // Active execution (SSE streaming)
 * <ExecutionMonitor
 *   executionId="exec-123"
 *   execution={{ status: 'running', ... }}
 *   onComplete={() => console.log('Done!')}
 *   onError={(err) => console.error(err)}
 * />
 *
 * // Historical execution (logs API)
 * <ExecutionMonitor
 *   executionId="exec-456"
 *   execution={{ status: 'completed', ... }}
 * />
 * ```
 */
export function ExecutionMonitor({
  executionId,
  execution: executionProp,
  onComplete,
  onError,
  onContentChange,
  onToolCallsUpdate,
  onCancel,
  compact = false,
  hideTodoTracker = false,
  showRunIndicator = false,
  className = '',
}: ExecutionMonitorProps) {
  // Determine if execution is active or completed
  // Active: preparing, pending, running, paused
  // Completed: completed, failed, cancelled, stopped
  const isActive = useMemo(() => {
    if (!executionProp) return true // Default to active if no execution prop
    const activeStatuses = ['preparing', 'pending', 'running', 'paused']
    return activeStatuses.includes(executionProp.status)
  }, [executionProp])

  // Use WebSocket streaming for real-time SessionUpdate events
  const wsStream = useSessionUpdateStream({
    executionId: isActive ? executionId : null, // Only connect for active executions
  })

  // Use logs API for completed executions
  // Also preload logs for active executions as a fallback in case WebSocket disconnects
  const logsResult = useExecutionLogs(executionId)

  // Process logs events into AgentMessage/ToolCall format (array-based)
  const processedLogs = useMemo(() => {
    const messagesMap = new Map<string, AgentMessage>()
    const toolCallsMap = new Map<string, ToolCall>()

    // Track sequence indices for stable ordering
    let messageIndex = 0
    let toolCallIndex = 0

    // Process events from logs
    if (logsResult.events && logsResult.events.length > 0) {
      logsResult.events.forEach((event: any) => {
        // Handle TEXT_MESSAGE events
        if (event.type === 'TEXT_MESSAGE_START') {
          messagesMap.set(event.messageId, {
            id: event.messageId,
            content: '',
            timestamp: new Date(event.timestamp || Date.now()),
            isStreaming: true,
            index: messageIndex++,
          })
        } else if (event.type === 'TEXT_MESSAGE_CONTENT') {
          const existing = messagesMap.get(event.messageId)
          if (existing) {
            messagesMap.set(event.messageId, {
              ...existing,
              content: existing.content + (event.delta || ''),
            })
          }
        } else if (event.type === 'TEXT_MESSAGE_END') {
          const existing = messagesMap.get(event.messageId)
          if (existing) {
            messagesMap.set(event.messageId, {
              ...existing,
              isStreaming: false,
            })
          }
        }
        // Handle TOOL_CALL events
        else if (event.type === 'TOOL_CALL_START') {
          toolCallsMap.set(event.toolCallId, {
            id: event.toolCallId,
            title: event.toolCallName || event.toolName,
            status: 'running',
            rawInput: '',
            timestamp: new Date(event.timestamp || Date.now()),
            index: toolCallIndex++,
          })
        } else if (event.type === 'TOOL_CALL_ARGS') {
          const existing = toolCallsMap.get(event.toolCallId)
          if (existing) {
            const currentArgs = existing.rawInput || ''
            toolCallsMap.set(event.toolCallId, {
              ...existing,
              rawInput: (typeof currentArgs === 'string' ? currentArgs : '') + (event.delta || ''),
            })
          }
        } else if (event.type === 'TOOL_CALL_END') {
          const existing = toolCallsMap.get(event.toolCallId)
          if (existing) {
            toolCallsMap.set(event.toolCallId, {
              ...existing,
              status: 'running',
            })
          }
        } else if (event.type === 'TOOL_CALL_RESULT') {
          const existing = toolCallsMap.get(event.toolCallId)
          if (existing) {
            toolCallsMap.set(event.toolCallId, {
              ...existing,
              status: 'success',
              result: event.result || event.content,
              completedAt: new Date(event.timestamp || Date.now()),
            })
          }
        }
      })
    }

    return {
      messages: Array.from(messagesMap.values()),
      toolCalls: Array.from(toolCallsMap.values()),
    }
  }, [logsResult.events])

  // Select the appropriate data source
  // Key insight: When transitioning from active to completed, keep showing WebSocket data
  // until logs are fully loaded to prevent flickering
  // IMPORTANT: If WebSocket disconnects unexpectedly, fall back to saved logs
  const { connectionStatus, execution, messages, toolCalls, error, isConnected } =
    useMemo((): {
      connectionStatus: ConnectionStatus
      execution: ExecutionState
      messages: AgentMessage[]
      toolCalls: ToolCall[]
      error: Error | null
      isConnected: boolean
    } => {
      const logsLoaded = !logsResult.loading && logsResult.events && logsResult.events.length > 0
      const hasWsData = wsStream.messages.length > 0 || wsStream.toolCalls.length > 0
      const hasLogsData = processedLogs.messages.length > 0 || processedLogs.toolCalls.length > 0

      // For active executions, use WebSocket stream if available
      // BUT: If WebSocket has disconnected/errored and we have no data, fall back to logs
      if (isActive) {
        // If WebSocket disconnected/errored unexpectedly and we have saved logs, use those
        if (
          (wsStream.connectionStatus === 'disconnected' ||
            wsStream.connectionStatus === 'error') &&
          !hasWsData &&
          hasLogsData
        ) {
          console.warn(
            '[ExecutionMonitor] WebSocket disconnected unexpectedly, falling back to saved logs'
          )
          return {
            connectionStatus: logsLoaded ? 'connected' : 'connecting',
            execution: {
              status: (executionProp?.status || 'running') as ExecutionState['status'],
              runId: executionId,
              error: logsResult.error?.message || null,
              startTime: null,
              endTime: null,
            },
            messages: processedLogs.messages,
            toolCalls: processedLogs.toolCalls,
            error: logsResult.error || null,
            isConnected: false,
          }
        }

        // Otherwise use WebSocket stream normally
        return {
          connectionStatus: wsStream.connectionStatus,
          execution: wsStream.execution,
          messages: wsStream.messages,
          toolCalls: wsStream.toolCalls,
          error: wsStream.error,
          isConnected: wsStream.isConnected,
        }
      }

      // For completed executions, use logs when available
      // But fall back to WebSocket data while logs are loading to prevent flicker
      // Use logs if loaded, otherwise fall back to WebSocket data if available
      if (logsLoaded) {
        return {
          connectionStatus: logsResult.error ? 'error' : 'connected',
          execution: {
            status: (executionProp?.status || 'completed') as ExecutionState['status'],
            runId: executionId,
            error: logsResult.error?.message || null,
            startTime: null,
            endTime: null,
          },
          messages: processedLogs.messages,
          toolCalls: processedLogs.toolCalls,
          error: logsResult.error || null,
          isConnected: false,
        }
      } else if (hasWsData) {
        // Logs still loading but we have WebSocket data - keep showing it
        return {
          connectionStatus: logsResult.loading ? 'connecting' : wsStream.connectionStatus,
          execution: {
            ...wsStream.execution,
            status: (executionProp?.status || wsStream.execution.status) as ExecutionState['status'],
          },
          messages: wsStream.messages,
          toolCalls: wsStream.toolCalls,
          error: wsStream.error,
          isConnected: false, // Not live anymore since execution completed
        }
      } else {
        // No WebSocket data and logs not loaded yet - show loading or saved logs
        return {
          connectionStatus: logsResult.loading
            ? 'connecting'
            : logsResult.error
              ? 'error'
              : 'connected',
          execution: {
            status: (executionProp?.status || 'completed') as ExecutionState['status'],
            runId: executionId,
            error: logsResult.error?.message || null,
            startTime: null,
            endTime: null,
          },
          messages: processedLogs.messages,
          toolCalls: processedLogs.toolCalls,
          error: logsResult.error || null,
          isConnected: false,
        }
      }
    }, [isActive, wsStream, logsResult, processedLogs, executionId, executionProp])

  // Track whether onComplete has already been called to prevent infinite loops
  // When an execution is already 'completed' on mount, we should not call onComplete
  // (it's only for when the status transitions TO completed during streaming)
  const hasCalledOnComplete = useRef(false)
  const previousStatus = useRef<string | undefined>(undefined)

  // Track last tool calls hash to detect actual changes (not just size)
  const lastToolCallsHashRef = useRef<string>('')

  // ESC key to cancel execution
  useEffect(() => {
    if (!onCancel) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only cancel if execution is active (not completed/failed/cancelled)
      const activeStatuses = ['preparing', 'pending', 'running', 'paused']
      if (event.key === 'Escape' && activeStatuses.includes(execution.status)) {
        event.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, execution.status])

  // Trigger callbacks when execution status changes TO completed (not when already completed)
  useEffect(() => {
    // Only call onComplete if:
    // 1. Status is now 'completed'
    // 2. We haven't already called it
    // 3. Previous status was something other than 'completed' (i.e., a transition happened)
    if (
      execution.status === 'completed' &&
      onComplete &&
      !hasCalledOnComplete.current &&
      previousStatus.current !== undefined &&
      previousStatus.current !== 'completed'
    ) {
      hasCalledOnComplete.current = true
      onComplete()
    }
    previousStatus.current = execution.status
  }, [execution.status, onComplete])

  useEffect(() => {
    if (error && onError) {
      onError(error)
    }
  }, [error, onError])

  // Notify parent when content changes (for auto-scroll)
  useEffect(() => {
    if (onContentChange) {
      onContentChange()
    }
  }, [messages.length, toolCalls.length, onContentChange])

  // Notify parent when tool calls update (for aggregating todos)
  // Create a hash of tool call IDs and statuses to detect actual changes
  useEffect(() => {
    if (!onToolCallsUpdate) return

    // Create a simple hash of tool call IDs and their statuses
    const toolCallsHash = toolCalls
      .map((tc) => `${tc.id}:${tc.status}`)
      .sort()
      .join('|')

    if (toolCallsHash !== lastToolCallsHashRef.current) {
      lastToolCallsHashRef.current = toolCallsHash
      // Convert to Map for backwards compatibility with existing callback consumers
      onToolCallsUpdate(convertToolCallsToMap(toolCalls))
    }
  }, [toolCalls, onToolCallsUpdate, executionId])

  // Calculate metrics
  const toolCallCount = toolCalls.length
  const completedToolCalls = toolCalls.filter((tc) => tc.status === 'success').length
  const messageCount = messages.length

  // Convert to Maps for ClaudeCodeTrajectory and buildTodoHistory (backwards compat)
  const messagesMap = useMemo(() => convertMessagesToMap(messages), [messages])
  const toolCallsMap = useMemo(() => convertToolCallsToMap(toolCalls), [toolCalls])

  // Extract todos from tool calls for TodoTracker (only for Claude Code agents)
  const todos = useMemo(() => {
    // Only extract todos for Claude Code agents
    if (executionProp?.agent_type === 'claude-code') {
      return buildTodoHistory(toolCallsMap)
    }
    return []
  }, [toolCallsMap, executionProp?.agent_type])

  // Render status badge
  const renderStatusBadge = () => {
    if (connectionStatus === 'connecting') {
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Connecting...
        </Badge>
      )
    }

    if (connectionStatus === 'error' || execution.status === 'error') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Error
        </Badge>
      )
    }

    if (execution.status === 'completed') {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </Badge>
      )
    }

    if (execution.status === 'running') {
      return (
        <Badge variant="default" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      )
    }

    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Idle
      </Badge>
    )
  }

  // Render loading state
  if (connectionStatus === 'connecting' && execution.status === 'idle') {
    const loadingContent = (
      <div className="flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Connecting to execution stream...</span>
      </div>
    )

    if (compact) {
      return <div className={`p-6 ${className}`}>{loadingContent}</div>
    }

    return <Card className={`p-6 ${className}`}>{loadingContent}</Card>
  }

  // Compact mode: no card wrapper, no header, just content
  if (compact) {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* User prompt - show what the user asked */}
        {executionProp?.prompt && (
          <div className="rounded-md bg-primary/30 p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 whitespace-pre-wrap font-mono text-sm text-foreground">
                {executionProp.prompt}
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {(error || execution.error) && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="flex-1">
                <h4 className="font-semibold text-destructive">Error</h4>
                <p className="mt-1 text-sm text-destructive/90">
                  {execution.error || error?.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Agent Trajectory */}
        {(messageCount > 0 || toolCallCount > 0) && (
          <>
            {executionProp?.agent_type === 'claude-code' ? (
              <ClaudeCodeTrajectory
                messages={messagesMap}
                toolCalls={toolCallsMap}
                renderMarkdown
                showTodoTracker={false}
              />
            ) : (
              <AgentTrajectory
                messages={messages}
                toolCalls={toolCalls}
                renderMarkdown
              />
            )}
          </>
        )}

        {/* Empty state */}
        {messageCount === 0 &&
          toolCallCount === 0 &&
          !error &&
          !execution.error &&
          execution.status !== 'running' && (
            <div className="flex flex-col items-center justify-center py-2 text-center text-muted-foreground">
              {!isActive && !isConnected && (
                <>
                  <AlertCircle className="mb-2 h-8 w-8" />
                  <p className="text-sm">No execution activity</p>
                </>
              )}
            </div>
          )}

        {/* Todo Tracker - only show if not hidden */}
        {!hideTodoTracker && <TodoTracker todos={todos} className="mt-4" />}

        {/* Running indicator */}
        {showRunIndicator && execution.status === 'running' && <RunIndicator />}
      </div>
    )
  }

  // Full mode: card wrapper with header and footer
  return (
    <Card className={`flex flex-col ${className}`}>
      {/* Header: Status and Progress */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">Execution Monitor</h3>
            {renderStatusBadge()}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {execution.runId && (
              <span className="font-mono text-xs">Run: {execution.runId.slice(0, 8)}</span>
            )}
            {isConnected && (
              <Badge variant="outline" className="text-xs">
                Live
              </Badge>
            )}
          </div>
        </div>

      </div>

      {/* Main: Agent Trajectory */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {/* Error display */}
        {(error || execution.error) && (
          <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-4">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="flex-1">
                <h4 className="font-semibold text-destructive">Error</h4>
                <p className="mt-1 text-sm text-destructive/90">
                  {execution.error || error?.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Agent Trajectory - unified messages and tool calls */}
        {/* Use Claude Code-specific rendering for claude-code agent type */}
        {(messageCount > 0 || toolCallCount > 0) && (
          <>
            {executionProp?.agent_type === 'claude-code' ? (
              <ClaudeCodeTrajectory
                messages={messagesMap}
                toolCalls={toolCallsMap}
                renderMarkdown
                showTodoTracker={false}
              />
            ) : (
              <AgentTrajectory
                messages={messages}
                toolCalls={toolCalls}
                renderMarkdown
              />
            )}
          </>
        )}

        {/* Empty state */}
        {messageCount === 0 && toolCallCount === 0 && !error && !execution.error && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            {isActive || isConnected ? (
              <>
                <Loader2 className="mb-2 h-8 w-8 animate-spin" />
                <p className="text-sm">Waiting for events...</p>
              </>
            ) : (
              <>
                <AlertCircle className="mb-2 h-8 w-8" />
                <p className="text-sm">No execution activity</p>
              </>
            )}
          </div>
        )}

        {/* Todo Tracker - pinned at bottom of trajectory - only show if not hidden */}
        {!hideTodoTracker && <TodoTracker todos={todos} className="mt-4" />}

        {/* Running indicator */}
        {showRunIndicator && execution.status === 'running' && <RunIndicator />}
      </div>

      {/* Footer: Metrics */}
      <div className="border-t bg-muted/30 px-6 py-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <span className="font-medium">{toolCallCount}</span> tool calls
            </span>
            <span>
              <span className="font-medium">{completedToolCalls}</span> completed
            </span>
            <span>
              <span className="font-medium">{messageCount}</span> messages
            </span>
          </div>

          {/* Execution time */}
          {execution.startTime && execution.endTime && (
            <span>
              Duration:{' '}
              <span className="font-medium">
                {((execution.endTime - execution.startTime) / 1000).toFixed(2)}s
              </span>
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

/**
 * Stream Types
 *
 * Type definitions for execution streaming, used by trajectory components
 * and execution monitoring.
 *
 * These types support the legacy Map-based interface used by ClaudeCodeTrajectory
 * and other components that display execution history.
 */

/**
 * Message buffer for streaming text messages (Map-based legacy interface)
 * Used by ClaudeCodeTrajectory and components that consume Map<string, MessageBuffer>
 */
export interface MessageBuffer {
  messageId: string
  role: string
  content: string
  complete: boolean
  timestamp: number
  /** Sequential index for stable ordering when timestamps are equal */
  index?: number
}

/**
 * Tool call tracking (Map-based legacy interface)
 * Used by ClaudeCodeTrajectory and components that consume Map<string, ToolCallTracking>
 */
export interface ToolCallTracking {
  toolCallId: string
  toolCallName: string
  args: string
  status: 'started' | 'executing' | 'completed' | 'error'
  result?: string
  error?: string
  startTime: number
  endTime?: number
  /** Sequential index for stable ordering when timestamps are equal */
  index?: number
}

/**
 * Workflow execution tracking
 */
export interface WorkflowExecution {
  runId: string | null
  threadId: string | null
  status: 'idle' | 'running' | 'completed' | 'error'
  currentStep: string | null
  error: string | null
  startTime: number | null
  endTime: number | null
}

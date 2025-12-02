import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Execution, ExecutionStatus } from '@/types/execution'
import type { WebSocketMessage } from '@/types/api'
import { useWebSocketContext } from '@/contexts/WebSocketContext'
import {
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  PauseCircle,
  ListIcon,
  Filter,
  Eye,
  EyeOff,
  ChevronLeft,
} from 'lucide-react'

export interface ExecutionsSidebarProps {
  /**
   * All executions to display in the sidebar
   */
  executions: Execution[]

  /**
   * Set of execution IDs currently visible in the grid
   */
  visibleExecutionIds: Set<string>

  /**
   * Callback when user toggles execution visibility
   */
  onToggleVisibility: (executionId: string) => void

  /**
   * Optional callback to refresh executions list
   */
  onRefresh?: () => void

  /**
   * Status filters (multi-select)
   */
  statusFilters: Set<ExecutionStatus>

  /**
   * Callback when user changes status filters
   */
  onStatusFilterChange: (statuses: Set<ExecutionStatus>) => void

  /**
   * Callback to show all executions
   */
  onShowAll: () => void

  /**
   * Callback to hide all executions
   */
  onHideAll: () => void

  /**
   * Whether the sidebar is collapsed
   */
  collapsed?: boolean

  /**
   * Callback to toggle sidebar collapse
   */
  onToggleCollapse?: () => void
}

/**
 * Render status badge for execution
 */
function renderStatusBadge(status: ExecutionStatus) {
  switch (status) {
    case 'preparing':
      return (
        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          Preparing
        </Badge>
      )
    case 'pending':
      return (
        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      )
    case 'running':
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-blue-600 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      )
    case 'paused':
      return (
        <Badge variant="outline" className="flex items-center gap-1 text-xs">
          <PauseCircle className="h-3 w-3" />
          Paused
        </Badge>
      )
    case 'completed':
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-600 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="destructive" className="flex items-center gap-1 text-xs">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <X className="h-3 w-3" />
          Cancelled
        </Badge>
      )
    case 'stopped':
      return (
        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <X className="h-3 w-3" />
          Stopped
        </Badge>
      )
    default:
      return (
        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
          <AlertCircle className="h-3 w-3" />
          {String(status).charAt(0).toUpperCase() + String(status).slice(1)}
        </Badge>
      )
  }
}

/**
 * Truncate execution ID for display
 */
function truncateId(id: string, length = 8): string {
  if (id.length <= length) return id
  return id.slice(0, length) + '...'
}

// All possible execution statuses
const ALL_STATUSES: ExecutionStatus[] = [
  'preparing',
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'stopped',
]

/**
 * ExecutionsSidebar Component
 *
 * Displays a list of all executions with checkboxes to toggle visibility in the grid.
 * Supports real-time updates via WebSocket and status filtering.
 */
export function ExecutionsSidebar({
  executions: initialExecutions,
  visibleExecutionIds,
  onToggleVisibility,
  onRefresh,
  statusFilters,
  onStatusFilterChange,
  onShowAll,
  onHideAll,
  onToggleCollapse,
}: ExecutionsSidebarProps) {
  const [executions, setExecutions] = useState<Execution[]>(initialExecutions)
  const { subscribe, unsubscribe, addMessageHandler, removeMessageHandler } = useWebSocketContext()

  // Update local state when prop changes
  useEffect(() => {
    setExecutions(initialExecutions)
  }, [initialExecutions])

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'execution_created' && message.data) {
      const newExecution = message.data as Execution
      setExecutions((prev) => {
        // Check if execution already exists
        if (prev.some((e) => e.id === newExecution.id)) {
          return prev
        }
        // Add to list and sort by created_at (newest first)
        return [newExecution, ...prev].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      })
    } else if (message.type === 'execution_updated' && message.data) {
      const updatedExecution = message.data as Execution
      setExecutions((prev) =>
        prev.map((e) => (e.id === updatedExecution.id ? updatedExecution : e))
      )
    } else if (message.type === 'execution_status_changed' && message.data) {
      const { executionId, status } = message.data as {
        executionId: string
        status: ExecutionStatus
      }
      setExecutions((prev) => prev.map((e) => (e.id === executionId ? { ...e, status } : e)))
    } else if (message.type === 'execution_deleted' && message.data) {
      const { executionId } = message.data as { executionId: string }
      setExecutions((prev) => prev.filter((e) => e.id !== executionId))
    }
  }, [])

  // Subscribe to WebSocket events on mount
  useEffect(() => {
    const handlerId = 'executions-sidebar'

    subscribe('execution')
    addMessageHandler(handlerId, handleWebSocketMessage)

    return () => {
      unsubscribe('execution')
      removeMessageHandler(handlerId)
    }
  }, [subscribe, unsubscribe, addMessageHandler, removeMessageHandler, handleWebSocketMessage])

  // Handle checkbox toggle
  const handleToggle = useCallback(
    (executionId: string) => {
      onToggleVisibility(executionId)
    },
    [onToggleVisibility]
  )

  // Handle status filter toggle
  const handleStatusToggle = useCallback(
    (status: ExecutionStatus) => {
      const newFilters = new Set(statusFilters)
      if (newFilters.has(status)) {
        newFilters.delete(status)
      } else {
        newFilters.add(status)
      }
      onStatusFilterChange(newFilters)
    },
    [statusFilters, onStatusFilterChange]
  )

  // Filter executions by status
  const filteredExecutions =
    statusFilters.size === 0 ? executions : executions.filter((e) => statusFilters.has(e.status))

  // Empty state
  if (executions.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListIcon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Executions</h3>
            </div>
            <div className="flex items-center gap-1">
              {onRefresh && (
                <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 w-7 p-0">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
              {onToggleCollapse && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleCollapse}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Empty state */}
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <ListIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No executions yet.</p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Start by creating an execution from an issue.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-3">
        {/* Title row */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Executions</h3>
            <Badge variant="secondary" className="text-xs">
              {filteredExecutions.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 w-7 p-0">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {onToggleCollapse && (
              <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="h-7 w-7 p-0">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">
          {/* Status filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <Filter className="h-3 w-3" />
                Filter
                {statusFilters.size > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                    {statusFilters.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-xs">Status Filters</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilters.has(status)}
                  onCheckedChange={() => handleStatusToggle(status)}
                  className="text-xs capitalize"
                >
                  {status}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Show all / Hide all buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowAll}
            className="h-7 flex-1 gap-1 text-xs"
          >
            <Eye className="h-3 w-3" />
            Show All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onHideAll}
            className="h-7 flex-1 gap-1 text-xs"
          >
            <EyeOff className="h-3 w-3" />
            Hide All
          </Button>
        </div>
      </div>

      {/* Execution list */}
      <div className="flex-1 overflow-y-auto">
        {filteredExecutions.map((execution) => {
          const isVisible = visibleExecutionIds.has(execution.id)
          const createdAt = new Date(execution.created_at)
          const relativeTime = formatDistanceToNow(createdAt, { addSuffix: true })

          return (
            <div
              key={execution.id}
              className="cursor-pointer border-b p-3 transition-colors hover:bg-accent/50"
              onClick={() => handleToggle(execution.id)}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <Checkbox
                  checked={isVisible}
                  onCheckedChange={() => handleToggle(execution.id)}
                  className="mt-1"
                  onClick={(e) => e.stopPropagation()}
                />

                {/* Execution info */}
                <div className="min-w-0 flex-1">
                  {/* Execution ID + Status */}
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate font-mono text-sm font-medium">
                      {truncateId(execution.id, 10)}
                    </span>
                    {renderStatusBadge(execution.status)}
                  </div>

                  {/* Issue ID (if available) */}
                  {execution.issue_id && (
                    <div className="mb-1 flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Issue:</span>
                      <a
                        href={`/issues/${execution.issue_id}`}
                        className="text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {execution.issue_id}
                      </a>
                    </div>
                  )}

                  {/* Branch name */}
                  {execution.branch_name && (
                    <div className="mb-1 flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Branch:</span>
                      <span className="truncate font-mono text-xs">
                        {truncateId(execution.branch_name, 20)}
                      </span>
                    </div>
                  )}

                  {/* Relative timestamp */}
                  <div className="text-xs text-muted-foreground/70">{relativeTime}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

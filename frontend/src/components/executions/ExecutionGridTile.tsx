import { useState, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ExecutionMonitor } from './ExecutionMonitor'
import { AgentConfigPanel } from './AgentConfigPanel'
import { executionsApi } from '@/lib/api'
import type { Execution, ExecutionConfig } from '@/types/execution'
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  PauseCircle,
  ExternalLink,
} from 'lucide-react'

export interface ExecutionGridTileProps {
  /**
   * Execution to display in the tile
   */
  execution: Execution

  /**
   * Callback when user wants to hide this execution from the grid
   */
  onToggleVisibility?: (executionId: string) => void

  /**
   * Callback when user wants to delete this execution
   */
  onDelete?: (executionId: string) => void
}

/**
 * Render status badge for execution
 */
function renderStatusBadge(status: Execution['status']) {
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
        <Badge variant="default" className="flex items-center gap-1 text-xs bg-blue-600">
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
        <Badge variant="default" className="flex items-center gap-1 text-xs bg-green-600">
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
 * ExecutionGridTile Component
 *
 * Displays a single execution in a grid tile with:
 * - Sticky header (execution ID, status badge, quick actions)
 * - Scrollable middle (ExecutionMonitor in compact mode)
 * - Sticky footer (AgentConfigPanel for follow-ups)
 */
export function ExecutionGridTile({
  execution,
  onToggleVisibility,
}: ExecutionGridTileProps) {
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false)

  // Handle follow-up submission
  const handleFollowUpStart = useCallback(
    async (_config: ExecutionConfig, prompt: string, _agentType?: string) => {
      setSubmittingFollowUp(true)
      try {
        await executionsApi.createFollowUp(execution.id, {
          feedback: prompt,
        })
        // The parent component (ExecutionsPage) will handle adding the new execution
        // to the list via WebSocket events
      } catch (err) {
        console.error('Failed to create follow-up:', err)
      } finally {
        setSubmittingFollowUp(false)
      }
    },
    [execution.id]
  )

  // Handle close button
  const handleClose = useCallback(() => {
    if (onToggleVisibility) {
      onToggleVisibility(execution.id)
    }
  }, [execution.id, onToggleVisibility])

  // Handle open in full view
  const handleOpenFullView = useCallback(() => {
    window.open(`/executions/${execution.id}`, '_blank')
  }, [execution.id])

  const createdAt = new Date(execution.created_at)
  const relativeTime = formatDistanceToNow(createdAt, { addSuffix: true })

  return (
    <div className="flex flex-col h-full border rounded-lg shadow-sm bg-card hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Execution ID with tooltip */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-mono font-medium truncate cursor-default">
                  {execution.id}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono text-xs">{execution.id}</p>
                <p className="text-xs text-muted-foreground mt-1">{relativeTime}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Status badge */}
          {renderStatusBadge(execution.status)}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={handleOpenFullView}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in full view</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onToggleVisibility && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hide from grid</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Scrollable Middle - ExecutionMonitor */}
      <div className="flex-1 overflow-y-auto">
        <ExecutionMonitor
          executionId={execution.id}
          execution={execution}
          compact={true}
          hideTodoTracker={true}
        />
      </div>

      {/* Sticky Footer - AgentConfigPanel for follow-ups */}
      <div className="sticky bottom-0 z-10 border-t bg-card">
        <AgentConfigPanel
          issueId={execution.issue_id || ''}
          onStart={handleFollowUpStart}
          disabled={submittingFollowUp}
          isFollowUp={true}
          lastExecution={{
            id: execution.id,
            mode: execution.mode || undefined,
            model: execution.model || undefined,
            target_branch: execution.target_branch,
            agent_type: execution.agent_type,
          }}
          promptPlaceholder="Send a follow-up message..."
          currentExecution={execution}
          disableContextualActions={true}
        />
      </div>
    </div>
  )
}

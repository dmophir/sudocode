import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitBranch } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Execution } from '@/types/execution'
import { cn } from '@/lib/utils'

interface WorktreeCardProps {
  execution: Execution
  isSelected?: boolean
  onClick?: () => void
}

// Status badge colors
const statusColors: Record<string, string> = {
  running: 'bg-blue-500 dark:bg-blue-600',
  paused: 'bg-yellow-500 dark:bg-yellow-600',
  completed: 'bg-green-500 dark:bg-green-600',
  failed: 'bg-red-500 dark:bg-red-600',
  cancelled: 'bg-gray-500 dark:bg-gray-600',
  stopped: 'bg-orange-500 dark:bg-orange-600',
}

const statusLabels: Record<string, string> = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  stopped: 'Stopped',
}

export function WorktreeCard({ execution, isSelected, onClick }: WorktreeCardProps) {
  const navigate = useNavigate()

  const handleNavigateToIssue = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigate(`/issues/${execution.issue_id}`)
    },
    [navigate, execution.issue_id]
  )

  const handleNavigateToExecution = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigate(`/executions/${execution.id}`)
    },
    [navigate, execution.id]
  )

  return (
    <Card
      className={cn(
        'group cursor-pointer rounded-lg border border-border transition-all hover:bg-accent/50 hover:shadow-md',
        isSelected && 'ring-2 ring-primary'
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-3 p-4">
        {/* Branch Name - Primary identifier */}
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-base font-semibold">{execution.branch_name}</span>
        </div>

        {/* Worktree Path - truncated */}
        {execution.worktree_path && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate font-mono">{execution.worktree_path}</span>
          </div>
        )}

        {/* Execution Info - lightweight header similar to issue activity */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {/* Agent Type */}
          <button
            onClick={handleNavigateToExecution}
            className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {execution.agent_type || 'execution'}
          </button>

          {/* Status Badge */}
          <Badge
            className={cn('shrink-0 text-white', statusColors[execution.status] || 'bg-gray-500')}
          >
            {statusLabels[execution.status] || execution.status}
          </Badge>

          {/* Issue Reference */}
          {execution.issue_id && (
            <>
              <span className="text-xs text-muted-foreground">for</span>
              <button
                onClick={handleNavigateToIssue}
                className="font-mono text-xs text-primary hover:underline"
              >
                {execution.issue_id}
              </button>
            </>
          )}

          {/* Last Updated */}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(execution.updated_at), { addSuffix: true })}
          </span>
        </div>
      </div>
    </Card>
  )
}

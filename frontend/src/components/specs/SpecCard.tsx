import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Pause } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SyncIndicator } from '@/components/issues/SyncIndicator'
import type { Spec } from '@/types/api'
import type { Workflow } from '@/types/workflow'
import { cn } from '@/lib/utils'

// Priority badge colors - using darker shades for better contrast with white text
const priorityColors: Record<number, string> = {
  0: 'bg-red-600 dark:bg-red-700',
  1: 'bg-orange-600 dark:bg-orange-700',
  2: 'bg-yellow-600 dark:bg-yellow-700',
  3: 'bg-blue-600 dark:bg-blue-700',
  4: 'bg-gray-600 dark:bg-gray-700',
}

const priorityLabels: Record<number, string> = {
  0: 'P0',
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
}

interface SpecCardProps {
  spec: Spec
  onClick?: (spec: Spec) => void
  /** Active workflow for this spec (if any) */
  activeWorkflow?: Workflow
}

export function SpecCard({
  spec,
  onClick,
  activeWorkflow,
}: SpecCardProps) {
  const navigate = useNavigate()

  const handleClick = useCallback(() => {
    onClick?.(spec)
  }, [spec, onClick])

  const handleWorkflowBadgeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation() // Prevent card click
      if (activeWorkflow) {
        navigate(`/workflows/${activeWorkflow.id}`)
      }
    },
    [activeWorkflow, navigate]
  )

  // Extract preview text from content (first 200 chars)
  const preview = spec.content
    ? spec.content.slice(0, 200) + (spec.content.length > 200 ? '...' : '')
    : ''

  return (
    <TooltipProvider>
      <Card
        className={`cursor-pointer border border-border p-4 transition-shadow hover:shadow-md ${spec.archived ? 'opacity-60' : ''}`}
        onClick={handleClick}
      >
        <div className="flex flex-col gap-3">
          {/* Header with ID, priority, and workflow indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{spec.id}</span>
              {/* Active workflow indicator */}
              {activeWorkflow && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleWorkflowBadgeClick}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white transition-colors',
                        activeWorkflow.status === 'running'
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : activeWorkflow.status === 'paused'
                            ? 'bg-yellow-500 hover:bg-yellow-600'
                            : 'bg-gray-500 hover:bg-gray-600'
                      )}
                    >
                      {activeWorkflow.status === 'running' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : activeWorkflow.status === 'paused' ? (
                        <Pause className="h-3 w-3" />
                      ) : null}
                      <span className="capitalize">{activeWorkflow.status}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View workflow: {activeWorkflow.title}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Sync Indicator for external integrations */}
              {spec.external_links && spec.external_links.length > 0 && (
                <SyncIndicator externalLinks={spec.external_links} variant="spec" />
              )}
              {spec.priority !== undefined && spec.priority <= 3 && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs text-white ${priorityColors[spec.priority]}`}
                >
                  {priorityLabels[spec.priority]}
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="line-clamp-2 text-lg font-semibold">{spec.title}</h3>

          {/* Preview */}
          {preview && <p className="line-clamp-3 text-sm text-muted-foreground">{preview}</p>}

          {/* Footer with file path */}
          {spec.file_path && (
            <p className="truncate font-mono text-xs text-muted-foreground">{spec.file_path}</p>
          )}
        </div>
      </Card>
    </TooltipProvider>
  )
}

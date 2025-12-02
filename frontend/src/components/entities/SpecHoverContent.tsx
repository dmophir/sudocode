import { Badge } from '@/components/ui/badge'
import { GitBranch } from 'lucide-react'
import type { Spec } from '@/types/api'

interface ImplementingIssue {
  id: string
  type: 'issue'
}

interface SpecHoverContentProps {
  spec: Spec | undefined
  implementingIssues: ImplementingIssue[]
  isLoading: boolean
  isError: boolean
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="flex gap-2">
        <div className="h-5 w-12 rounded bg-muted" />
      </div>
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}

export function SpecHoverContent({
  spec,
  implementingIssues,
  isLoading,
  isError,
}: SpecHoverContentProps) {
  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (isError || !spec) {
    return <div className="text-sm text-muted-foreground">Failed to load spec details</div>
  }

  return (
    <div className="space-y-3">
      {/* Title */}
      <h4 className="line-clamp-2 text-sm font-semibold leading-tight">{spec.title}</h4>

      {/* Implementing Issues */}
      {implementingIssues.length > 0 && (
        <div className="border-t pt-2">
          <div className="mb-1.5 text-xs text-muted-foreground">Implementing issues</div>
          <div className="flex flex-wrap gap-1">
            {implementingIssues.slice(0, 5).map((issue) => (
              <Badge key={issue.id} variant="issue" className="px-1.5 py-0 text-[10px]">
                <GitBranch className="mr-0.5 h-2.5 w-2.5" />
                {issue.id}
              </Badge>
            ))}
            {implementingIssues.length > 5 && (
              <span className="text-xs text-muted-foreground">
                +{implementingIssues.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {implementingIssues.length === 0 && (
        <div className="text-xs italic text-muted-foreground">No implementing issues</div>
      )}
    </div>
  )
}

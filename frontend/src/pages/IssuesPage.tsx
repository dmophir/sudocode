import { useMemo, useState, useCallback } from 'react'
import { useIssues, useUpdateIssueStatus } from '@/hooks/useIssues'
import type { Issue, IssueStatus } from '@/types/api'
import type { DragEndEvent } from '@/components/ui/kanban'
import IssueKanbanBoard from '@/components/issues/IssueKanbanBoard'
import IssuePanel from '@/components/issues/IssuePanel'

export default function IssuesPage() {
  const { issues, isLoading, isError, error } = useIssues()
  const updateStatus = useUpdateIssueStatus()
  const [selectedIssue, setSelectedIssue] = useState<Issue | undefined>()

  // Group issues by status
  const groupedIssues = useMemo(() => {
    const groups: Record<IssueStatus, Issue[]> = {
      open: [],
      in_progress: [],
      blocked: [],
      needs_review: [],
      closed: [],
    }

    issues.forEach((issue) => {
      const status = issue.status.toLowerCase() as IssueStatus
      if (groups[status]) {
        groups[status].push(issue)
      } else {
        // Default to open if status is unknown
        groups.open.push(issue)
      }
    })

    return groups
  }, [issues])

  // Handle drag-and-drop to change status
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || !active.data.current) return

      const draggedIssueId = active.id as string
      const newStatus = over.id as IssueStatus
      const issue = issues.find((i) => i.id === draggedIssueId)

      if (!issue || issue.status === newStatus) return

      // Update issue status via API with optimistic update
      updateStatus.mutate({ id: draggedIssueId, status: newStatus })
    },
    [issues, updateStatus]
  )

  const handleViewIssueDetails = useCallback((issue: Issue) => {
    setSelectedIssue(issue)
  }, [])

  const handleClosePanel = useCallback(() => {
    setSelectedIssue(undefined)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading issues...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-destructive">
          Error loading issues: {error?.message || 'Unknown error'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-background p-4">
        <h1 className="text-2xl font-bold">Issues</h1>
        <p className="text-sm text-muted-foreground">
          {issues.length} total issues
        </p>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Kanban Board */}
        <div className="flex-1 overflow-auto">
          <IssueKanbanBoard
            groupedIssues={groupedIssues}
            onDragEnd={handleDragEnd}
            onViewIssueDetails={handleViewIssueDetails}
            selectedIssue={selectedIssue}
          />
        </div>

        {/* Issue Detail Panel (slide-out) */}
        {selectedIssue && (
          <div className="w-96 border-l bg-background shadow-lg">
            <IssuePanel issue={selectedIssue} onClose={handleClosePanel} />
          </div>
        )}
      </div>
    </div>
  )
}

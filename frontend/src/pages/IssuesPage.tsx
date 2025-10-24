import { useEffect, useState } from 'react'
import { issuesApi } from '@/lib/api'
import type { Issue } from '@/types/api'

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    issuesApi
      .getAll()
      .then((data) => {
        setIssues(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load issues:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading issues...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Issues</h1>
        <p className="text-muted-foreground">
          Found {issues.length} issues | Kanban board coming in ISSUE-021
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {issues.slice(0, 12).map((issue) => (
          <div key={issue.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{issue.id}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  issue.status === 'open'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : issue.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    : issue.status === 'closed'
                    ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                }`}
              >
                {issue.status}
              </span>
            </div>
            <h3 className="mb-1 font-semibold line-clamp-2">{issue.title}</h3>
            {issue.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {issue.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

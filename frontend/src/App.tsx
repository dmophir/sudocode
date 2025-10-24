import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { issuesApi } from '@/lib/api'
import type { Issue } from '@/types/api'

function TestPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    issuesApi
      .getAll()
      .then((data) => {
        setIssues(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Loading...</h1>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-destructive">Error</h1>
          <p className="mt-4 text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-4xl text-center">
        <h1 className="text-4xl font-bold">Sudocode UI - API Test</h1>
        <p className="mt-4 text-muted-foreground">
          Successfully connected to API! Found {issues.length} issues.
        </p>
        <div className="mt-8 rounded-lg bg-card p-6 text-left">
          <h2 className="text-2xl font-semibold">Issues ({issues.length})</h2>
          <div className="mt-4 space-y-2">
            {issues.slice(0, 5).map((issue) => (
              <div
                key={issue.id}
                className="rounded border border-border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-muted-foreground">
                    {issue.id}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      issue.status === 'open'
                        ? 'bg-green-100 text-green-800'
                        : issue.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : issue.status === 'closed'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {issue.status}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold">{issue.title}</h3>
              </div>
            ))}
            {issues.length > 5 && (
              <p className="text-sm text-muted-foreground">
                ... and {issues.length - 5} more
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          ✅ API client working | Ready for ISSUE-019 (routing) and ISSUE-020
          (layout)
        </p>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/issues" replace />} />
        <Route path="/issues" element={<TestPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

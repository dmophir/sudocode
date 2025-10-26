import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSpec, useSpecFeedback, useSpecs } from '@/hooks/useSpecs'
import { useIssues } from '@/hooks/useIssues'
import { SpecViewerTiptap } from '@/components/specs/SpecViewerTiptap'
import { SpecFeedbackPanel } from '@/components/specs/SpecFeedbackPanel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MessageSquare } from 'lucide-react'
import type { IssueFeedback } from '@/types/api'

export default function SpecDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { spec, isLoading, isError } = useSpec(id || '')
  const { feedback } = useSpecFeedback(id || '')
  const { issues } = useIssues()
  const { updateSpec } = useSpecs()

  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(true)
  const [selectedIssueId, setSelectedIssueId] = useState<string | undefined>(undefined)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading spec...</p>
        </div>
      </div>
    )
  }

  if (isError || !spec) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-bold">Spec not found</h2>
          <p className="mb-4 text-muted-foreground">
            The spec you're looking for doesn't exist or has been deleted.
          </p>
          <Button onClick={() => navigate('/specs')}>Back to Specs</Button>
        </div>
      </div>
    )
  }

  const handleLineClick = (lineNumber: number) => {
    setSelectedLine(lineNumber)
    setSelectedText(null) // Clear text selection when clicking line
    setShowFeedbackPanel(true)
  }

  const handleTextSelect = (text: string, lineNumber: number) => {
    setSelectedText(text)
    setSelectedLine(lineNumber)
    setShowFeedbackPanel(true)
  }

  const handleFeedbackClick = (fb: IssueFeedback) => {
    // Navigate to the line where this feedback is anchored
    try {
      const anchor = fb.anchor ? JSON.parse(fb.anchor) : null
      if (anchor?.line_number) {
        setSelectedLine(anchor.line_number)
      }
    } catch (error) {
      console.error('Failed to parse feedback anchor:', error)
    }
  }

  const handleSave = (markdown: string) => {
    if (!spec) return
    updateSpec({
      id: spec.id,
      data: { content: markdown },
    })
  }

  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-auto p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/specs')}>
              ← Back
            </Button>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">{spec.id}</span>
                {spec.priority !== undefined && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    Priority {spec.priority}
                  </span>
                )}
              </div>
              <h1 className="mb-2 text-3xl font-bold">{spec.title}</h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Issue selector */}
              <Select value={selectedIssueId} onValueChange={setSelectedIssueId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select issue..." />
                </SelectTrigger>
                <SelectContent>
                  {issues.map((issue) => (
                    <SelectItem key={issue.id} value={issue.id}>
                      {issue.id}: {issue.title}
                    </SelectItem>
                  ))}
                  {issues.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No issues available
                    </div>
                  )}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFeedbackPanel(!showFeedbackPanel)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Feedback {feedback.length > 0 && `(${feedback.length})`}
              </Button>
              <Button variant="outline" size="sm">
                Edit
              </Button>
              <Button variant="outline" size="sm">
                Delete
              </Button>
            </div>
          </div>

          {/* Metadata */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {spec.file_path && (
              <div className="flex items-center gap-2">
                <span className="font-semibold">File:</span>
                <span className="font-mono">{spec.file_path}</span>
              </div>
            )}
            {spec.created_at && (
              <div className="flex items-center gap-2">
                <span className="font-semibold">Created:</span>
                <span>{new Date(spec.created_at).toLocaleDateString()}</span>
              </div>
            )}
            {spec.updated_at && (
              <div className="flex items-center gap-2">
                <span className="font-semibold">Updated:</span>
                <span>{new Date(spec.updated_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {spec.content ? (
          <SpecViewerTiptap
            content={spec.content}
            feedback={feedback}
            selectedLine={selectedLine}
            onLineClick={handleLineClick}
            onTextSelect={handleTextSelect}
            onFeedbackClick={handleFeedbackClick}
            onSave={handleSave}
          />
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No content available for this spec.</p>
          </Card>
        )}
      </div>

      {/* Feedback Panel */}
      {showFeedbackPanel && (
        <div className="w-96">
          <SpecFeedbackPanel
            specId={spec.id}
            issueId={selectedIssueId}
            selectedLineNumber={selectedLine}
            selectedText={selectedText}
            onClose={() => setShowFeedbackPanel(false)}
            onFeedbackClick={handleFeedbackClick}
          />
        </div>
      )}
    </div>
  )
}

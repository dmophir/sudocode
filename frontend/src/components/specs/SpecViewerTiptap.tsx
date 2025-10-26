import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TiptapEditor } from './TiptapEditor'
import { Code2, FileText, Edit, Eye } from 'lucide-react'
import { SpecViewer } from './SpecViewer'
import type { IssueFeedback } from '@/types/api'

interface SpecViewerTiptapProps {
  content: string
  feedback?: IssueFeedback[]
  selectedLine?: number | null
  onLineClick?: (lineNumber: number) => void
  onTextSelect?: (text: string, lineNumber: number) => void
  onFeedbackClick?: (feedback: IssueFeedback) => void
  onSave?: (markdown: string) => void
  className?: string
}

/**
 * Spec viewer with Tiptap integration for rich markdown rendering and editing.
 * Provides multiple view modes:
 * - Formatted view: Beautiful rendered markdown using Tiptap (read-only)
 * - Formatted edit: Rich text editor for editing markdown
 * - Source view: Line-by-line view with feedback anchors and line numbers
 */
export function SpecViewerTiptap({
  content,
  feedback = [],
  selectedLine,
  onLineClick,
  onTextSelect,
  onFeedbackClick,
  onSave,
  className = '',
}: SpecViewerTiptapProps) {
  const [viewMode, setViewMode] = useState<'formatted' | 'source'>('formatted')
  const [isEditing, setIsEditing] = useState(false)

  const handleSave = (markdown: string) => {
    onSave?.(markdown)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  const handleEditClick = () => {
    // Switch to formatted view when entering edit mode
    if (!isEditing) {
      setViewMode('formatted')
    }
    setIsEditing(!isEditing)
  }

  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* View mode toggle */}
      {!isEditing && (
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">View:</span>
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'formatted' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('formatted')}
                className="h-8"
              >
                <FileText className="mr-2 h-4 w-4" />
                Formatted
              </Button>
              <Button
                variant={viewMode === 'source' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('source')}
                className="h-8"
              >
                <Code2 className="mr-2 h-4 w-4" />
                Source
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'source' && feedback.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {feedback.length} feedback {feedback.length === 1 ? 'item' : 'items'}
              </span>
            )}
            {viewMode === 'formatted' && onSave && (
              <Button variant="outline" size="sm" onClick={handleEditClick} className="h-8">
                {isEditing ? (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </>
                ) : (
                  <>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {viewMode === 'formatted' ? (
        <TiptapEditor
          content={content}
          editable={isEditing}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <SpecViewer
          content={content}
          feedback={feedback}
          selectedLine={selectedLine}
          onLineClick={onLineClick}
          onTextSelect={onTextSelect}
          onFeedbackClick={onFeedbackClick}
          showLineNumbers={true}
        />
      )}
    </Card>
  )
}

import { Card } from '@/components/ui/card'
import { TiptapEditor } from './TiptapEditor'
import { SpecViewer } from './SpecViewer'
import type { IssueFeedback } from '@/types/api'

interface SpecViewerTiptapProps {
  content: string
  feedback?: IssueFeedback[]
  selectedLine?: number | null
  onLineClick?: (lineNumber: number) => void
  onTextSelect?: (text: string, lineNumber: number) => void
  onFeedbackClick?: (feedback: IssueFeedback) => void
  onChange?: (markdown: string) => void
  viewMode?: 'formatted' | 'source'
  onViewModeChange?: (mode: 'formatted' | 'source') => void
  className?: string
}

/**
 * Spec viewer with Tiptap integration for rich markdown rendering and editing.
 * Provides multiple view modes:
 * - Formatted view: Always-editable rich text editor with auto-save
 * - Source view: Line-by-line view with feedback anchors and line numbers
 */
export function SpecViewerTiptap({
  content,
  feedback = [],
  selectedLine,
  onLineClick,
  onTextSelect,
  onFeedbackClick,
  onChange,
  viewMode = 'formatted',
  onViewModeChange: _onViewModeChange,
  className = '',
}: SpecViewerTiptapProps) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Content */}
      {viewMode === 'formatted' ? (
        <TiptapEditor
          content={content}
          editable={true}
          onChange={onChange}
          onCancel={() => {}}
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

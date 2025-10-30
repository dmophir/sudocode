import { useMemo, useRef } from 'react'
import { FeedbackCard } from './FeedbackCard'
import { useCollisionFreePositions } from '@/hooks/useCollisionFreePositions'
import type { IssueFeedback, FeedbackAnchor } from '@/types/api'

interface AlignedFeedbackPanelProps {
  feedback: IssueFeedback[]
  positions: Map<string, number>
  onFeedbackClick?: (feedback: IssueFeedback) => void
  onDismiss?: (id: string) => void
  onDelete?: (id: string) => void
  className?: string
}

/**
 * Parse anchor from string to FeedbackAnchor object
 */
function parseAnchor(anchor: string | undefined): FeedbackAnchor | null {
  if (!anchor) return null
  try {
    return JSON.parse(anchor) as FeedbackAnchor
  } catch {
    return null
  }
}

/**
 * Feedback panel that displays comments aligned with their document positions
 *
 * - General comments (no anchor) are shown in a sticky section at the top
 * - Anchored comments are positioned with collision detection to prevent overlaps
 * - Visual connectors show the relationship between displaced feedback and their anchor points
 */
export function AlignedFeedbackPanel({
  feedback,
  positions,
  onFeedbackClick,
  onDismiss,
  onDelete,
  className = '',
}: AlignedFeedbackPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Separate general comments from anchored comments
  const { generalComments, anchoredComments } = useMemo(() => {
    const general: IssueFeedback[] = []
    const anchored: IssueFeedback[] = []

    feedback.forEach((fb) => {
      const anchor = parseAnchor(fb.anchor)

      // A comment is "general" if it has no anchor or no line number
      if (!anchor || !anchor.line_number) {
        general.push(fb)
      } else {
        anchored.push(fb)
      }
    })

    return { generalComments: general, anchoredComments: anchored }
  }, [feedback])

  // Apply collision detection to prevent overlapping feedback cards
  // Using conservative height estimate: header (40px) + content (60px collapsed) + footer (30px) = 130px
  const collisionFreePositions = useCollisionFreePositions({
    positions,
    cardHeight: 130, // Conservative height estimate (collapsed state)
    minSpacing: 12, // Minimum gap between cards
  })

  return (
    <div className={`flex h-full w-80 flex-col bg-background ${className}`}>
      {/* General comments section - sticky at top */}
      {generalComments.length > 0 && (
        <section className="sticky top-0 z-10 border-b bg-muted/30 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <span>💭</span>
            <span>General Comments</span>
            <span className="text-xs font-normal text-muted-foreground">
              ({generalComments.length})
            </span>
          </h3>
          <div className="space-y-2">
            {generalComments.map((fb) => (
              <FeedbackCard
                key={fb.id}
                feedback={fb}
                onClick={() => onFeedbackClick?.(fb)}
                onDismiss={onDismiss ? () => onDismiss(fb.id) : undefined}
                onDelete={onDelete ? () => onDelete(fb.id) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* Anchored comments - absolutely positioned with collision detection */}
      <div className="relative min-h-full flex-1">
        <div ref={panelRef} className="relative w-full">
          {/* Feedback cards */}
          {anchoredComments.map((fb) => {
            const position = collisionFreePositions.get(fb.id)

            // Don't render if position is not yet calculated
            if (!position) return null

            return (
              <div
                key={fb.id}
                className="absolute w-full px-2"
                style={{ top: `${position.actualTop}px`, zIndex: 10 }}
              >
                <FeedbackCard
                  feedback={fb}
                  onClick={() => onFeedbackClick?.(fb)}
                  onDismiss={onDismiss ? () => onDismiss(fb.id) : undefined}
                  onDelete={onDelete ? () => onDelete(fb.id) : undefined}
                  maxHeight={200} // Max height before scrolling
                  isCompact={false}
                />
              </div>
            )
          })}

          {/* Spacer to ensure panel height matches content */}
          {anchoredComments.length > 0 && (
            <div
              style={{
                height: `${Math.max(...Array.from(collisionFreePositions.values()).map((p) => p.actualTop + p.height)) + 100}px`,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* Empty state */}
      {feedback.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          No feedback yet
        </div>
      )}
    </div>
  )
}

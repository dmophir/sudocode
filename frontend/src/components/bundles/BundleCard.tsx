import { useCallback } from 'react'
import { Card } from '@/components/ui/card'
import type { ContextBundle } from '@/types/api'

interface BundleCardProps {
  bundle: ContextBundle
  itemCount?: number
  onClick?: (bundle: ContextBundle) => void
}

export function BundleCard({ bundle, itemCount, onClick }: BundleCardProps) {
  const handleClick = useCallback(() => {
    onClick?.(bundle)
  }, [bundle, onClick])

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  return (
    <Card
      className={`cursor-pointer border border-border p-4 transition-shadow hover:shadow-md ${bundle.archived ? 'opacity-60' : ''}`}
      onClick={handleClick}
    >
      <div className="flex flex-col gap-3">
        {/* Header with ID and item count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{bundle.id}</span>
          </div>
          {itemCount !== undefined && (
            <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white dark:bg-blue-700">
              {itemCount} item{itemCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Name */}
        <h3 className="line-clamp-2 text-lg font-semibold">{bundle.name}</h3>

        {/* Description */}
        {bundle.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{bundle.description}</p>
        )}

        {/* Footer with dates */}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Created: {formatDate(bundle.created_at)}
          </p>
          {bundle.updated_at !== bundle.created_at && (
            <p className="text-xs text-muted-foreground">
              Updated: {formatDate(bundle.updated_at)}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

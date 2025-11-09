import { useCallback } from 'react'
import { Card } from '@/components/ui/card'
import type { Session } from '@/types/api'

// Agent type badge colors
const agentColors: Record<string, string> = {
  'claude-code': 'bg-blue-600 dark:bg-blue-700',
  'codex': 'bg-purple-600 dark:bg-purple-700',
}

const agentLabels: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
}

interface SessionCardProps {
  session: Session
  onClick?: (session: Session) => void
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const handleClick = useCallback(() => {
    onClick?.(session)
  }, [session, onClick])

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
      className={`cursor-pointer border border-border p-4 transition-shadow hover:shadow-md ${session.archived ? 'opacity-60' : ''}`}
      onClick={handleClick}
    >
      <div className="flex flex-col gap-3">
        {/* Header with ID and agent type */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{session.id}</span>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs text-white ${agentColors[session.agent_type]}`}
          >
            {agentLabels[session.agent_type]}
          </span>
        </div>

        {/* Title */}
        <h3 className="line-clamp-2 text-lg font-semibold">{session.title}</h3>

        {/* Description */}
        {session.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{session.description}</p>
        )}

        {/* Footer with dates */}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Created: {formatDate(session.created_at)}
          </p>
          {session.updated_at !== session.created_at && (
            <p className="text-xs text-muted-foreground">
              Updated: {formatDate(session.updated_at)}
            </p>
          )}
          <p className="truncate font-mono text-xs text-muted-foreground">
            Session ID: {session.session_id}
          </p>
        </div>
      </div>
    </Card>
  )
}

import { useNavigate } from 'react-router-dom'
import { SessionCard } from './SessionCard'
import type { Session } from '@/types/api'

interface SessionListProps {
  sessions: Session[]
  loading?: boolean
  emptyMessage?: string
}

export function SessionList({
  sessions,
  loading = false,
  emptyMessage = 'No sessions found',
}: SessionListProps) {
  const navigate = useNavigate()

  const handleSessionClick = (session: Session) => {
    navigate(`/sessions/${session.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">{emptyMessage}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Sessions are created automatically when you run executions
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} onClick={handleSessionClick} />
      ))}
    </div>
  )
}

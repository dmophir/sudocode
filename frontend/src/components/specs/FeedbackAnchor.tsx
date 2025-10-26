import { MessageSquare, AlertCircle, Lightbulb } from 'lucide-react'
import type { FeedbackType } from '@/types/api'

interface FeedbackAnchorProps {
  type: FeedbackType
  count?: number
  onClick?: () => void
  className?: string
}

/**
 * Visual indicator shown on spec lines that have feedback
 */
export function FeedbackAnchor({ type, count = 1, onClick, className = '' }: FeedbackAnchorProps) {
  const getIcon = () => {
    switch (type) {
      case 'comment':
        return <MessageSquare className="h-3 w-3" />
      case 'suggestion':
        return <Lightbulb className="h-3 w-3" />
      case 'request':
        return <AlertCircle className="h-3 w-3" />
    }
  }

  const getColor = () => {
    switch (type) {
      case 'comment':
        return 'bg-blue-500 hover:bg-blue-600'
      case 'suggestion':
        return 'bg-yellow-500 hover:bg-yellow-600'
      case 'request':
        return 'bg-orange-500 hover:bg-orange-600'
    }
  }

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white transition-colors ${getColor()} ${className}`}
      title={`${count} ${type}${count > 1 ? 's' : ''}`}
    >
      {getIcon()}
      {count > 1 && <span>{count}</span>}
    </button>
  )
}

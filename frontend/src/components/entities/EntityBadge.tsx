import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { GitBranch, FileText } from 'lucide-react'
import { useIssueHoverData } from '@/hooks/useIssueHoverData'
import { useSpecHoverData } from '@/hooks/useSpecHoverData'
import { IssueHoverContent } from './IssueHoverContent'
import { SpecHoverContent } from './SpecHoverContent'
import { cn } from '@/lib/utils'

export interface EntityBadgeProps {
  entityId: string
  entityType: 'issue' | 'spec'
  displayText?: string | null
  showHoverCard?: boolean
  linkToEntity?: boolean
  relationshipType?: string | null
  className?: string
}

function IssueHoverCard({ issueId, children }: { issueId: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const { issue, executions, isLoading, isError } = useIssueHoverData(issueId, isOpen)

  return (
    <HoverCard openDelay={200} closeDelay={200} onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-72" side="bottom" align="start">
        <IssueHoverContent
          issue={issue}
          executions={executions}
          isLoading={isLoading}
          isError={isError}
        />
      </HoverCardContent>
    </HoverCard>
  )
}

function SpecHoverCard({ specId, children }: { specId: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const { spec, implementingIssues, isLoading, isError } = useSpecHoverData(specId, isOpen)

  return (
    <HoverCard openDelay={200} closeDelay={200} onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-72" side="bottom" align="start">
        <SpecHoverContent
          spec={spec}
          implementingIssues={implementingIssues}
          isLoading={isLoading}
          isError={isError}
        />
      </HoverCardContent>
    </HoverCard>
  )
}

export function EntityBadge({
  entityId,
  entityType,
  displayText,
  showHoverCard = true,
  linkToEntity = true,
  relationshipType,
  className,
}: EntityBadgeProps) {
  const getEntityUrl = () => {
    if (entityType === 'issue') {
      return `/issues/${entityId}`
    }
    return `/specs/${entityId}`
  }

  const getIcon = () => {
    if (entityType === 'issue') {
      return <GitBranch className="h-3 w-3" />
    }
    return <FileText className="h-3 w-3" />
  }

  const getVariant = () => {
    return entityType === 'issue' ? 'issue' : 'spec'
  }

  // Display text takes precedence over entity ID
  const displayContent = displayText || entityId

  // The badge element
  const badgeElement = (
    <Badge variant={getVariant()} className={cn('inline-flex items-center gap-1', className)}>
      {getIcon()}
      {displayContent}
    </Badge>
  )

  // Optionally wrap with link
  const wrappedBadge = linkToEntity ? (
    <Link to={getEntityUrl()} className="no-underline">
      {badgeElement}
    </Link>
  ) : (
    badgeElement
  )

  // Optionally wrap with hover card
  const content = showHoverCard ? (
    entityType === 'issue' ? (
      <IssueHoverCard issueId={entityId}>{wrappedBadge}</IssueHoverCard>
    ) : (
      <SpecHoverCard specId={entityId}>{wrappedBadge}</SpecHoverCard>
    )
  ) : (
    wrappedBadge
  )

  return (
    <>
      {content}
      {relationshipType && (
        <span className="ml-1 text-xs text-muted-foreground">{relationshipType}</span>
      )}
    </>
  )
}

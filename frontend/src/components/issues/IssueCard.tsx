import { useCallback, useEffect, useRef } from 'react';
import { KanbanCard } from '@/components/ui/kanban';
import type { Issue } from '@sudocode/types';

// Priority badge colors
const priorityColors: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-blue-500',
  4: 'bg-gray-500',
};

const priorityLabels: Record<number, string> = {
  0: 'Critical',
  1: 'High',
  2: 'Medium',
  3: 'Low',
  4: 'None',
};

interface IssueCardProps {
  issue: Issue;
  index: number;
  status: string;
  onViewDetails: (issue: Issue) => void;
  isOpen?: boolean;
}

export function IssueCard({
  issue,
  index,
  status,
  onViewDetails,
  isOpen,
}: IssueCardProps) {
  const handleClick = useCallback(() => {
    onViewDetails(issue);
  }, [issue, onViewDetails]);

  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !localRef.current) return;
    const el = localRef.current;
    requestAnimationFrame(() => {
      el.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });
  }, [isOpen]);

  return (
    <KanbanCard
      key={issue.id}
      id={issue.id}
      name={issue.title}
      index={index}
      parent={status}
      onClick={handleClick}
      isOpen={isOpen}
      forwardedRef={localRef}
    >
      <div className="flex flex-1 gap-2 items-start min-w-0 flex-col">
        <div className="flex w-full items-center gap-2">
          <h4 className="flex-1 min-w-0 line-clamp-2 font-medium text-sm">
            {issue.title}
          </h4>
          {/* Priority Badge */}
          {issue.priority !== undefined && issue.priority <= 3 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full text-white shrink-0 ${priorityColors[issue.priority]}`}
            >
              {priorityLabels[issue.priority]}
            </span>
          )}
        </div>
        {/* Issue ID */}
        <div className="text-xs text-muted-foreground">{issue.id}</div>
        {/* Description Preview */}
        {issue.description && (
          <p className="text-sm text-secondary-foreground break-words line-clamp-2">
            {issue.description.length > 100
              ? `${issue.description.substring(0, 100)}...`
              : issue.description}
          </p>
        )}
      </div>
    </KanbanCard>
  );
}

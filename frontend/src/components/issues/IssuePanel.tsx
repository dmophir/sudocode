import type { Issue } from '@sudocode/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface IssuePanelProps {
  issue: Issue;
  onClose?: () => void;
}

const priorityLabels: Record<number, string> = {
  0: 'Critical',
  1: 'High',
  2: 'Medium',
  3: 'Low',
  4: 'None',
};

const statusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  needs_review: 'Needs Review',
  closed: 'Closed',
};

export function IssuePanel({ issue, onClose }: IssuePanelProps) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>{issue.title}</CardTitle>
              <div className="mt-2 text-sm text-muted-foreground">
                {issue.id}
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Status
              </div>
              <div className="text-sm">
                {statusLabels[issue.status] || issue.status}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Priority
              </div>
              <div className="text-sm">
                {priorityLabels[issue.priority] || issue.priority}
              </div>
            </div>
          </div>

          {/* Description */}
          {issue.description && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Description
              </div>
              <div className="text-sm whitespace-pre-wrap">
                {issue.description}
              </div>
            </div>
          )}

          {/* Content */}
          {issue.content && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Details
              </div>
              <div className="text-sm whitespace-pre-wrap prose prose-sm max-w-none">
                {issue.content}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t pt-4 space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Created:</span>{' '}
              {new Date(issue.created_at).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Updated:</span>{' '}
              {new Date(issue.updated_at).toLocaleString()}
            </div>
            {issue.closed_at && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Closed:</span>{' '}
                {new Date(issue.closed_at).toLocaleString()}
              </div>
            )}
          </div>

          {/* Assignee */}
          {issue.assignee && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Assignee
              </div>
              <div className="text-sm">{issue.assignee}</div>
            </div>
          )}

          {/* Parent */}
          {issue.parent_id && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Parent Issue
              </div>
              <div className="text-sm">{issue.parent_id}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default IssuePanel;

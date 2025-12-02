import { useQuery } from '@tanstack/react-query'
import { issuesApi, executionsApi, getCurrentProjectId } from '@/lib/api'
import { useProject } from '@/hooks/useProject'
import type { Issue } from '@/types/api'
import type { Execution } from '@/types/execution'

interface IssueHoverData {
  issue: Issue | undefined
  executions: Execution[]
  isLoading: boolean
  isError: boolean
}

/**
 * Hook for fetching issue data for hover cards.
 * Uses lazy loading - only fetches when enabled is true.
 *
 * @param issueId - The issue ID to fetch
 * @param enabled - Whether to fetch data (typically set to true when hover card opens)
 */
export function useIssueHoverData(issueId: string, enabled: boolean): IssueHoverData {
  const { currentProjectId } = useProject()
  const apiProjectId = getCurrentProjectId()
  const isProjectSynced = currentProjectId === apiProjectId

  // Fetch issue data
  const issueQuery = useQuery({
    queryKey: ['issue', currentProjectId, issueId],
    queryFn: () => issuesApi.getById(issueId),
    enabled: enabled && !!issueId && !!currentProjectId && isProjectSynced,
    staleTime: 30000, // 30 seconds
  })

  // Fetch recent executions for the issue
  const executionsQuery = useQuery({
    queryKey: ['issue-executions-preview', currentProjectId, issueId],
    queryFn: async () => {
      const executions = await executionsApi.list(issueId)
      // Sort by created_at descending and take most recent 3
      return executions
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3)
    },
    enabled: enabled && !!issueId && !!currentProjectId && isProjectSynced,
    staleTime: 60000, // 1 minute - executions change less frequently for preview
  })

  return {
    issue: issueQuery.data,
    executions: executionsQuery.data ?? [],
    isLoading: issueQuery.isLoading || executionsQuery.isLoading,
    isError: issueQuery.isError || executionsQuery.isError,
  }
}

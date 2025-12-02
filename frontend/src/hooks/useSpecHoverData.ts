import { useQuery } from '@tanstack/react-query'
import { specsApi, relationshipsApi, getCurrentProjectId } from '@/lib/api'
import { useProject } from '@/hooks/useProject'
import type { Spec, Relationship } from '@/types/api'

interface ImplementingIssue {
  id: string
  type: 'issue'
}

interface SpecHoverData {
  spec: Spec | undefined
  implementingIssues: ImplementingIssue[]
  isLoading: boolean
  isError: boolean
}

/**
 * Hook for fetching spec data for hover cards.
 * Uses lazy loading - only fetches when enabled is true.
 *
 * @param specId - The spec ID to fetch
 * @param enabled - Whether to fetch data (typically set to true when hover card opens)
 */
export function useSpecHoverData(specId: string, enabled: boolean): SpecHoverData {
  const { currentProjectId } = useProject()
  const apiProjectId = getCurrentProjectId()
  const isProjectSynced = currentProjectId === apiProjectId

  // Fetch spec data
  const specQuery = useQuery({
    queryKey: ['spec', currentProjectId, specId],
    queryFn: () => specsApi.getById(specId),
    enabled: enabled && !!specId && !!currentProjectId && isProjectSynced,
    staleTime: 30000, // 30 seconds
  })

  // Fetch implementing issues (via relationships)
  const implementersQuery = useQuery({
    queryKey: ['spec-implementers', currentProjectId, specId],
    queryFn: async () => {
      const response = await relationshipsApi.getForEntity(specId, 'spec')

      // Handle both response shapes (array or {incoming, outgoing})
      let allRels: Relationship[]
      if (Array.isArray(response)) {
        allRels = response
      } else {
        allRels = [...(response.incoming || []), ...(response.outgoing || [])]
      }

      // Filter for 'implements' relationships where this spec is the target
      // and the source is an issue
      const implementing = allRels
        .filter(r => r.relationship_type === 'implements' && r.to_id === specId && r.from_type === 'issue')
        .map(r => ({
          id: r.from_id,
          type: 'issue' as const,
        }))

      return implementing
    },
    enabled: enabled && !!specId && !!currentProjectId && isProjectSynced,
    staleTime: 120000, // 2 minutes - relationships are relatively stable
  })

  return {
    spec: specQuery.data,
    implementingIssues: implementersQuery.data ?? [],
    isLoading: specQuery.isLoading || implementersQuery.isLoading,
    isError: specQuery.isError || implementersQuery.isError,
  }
}

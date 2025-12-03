import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSpecHoverData } from '@/hooks/useSpecHoverData'
import { specsApi, relationshipsApi } from '@/lib/api'
import type { Spec, Relationship } from '@/types/api'
import React from 'react'

// Mock Project context
let mockProjectId: string | null = 'test-project-id'

vi.mock('@/lib/api', () => ({
  setCurrentProjectId: vi.fn(),
  getCurrentProjectId: () => mockProjectId,
  specsApi: {
    getById: vi.fn(),
  },
  relationshipsApi: {
    getForEntity: vi.fn(),
  },
}))

vi.mock('@/hooks/useProject', () => ({
  useProject: () => ({
    currentProjectId: mockProjectId,
    setCurrentProjectId: vi.fn(),
    currentProject: null,
    setCurrentProject: vi.fn(),
    clearProject: vi.fn(),
  }),
}))

describe('useSpecHoverData', () => {
  let queryClient: QueryClient

  const mockSpec: Spec = {
    id: 's-test123',
    uuid: 'uuid-test123',
    title: 'Test Spec',
    content: 'Test content',
    file_path: '/path/to/spec.md',
    priority: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  const mockRelationshipsArray: Relationship[] = [
    {
      from_id: 'i-impl001',
      from_uuid: 'uuid-impl001',
      from_type: 'issue',
      to_id: 's-test123',
      to_uuid: 'uuid-test123',
      to_type: 'spec',
      relationship_type: 'implements',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      from_id: 'i-impl002',
      from_uuid: 'uuid-impl002',
      from_type: 'issue',
      to_id: 's-test123',
      to_uuid: 'uuid-test123',
      to_type: 'spec',
      relationship_type: 'implements',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      from_id: 's-test123',
      from_uuid: 'uuid-test123',
      from_type: 'spec',
      to_id: 's-other',
      to_uuid: 'uuid-other',
      to_type: 'spec',
      relationship_type: 'references',
      created_at: '2024-01-01T00:00:00Z',
    },
  ]

  const mockRelationshipsObject = {
    incoming: [mockRelationshipsArray[0], mockRelationshipsArray[1]],
    outgoing: [mockRelationshipsArray[2]],
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.clearAllMocks()
    mockProjectId = 'test-project-id'
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe('when enabled is false', () => {
    it('should not fetch data', () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue([])

      const { result } = renderHook(() => useSpecHoverData('s-test123', false), { wrapper })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.spec).toBeUndefined()
      expect(result.current.implementingIssues).toEqual([])
      expect(specsApi.getById).not.toHaveBeenCalled()
      expect(relationshipsApi.getForEntity).not.toHaveBeenCalled()
    })
  })

  describe('when enabled is true', () => {
    it('should fetch spec data', async () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue([])

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.spec).toEqual(mockSpec)
      expect(specsApi.getById).toHaveBeenCalledWith('s-test123')
    })

    it('should fetch relationships data', async () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue(mockRelationshipsArray)

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(relationshipsApi.getForEntity).toHaveBeenCalledWith('s-test123', 'spec')
    })

    it('should handle array response format', async () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue(mockRelationshipsArray)

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should filter for 'implements' relationships where spec is target
      expect(result.current.implementingIssues).toHaveLength(2)
      expect(result.current.implementingIssues[0].id).toBe('i-impl001')
      expect(result.current.implementingIssues[1].id).toBe('i-impl002')
    })

    it('should handle object response format with incoming/outgoing', async () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue(mockRelationshipsObject)

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should filter for 'implements' relationships where spec is target
      expect(result.current.implementingIssues).toHaveLength(2)
      expect(result.current.implementingIssues[0].id).toBe('i-impl001')
      expect(result.current.implementingIssues[1].id).toBe('i-impl002')
    })

    it('should filter out non-implements relationships', async () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue(mockRelationshipsArray)

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should not include the 'references' relationship
      const ids = result.current.implementingIssues.map((i) => i.id)
      expect(ids).not.toContain('s-other')
    })

    it('should filter out relationships where spec is not the target', async () => {
      const relationsWhereSpecIsSource: Relationship[] = [
        {
          from_id: 's-test123',
          from_uuid: 'uuid-test123',
          from_type: 'spec',
          to_id: 's-other',
          to_uuid: 'uuid-other',
          to_type: 'spec',
          relationship_type: 'implements',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]

      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue(relationsWhereSpecIsSource)

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should be empty because spec is the source, not target
      expect(result.current.implementingIssues).toHaveLength(0)
    })

    it('should only include issues, not specs, as implementing entities', async () => {
      const mixedRelationships: Relationship[] = [
        {
          from_id: 'i-impl001',
          from_uuid: 'uuid-impl001',
          from_type: 'issue',
          to_id: 's-test123',
          to_uuid: 'uuid-test123',
          to_type: 'spec',
          relationship_type: 'implements',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          from_id: 's-other',
          from_uuid: 'uuid-other',
          from_type: 'spec',
          to_id: 's-test123',
          to_uuid: 'uuid-test123',
          to_type: 'spec',
          relationship_type: 'implements',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]

      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue(mixedRelationships)

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should only include the issue, not the spec
      expect(result.current.implementingIssues).toHaveLength(1)
      expect(result.current.implementingIssues[0].id).toBe('i-impl001')
    })
  })

  describe('loading state', () => {
    it('should return isLoading true while fetching', async () => {
      vi.mocked(specsApi.getById).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSpec), 100))
      )
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue([])

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })

  describe('error handling', () => {
    it('should return isError true when spec fetch fails', async () => {
      vi.mocked(specsApi.getById).mockRejectedValue(new Error('Failed to fetch'))
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue([])

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })

    it('should return isError true when relationships fetch fails', async () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockRejectedValue(new Error('Failed to fetch'))

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })

  describe('when projectId is null', () => {
    it('should not fetch data', () => {
      mockProjectId = null

      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue([])

      const { result } = renderHook(() => useSpecHoverData('s-test123', true), { wrapper })

      expect(result.current.isLoading).toBe(false)
      expect(specsApi.getById).not.toHaveBeenCalled()
    })
  })

  describe('when specId is empty', () => {
    it('should not fetch data', () => {
      vi.mocked(specsApi.getById).mockResolvedValue(mockSpec)
      vi.mocked(relationshipsApi.getForEntity).mockResolvedValue([])

      const { result } = renderHook(() => useSpecHoverData('', true), { wrapper })

      expect(result.current.isLoading).toBe(false)
      expect(specsApi.getById).not.toHaveBeenCalled()
    })
  })
})

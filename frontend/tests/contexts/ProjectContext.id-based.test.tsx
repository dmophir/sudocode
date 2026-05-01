import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { ProjectProvider, useProjectContext } from '@/contexts/ProjectContext'
import * as api from '@/lib/api'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock the API
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api')
  return {
    ...actual,
    setCurrentProjectId: vi.fn(),
    projectsApi: {
      getOpen: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      open: vi.fn().mockResolvedValue({}),
      setCurrent: vi.fn().mockResolvedValue({ currentProjectId: null }),
    },
  }
})

const mockProjectsApi = api.projectsApi as {
  getOpen: ReturnType<typeof vi.fn>
  getById: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  setCurrent: ReturnType<typeof vi.fn>
}

describe('ProjectContext - id-based switching', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    mockProjectsApi.getOpen.mockResolvedValue([])
    mockProjectsApi.getById.mockResolvedValue(null)
    mockProjectsApi.open.mockResolvedValue({})
    mockProjectsApi.setCurrent.mockResolvedValue({ currentProjectId: null })
  })

  it('should re-open stored project by ID on mount (not by path)', async () => {
    localStorageMock.setItem('sudocode:currentProjectId', 'project-abc')

    // Project not currently open
    mockProjectsApi.getOpen.mockResolvedValue([])
    // Project exists in registry
    mockProjectsApi.getById.mockResolvedValue({
      id: 'project-abc',
      name: 'Test',
      path: '/some/path',
      sudocodeDir: '/some/path/.sudocode',
      registeredAt: '2025-01-01T00:00:00Z',
      lastOpenedAt: '2025-01-01T00:00:00Z',
      favorite: false,
    })
    mockProjectsApi.open.mockResolvedValue({})

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider>{children}</ProjectProvider>
    )

    renderHook(() => useProjectContext(), { wrapper })

    await waitFor(() => {
      expect(mockProjectsApi.open).toHaveBeenCalledWith({ projectId: 'project-abc' })
    })

    // Should NOT have been called with a path
    expect(mockProjectsApi.open).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.any(String) })
    )
  })

  it('should clear stored project when server returns 404 for stale ID', async () => {
    localStorageMock.setItem('sudocode:currentProjectId', 'stale-project-id')

    mockProjectsApi.getOpen.mockResolvedValue([])
    // Project no longer exists in registry
    mockProjectsApi.getById.mockRejectedValue(new Error('Not Found'))

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider>{children}</ProjectProvider>
    )

    const { result } = renderHook(() => useProjectContext(), { wrapper })

    await waitFor(() => {
      expect(result.current.currentProjectId).toBeNull()
    })

    // Should have cleared from localStorage
    expect(localStorageMock.getItem('sudocode:currentProjectId')).toBeNull()
  })

  it('should not attempt path-based open when switching projects', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProjectProvider skipValidation>{children}</ProjectProvider>
    )

    const { result } = renderHook(() => useProjectContext(), { wrapper })

    act(() => {
      result.current.setCurrentProjectId('new-project-id')
    })

    // setCurrentProjectId only updates local state + API header + server sync
    // It does NOT call projectsApi.open with a path
    expect(mockProjectsApi.open).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.any(String) })
    )
  })
})

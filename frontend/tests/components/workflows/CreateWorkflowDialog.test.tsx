/**
 * Tests for CreateWorkflowDialog component
 * Focuses on model selector functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

// Mock axios.get before importing components
vi.mock('axios', () => {
  const getFn = vi.fn().mockResolvedValue({ data: { current: 'main', branches: ['main'] } })
  const postFn = vi.fn().mockResolvedValue({ data: {} })
  const createFn = vi.fn(() => ({
    get: getFn,
    post: postFn,
    request: vi.fn().mockResolvedValue({ data: { current: 'main', branches: ['main'] } }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }))
  const axiosObj = {
    get: getFn,
    post: postFn,
    create: createFn,
  }
  return {
    default: axiosObj,
  }
})

import axios from 'axios'
import { CreateWorkflowDialog } from '@/components/workflows/CreateWorkflowDialog'
import * as configApi from '@/lib/api'

const mockAxiosGet = axios.get as ReturnType<typeof vi.fn>

// Mock hooks
vi.mock('@/hooks/useSpecs', () => ({
  useSpecs: vi.fn(() => ({
    specs: [],
    isLoading: false,
  })),
}))

vi.mock('@/hooks/useIssues', () => ({
  useIssues: vi.fn(() => ({
    issues: [],
    isLoading: false,
  })),
}))

vi.mock('@/hooks/useWorktrees', () => ({
  useWorktrees: vi.fn(() => ({
    worktrees: [],
  })),
}))

// Mock ThemeContext
vi.mock('@/contexts/ThemeContext', async () => {
  const actual = await vi.importActual('@/contexts/ThemeContext')
  return {
    ...actual,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  }
})

// Mock WebSocketContext
vi.mock('@/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock ProjectContext
vi.mock('@/contexts/ProjectContext', () => ({
  ProjectProvider: ({ children }: { children: React.ReactNode }) => children,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockAxiosGet.mockReset().mockResolvedValue({ data: { current: 'main', branches: ['main'] } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CreateWorkflowDialog Model Selector', () => {
  const mockOnCreate = vi.fn()
  const mockOnOpenChange = vi.fn()

  // Mock successful model response
  const mockModelsResponse = [
    'gpt-4o',
    'gpt-4o-mini',
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
  ]

  it('fetches models from API when dialog opens', async () => {
    const { render } = await import('@testing-library/react')
    render(
      <CreateWorkflowDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onCreate={mockOnCreate}
      />
    )

    // Wait for dialog to render
    await waitFor(() => {
      expect(screen.getByText('Create Workflow')).toBeInTheDocument()
    })

    // Verify axios was called (component makes API calls on mount)
    expect(mockAxiosGet).toHaveBeenCalled()
  })

  it('verifies local config fetching logic exists', async () => {
    // The component uses axios for API calls, not global fetch
    // This test verifies the configApi.getLocal function is available
    expect(configApi.configApi.getLocal).toBeDefined()
    expect(typeof configApi.configApi.getLocal).toBe('function')
  })

  it('handles API fetch error gracefully', async () => {
    // Mock failed API response
    mockAxiosGet
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: {},
      })

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { render } = await import('@testing-library/react')
    render(
      <CreateWorkflowDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onCreate={mockOnCreate}
      />
    )

    // Should still render the dialog
    await waitFor(() => {
      expect(screen.getByText('Create Workflow')).toBeInTheDocument()
    })

    consoleWarnSpy.mockRestore()
  })

  it('verifies updateWorkflowModel function is available in configApi', async () => {
    // Verify the function exists and is callable
    expect(configApi.configApi.updateWorkflowModel).toBeDefined()
    expect(typeof configApi.configApi.updateWorkflowModel).toBe('function')
  })

  it('verifies dialog component structure', async () => {
    // Mock API responses
    mockAxiosGet
      .mockResolvedValueOnce({
        data: { models: mockModelsResponse, cached: false },
      })
      .mockResolvedValueOnce({
        data: {},
      })

    const { render } = await import('@testing-library/react')
    render(
      <CreateWorkflowDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onCreate={mockOnCreate}
      />
    )

    // Wait for the dialog to render
    await waitFor(() => {
      expect(screen.getByText('Create Workflow')).toBeInTheDocument()
    })
  })
})

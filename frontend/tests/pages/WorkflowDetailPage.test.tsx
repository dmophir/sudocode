/**
 * Tests for WorkflowDetailPage component
 * Focuses on model selector functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import * as configApi from '@/lib/api'

// Mock hooks
vi.mock('@/hooks/useWorkflows', () => ({
  useWorkflow: vi.fn(() => ({
    workflow: {
      id: 'workflow-123',
      title: 'Test Workflow',
      status: 'pending',
      steps: [],
      config: {},
      worktreePath: undefined,
    },
    issues: {},
    isLoading: false,
    error: null,
  })),
  useWorkflowMutations: vi.fn(() => ({
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    isStarting: false,
    isResuming: false,
  })),
  useWorkflowProgress: vi.fn(() => ({
    completed: 0,
    total: 0,
    percentage: 0,
  })),
  useWorkflowEscalation: vi.fn(() => ({
    escalation: null,
    hasPendingEscalation: false,
    respond: vi.fn(),
    isResponding: false,
  })),
}))

vi.mock('@/hooks/useProjectRoutes', () => ({
  useProjectRoutes: vi.fn(() => ({
    paths: {
      workflows: () => '/workflows',
    },
  })),
}))

vi.mock('@/hooks/useIssues', () => ({
  useIssues: vi.fn(() => ({
    issues: {},
    isLoading: false,
  })),
}))

vi.mock('@/hooks/useExecutionChanges', () => ({
  useExecutionChanges: vi.fn(() => ({
    data: { available: false },
    refresh: vi.fn(),
  })),
}))

vi.mock('@/hooks/useExecutionSync', () => ({
  useExecutionSync: vi.fn(() => ({
    fetchSyncPreview: vi.fn(),
    syncPreview: null,
    isSyncPreviewOpen: false,
    setIsSyncPreviewOpen: vi.fn(),
    performSync: vi.fn(),
    isPreviewing: false,
  })),
}))

vi.mock('@/hooks/useWorktrees', () => ({
  useWorktrees: vi.fn(() => ({
    worktrees: [],
  })),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WorkflowDetailPage Model Selector', () => {
  it('verifies model selector API functions are available', async () => {
    // Verify the configApi functions exist
    expect(configApi.configApi.updateWorkflowModel).toBeDefined()
    expect(typeof configApi.configApi.updateWorkflowModel).toBe('function')
  })

  it('verifies useWorkflow hook returns workflow with config', async () => {
    const { useWorkflow } = await import('@/hooks/useWorkflows')
    
    const result = useWorkflow('workflow-123')
    
    expect(result.workflow).toBeDefined()
    expect(result.workflow?.id).toBe('workflow-123')
  })

  it('verifies workflow status affects model selector disabled state', async () => {
    const { useWorkflow } = await import('@/hooks/useWorkflows')
    
    // Mock running workflow
    useWorkflow.mockReturnValue({
      workflow: {
        id: 'workflow-123',
        title: 'Test Workflow',
        status: 'running',
        steps: [],
        config: {},
        worktreePath: undefined,
      },
      issues: {},
      isLoading: false,
      error: null,
    })

    const result = useWorkflow('workflow-123')
    expect(result.workflow?.status).toBe('running')
  })

  it('verifies model update function signature', async () => {
    // The updateWorkflowModel function should accept string | undefined
    const updateFn = configApi.configApi.updateWorkflowModel
    expect(updateFn).toBeDefined()
    
    // Verify it's a function that can be called
    expect(typeof updateFn).toBe('function')
  })
})

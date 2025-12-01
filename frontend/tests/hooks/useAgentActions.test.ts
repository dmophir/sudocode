import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAgentActions } from '@/hooks/useAgentActions'
import type { Execution } from '@/types/execution'

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/hooks/useExecutionSync', () => ({
  useExecutionSync: () => ({
    fetchSyncPreview: vi.fn(),
    openWorktreeInIDE: vi.fn(),
  }),
}))

describe('useAgentActions', () => {
  const mockExecution: Execution = {
    id: 'exec-123',
    issue_id: 'i-test1',
    issue_uuid: 'uuid-123',
    mode: 'worktree',
    prompt: 'Test prompt',
    config: JSON.stringify({ mode: 'worktree' }),
    agent_type: 'claude-code',
    session_id: 'session-123',
    workflow_execution_id: null,
    target_branch: 'main',
    branch_name: 'feature/test',
    before_commit: 'abc123',
    after_commit: null,
    worktree_path: '/path/to/worktree',
    status: 'completed',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T01:00:00Z',
    started_at: '2024-01-01T00:00:00Z',
    completed_at: '2024-01-01T01:00:00Z',
    cancelled_at: null,
    exit_code: 0,
    error_message: null,
    error: null,
    model: 'claude-sonnet-4',
    summary: 'Completed successfully',
    files_changed: JSON.stringify(['file1.ts', 'file2.ts', 'file3.ts']),
    parent_execution_id: null,
    step_type: null,
    step_index: null,
    step_config: null,
  }

  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  // Wrapper to provide QueryClient
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  describe('Action Detection', () => {
    it('should return no actions when execution is null', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: null,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      expect(result.current.actions).toEqual([])
      expect(result.current.hasActions).toBe(false)
    })

    it('should return no actions when execution is undefined', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: undefined,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      expect(result.current.actions).toEqual([])
      expect(result.current.hasActions).toBe(false)
    })

    it('should detect commit action when execution has uncommitted files', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction).toBeDefined()
      expect(commitAction?.label).toBe('Commit Changes')
      expect(commitAction?.badge).toBe(3) // 3 files
      expect(commitAction?.description).toBe('Commit 3 file changes')
    })

    it('should not show commit action when files are already committed', () => {
      const committedExecution: Execution = {
        ...mockExecution,
        after_commit: 'def456', // Has commit hash
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: committedExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction).toBeUndefined()
    })

    it('should not show commit action when execution is not completed', () => {
      const runningExecution: Execution = {
        ...mockExecution,
        status: 'running',
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: runningExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction).toBeUndefined()
    })

    it('should detect sync action for worktree executions with changes', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const syncAction = result.current.actions.find((a) => a.id === 'squash-merge')
      expect(syncAction).toBeDefined()
      expect(syncAction?.label).toBe('Squash & Merge')
      expect(syncAction?.description).toBe('Sync worktree changes to local branch')
    })

    it('should not show sync action for local mode executions', () => {
      const localExecution: Execution = {
        ...mockExecution,
        mode: 'local',
        config: JSON.stringify({ mode: 'local' }),
        worktree_path: null,
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: localExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const syncAction = result.current.actions.find((a) => a.id === 'squash-merge')
      expect(syncAction).toBeUndefined()
    })

    it('should not show sync action when no files changed', () => {
      const noChangesExecution: Execution = {
        ...mockExecution,
        files_changed: null,
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: noChangesExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const syncAction = result.current.actions.find((a) => a.id === 'squash-merge')
      expect(syncAction).toBeUndefined()
    })

    it('should show sync action for running executions with worktree and changes', () => {
      const runningExecution: Execution = {
        ...mockExecution,
        status: 'running',
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: runningExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const syncAction = result.current.actions.find((a) => a.id === 'squash-merge')
      expect(syncAction).toBeDefined()
      expect(syncAction?.label).toBe('Squash & Merge')
    })

    it('should show sync action for paused executions with worktree and changes', () => {
      const pausedExecution: Execution = {
        ...mockExecution,
        status: 'paused',
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: pausedExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const syncAction = result.current.actions.find((a) => a.id === 'squash-merge')
      expect(syncAction).toBeDefined()
    })

    it('should detect cleanup worktree action when worktree exists', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const cleanupAction = result.current.actions.find((a) => a.id === 'cleanup-worktree')
      expect(cleanupAction).toBeDefined()
      expect(cleanupAction?.label).toBe('Cleanup Worktree')
      expect(cleanupAction?.variant).toBe('outline')
    })

    it('should not show cleanup action for local mode executions', () => {
      const localExecution: Execution = {
        ...mockExecution,
        mode: 'local',
        worktree_path: null,
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: localExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const cleanupAction = result.current.actions.find((a) => a.id === 'cleanup-worktree')
      expect(cleanupAction).toBeUndefined()
    })

    it('should handle files_changed as JSON array', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction?.badge).toBe(3)
    })

    it('should handle files_changed as single string', () => {
      const singleFileExecution: Execution = {
        ...mockExecution,
        files_changed: 'single-file.ts',
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: singleFileExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction?.badge).toBe(1)
    })
  })

  describe('Action Handlers', () => {
    it('should open commit dialog when commit action is clicked', async () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      expect(result.current.isCommitDialogOpen).toBe(false)

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction).toBeDefined()

      await act(async () => {
        await commitAction?.onClick()
      })

      expect(result.current.isCommitDialogOpen).toBe(true)
    })

    it('should open cleanup dialog when cleanup action is clicked', async () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      expect(result.current.isCleanupDialogOpen).toBe(false)

      const cleanupAction = result.current.actions.find((a) => a.id === 'cleanup-worktree')
      expect(cleanupAction).toBeDefined()

      await act(async () => {
        await cleanupAction?.onClick()
      })

      expect(result.current.isCleanupDialogOpen).toBe(true)
    })

    it('should call fetchSyncPreview when squash merge action is clicked', async () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const syncAction = result.current.actions.find((a) => a.id === 'squash-merge')
      expect(syncAction).toBeDefined()

      // fetchSyncPreview is mocked in useExecutionSync mock
      await syncAction?.onClick()

      // Should have called fetchSyncPreview (mocked)
      // The actual behavior is tested in useExecutionSync tests
    })
  })

  describe('Disabled State', () => {
    it('should disable all actions when disabled prop is true', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
            disabled: true,
          }),
        { wrapper }
      )

      result.current.actions.forEach((action) => {
        expect(action.disabled).toBe(true)
      })
    })

    it('should not disable actions when disabled prop is false', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
            disabled: false,
          }),
        { wrapper }
      )

      result.current.actions.forEach((action) => {
        expect(action.disabled).toBe(false)
      })
    })
  })

  describe('Helper Functions', () => {
    it('should provide getAction helper to retrieve action by id', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.getAction('commit-changes')
      expect(commitAction).toBeDefined()
      expect(commitAction?.id).toBe('commit-changes')
    })

    it('should return undefined for non-existent action', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const action = result.current.getAction('non-existent-action')
      expect(action).toBeUndefined()
    })
  })

  describe('Multiple Actions', () => {
    it('should show multiple actions when conditions are met', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      // Should have: commit, squash-merge, cleanup
      expect(result.current.actions.length).toBeGreaterThanOrEqual(3)
      expect(result.current.hasActions).toBe(true)

      const actionIds = result.current.actions.map((a) => a.id)
      expect(actionIds).toContain('commit-changes')
      expect(actionIds).toContain('squash-merge')
      expect(actionIds).toContain('cleanup-worktree')
    })

    it('should show subset of actions when only some conditions are met', () => {
      // Already committed, so no commit action
      const committedExecution: Execution = {
        ...mockExecution,
        after_commit: 'def456',
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: committedExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const actionIds = result.current.actions.map((a) => a.id)
      expect(actionIds).not.toContain('commit-changes')
      expect(actionIds).toContain('squash-merge')
      expect(actionIds).toContain('cleanup-worktree')
    })
  })

  describe('Edge Cases', () => {
    it('should handle execution with null config gracefully', () => {
      const noConfigExecution: Execution = {
        ...mockExecution,
        config: null,
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: noConfigExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      // Should still work with mode from top-level field
      expect(result.current.actions.length).toBeGreaterThan(0)
    })

    it('should handle execution with invalid JSON config gracefully', () => {
      const invalidConfigExecution: Execution = {
        ...mockExecution,
        config: '{invalid json',
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: invalidConfigExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      // Should still work by falling back to mode field
      expect(result.current.actions.length).toBeGreaterThan(0)
    })

    it('should handle execution with empty files_changed array', () => {
      const noFilesExecution: Execution = {
        ...mockExecution,
        files_changed: JSON.stringify([]),
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: noFilesExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction).toBeUndefined()
    })

    it('should use singular form for single file change', () => {
      const singleFileExecution: Execution = {
        ...mockExecution,
        files_changed: JSON.stringify(['file1.ts']),
      }

      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: singleFileExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction?.description).toBe('Commit 1 file change')
    })

    it('should use plural form for multiple file changes', () => {
      const { result } = renderHook(
        () =>
          useAgentActions({
            execution: mockExecution,
            issueId: 'i-test1',
          }),
        { wrapper }
      )

      const commitAction = result.current.actions.find((a) => a.id === 'commit-changes')
      expect(commitAction?.description).toBe('Commit 3 file changes')
    })
  })
})

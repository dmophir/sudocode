/**
 * CodeChangesPanel Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CodeChangesPanel } from '@/components/executions/CodeChangesPanel'
import { useExecutionChanges } from '@/hooks/useExecutionChanges'
import type { ExecutionChangesResult } from '@/types/execution'

// Mock the useExecutionChanges hook
vi.mock('@/hooks/useExecutionChanges')

const mockUseExecutionChanges = vi.mocked(useExecutionChanges)

describe('CodeChangesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('should display loading state', () => {
      mockUseExecutionChanges.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('Loading code changes...')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should display error message when fetch fails', () => {
      mockUseExecutionChanges.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Network error'),
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText(/Failed to load changes/)).toBeInTheDocument()
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
    })
  })

  describe('Unavailable State', () => {
    it('should display message for missing commits', () => {
      const data: ExecutionChangesResult = {
        available: false,
        reason: 'missing_commits',
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(
        screen.getByText('Changes unavailable: Commit information not captured')
      ).toBeInTheDocument()
    })

    it('should display message for commits not found', () => {
      const data: ExecutionChangesResult = {
        available: false,
        reason: 'commits_not_found',
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(
        screen.getByText('Changes unavailable: Commits no longer exist in repository')
      ).toBeInTheDocument()
    })

    it('should display message for incomplete execution', () => {
      const data: ExecutionChangesResult = {
        available: false,
        reason: 'incomplete_execution',
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(
        screen.getByText('Changes unavailable: Execution did not complete successfully')
      ).toBeInTheDocument()
    })

    it('should display message for git error', () => {
      const data: ExecutionChangesResult = {
        available: false,
        reason: 'git_error',
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('Changes unavailable: Git operation failed')).toBeInTheDocument()
    })

    it('should display message for worktree deleted with uncommitted changes', () => {
      const data: ExecutionChangesResult = {
        available: false,
        reason: 'worktree_deleted_with_uncommitted_changes',
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(
        screen.getByText('Changes unavailable: Worktree was deleted before changes were committed')
      ).toBeInTheDocument()
    })

    it('should display generic message for unknown reason', () => {
      const data: ExecutionChangesResult = {
        available: false,
        reason: 'unknown_reason' as any,
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('Changes unavailable: Unknown reason')).toBeInTheDocument()
    })
  })

  describe('Available Changes - File List', () => {
    it('should display file list with status badges', () => {
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [
            { path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' },
            { path: 'src/file2.ts', additions: 20, deletions: 0, status: 'A' },
            { path: 'src/file3.ts', additions: 0, deletions: 15, status: 'D' },
            { path: 'src/file4.ts', additions: 5, deletions: 3, status: 'R' },
          ],
          summary: {
            totalFiles: 4,
            totalAdditions: 35,
            totalDeletions: 23,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      // Check file paths
      expect(screen.getByText('src/file1.ts')).toBeInTheDocument()
      expect(screen.getByText('src/file2.ts')).toBeInTheDocument()
      expect(screen.getByText('src/file3.ts')).toBeInTheDocument()
      expect(screen.getByText('src/file4.ts')).toBeInTheDocument()

      // Check status badges
      expect(screen.getByText('Modified')).toBeInTheDocument()
      expect(screen.getByText('Added')).toBeInTheDocument()
      expect(screen.getByText('Deleted')).toBeInTheDocument()
      expect(screen.getByText('Renamed')).toBeInTheDocument()
    })

    it('should display file statistics (additions and deletions)', () => {
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      // Check for additions and deletions in the file row
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('should not display statistics for files with zero changes', () => {
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 0, deletions: 0, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 0,
            totalDeletions: 0,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      // Should not display 0 additions or deletions
      const fileRow = screen.getByText('src/file1.ts').closest('div')
      expect(fileRow).not.toHaveTextContent('+0')
      expect(fileRow).not.toHaveTextContent('-0')
    })
  })

  describe('Available Changes - Summary', () => {
    it('should display summary statistics in header', () => {
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [
            { path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' },
            { path: 'src/file2.ts', additions: 20, deletions: 8, status: 'A' },
          ],
          summary: {
            totalFiles: 2,
            totalAdditions: 30,
            totalDeletions: 13,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('2 files changed')).toBeInTheDocument()
      expect(screen.getByText('+30')).toBeInTheDocument()
      expect(screen.getByText('-13')).toBeInTheDocument()
    })

    it('should use singular form for single file', () => {
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('1 file changed')).toBeInTheDocument()
    })

    it('should not display summary stats when zero', () => {
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 0, deletions: 0, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 0,
            totalDeletions: 0,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      // Should not display +0 or -0 in summary
      const header = screen.getByText('Code Changes').closest('div')
      expect(header).not.toHaveTextContent('+0')
      expect(header).not.toHaveTextContent('-0')
    })
  })

  describe('Uncommitted Changes', () => {
    it('should display uncommitted badge for uncommitted changes', () => {
      const data: ExecutionChangesResult = {
        available: true,
        uncommitted: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: null,
          uncommitted: true,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('Uncommitted')).toBeInTheDocument()
    })

    it('should display warning message for uncommitted changes', () => {
      const data: ExecutionChangesResult = {
        available: true,
        uncommitted: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: null,
          uncommitted: true,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(
        screen.getByText(
          /These changes were not committed. They may be lost if the worktree was deleted./
        )
      ).toBeInTheDocument()
    })

    it('should not display uncommitted badge for committed changes', () => {
      const data: ExecutionChangesResult = {
        available: true,
        uncommitted: false,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.queryByText('Uncommitted')).not.toBeInTheDocument()
    })

    it('should not display warning when no files changed', () => {
      const data: ExecutionChangesResult = {
        available: true,
        uncommitted: true,
        captured: {
          files: [],
          summary: {
            totalFiles: 0,
            totalAdditions: 0,
            totalDeletions: 0,
          },
          commitRange: null,
          uncommitted: true,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.queryByText(/These changes were not committed/)).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should display message when no files changed', () => {
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [],
          summary: {
            totalFiles: 0,
            totalAdditions: 0,
            totalDeletions: 0,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('No file changes detected')).toBeInTheDocument()
    })
  })

  describe('Null Data', () => {
    it('should not render anything when data is null and not loading', () => {
      mockUseExecutionChanges.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      const { container } = render(<CodeChangesPanel executionId="exec-123" />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Deleted Resources', () => {
    it('should display "Branch deleted" badge when branch is deleted', () => {
      const data: ExecutionChangesResult = {
        available: true,
        branchName: 'deleted-branch',
        branchExists: false,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('Branch deleted')).toBeInTheDocument()
    })

    it('should display "Worktree deleted" badge when worktree is deleted', () => {
      const data: ExecutionChangesResult = {
        available: true,
        worktreeExists: false,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('Worktree deleted')).toBeInTheDocument()
    })

    it('should display both badges when both branch and worktree are deleted', () => {
      const data: ExecutionChangesResult = {
        available: true,
        branchName: 'deleted-branch',
        branchExists: false,
        worktreeExists: false,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('Branch deleted')).toBeInTheDocument()
      expect(screen.getByText('Worktree deleted')).toBeInTheDocument()
    })

    it('should not display badges when branch and worktree exist', () => {
      const data: ExecutionChangesResult = {
        available: true,
        branchName: 'feature-branch',
        branchExists: true,
        worktreeExists: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.queryByText('Branch deleted')).not.toBeInTheDocument()
      expect(screen.queryByText('Worktree deleted')).not.toBeInTheDocument()
    })

    it('should display additional commits badge when current state exists', () => {
      const data: ExecutionChangesResult = {
        available: true,
        branchName: 'feature-branch',
        branchExists: true,
        additionalCommits: 3,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
        current: {
          files: [
            { path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' },
            { path: 'src/file2.ts', additions: 5, deletions: 0, status: 'A' },
          ],
          summary: {
            totalFiles: 2,
            totalAdditions: 15,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'ghi789' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('+3 commits since completion')).toBeInTheDocument()
    })

    it('should use singular form for 1 additional commit', () => {
      const data: ExecutionChangesResult = {
        available: true,
        branchName: 'feature-branch',
        additionalCommits: 1,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
        current: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'ghi789' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText('+1 commit since completion')).toBeInTheDocument()
    })

    it('should show current state info when current state exists', () => {
      const data: ExecutionChangesResult = {
        available: true,
        branchName: 'feature-branch',
        current: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'ghi789' },
          uncommitted: false,
        },
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      expect(screen.getByText(/Showing current state of branch:/)).toBeInTheDocument()
      expect(screen.getByText('feature-branch')).toBeInTheDocument()
    })
  })

  describe('Auto-refresh Behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should call refresh on interval when autoRefreshInterval is provided', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      render(<CodeChangesPanel executionId="exec-123" autoRefreshInterval={5000} />)

      // Initially not called
      expect(refreshMock).not.toHaveBeenCalled()

      // After 5 seconds, should be called once
      vi.advanceTimersByTime(5000)
      expect(refreshMock).toHaveBeenCalledTimes(1)

      // After another 5 seconds, should be called again
      vi.advanceTimersByTime(5000)
      expect(refreshMock).toHaveBeenCalledTimes(2)
    })

    it('should not set up interval when autoRefreshInterval is not provided', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      // Advance time significantly - should not call refresh
      vi.advanceTimersByTime(60000)
      expect(refreshMock).not.toHaveBeenCalled()
    })

    it('should call refresh when execution status changes from running to completed', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      const { rerender } = render(
        <CodeChangesPanel executionId="exec-123" executionStatus="running" />
      )

      // Initially not called
      expect(refreshMock).not.toHaveBeenCalled()

      // Change status to completed
      rerender(<CodeChangesPanel executionId="exec-123" executionStatus="completed" />)

      // Should call refresh
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })

    it('should call refresh when execution status changes from running to stopped', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      const { rerender } = render(
        <CodeChangesPanel executionId="exec-123" executionStatus="running" />
      )

      expect(refreshMock).not.toHaveBeenCalled()

      // Change status to stopped
      rerender(<CodeChangesPanel executionId="exec-123" executionStatus="stopped" />)

      expect(refreshMock).toHaveBeenCalledTimes(1)
    })

    it('should call refresh when execution status changes from running to failed', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      const { rerender } = render(
        <CodeChangesPanel executionId="exec-123" executionStatus="running" />
      )

      expect(refreshMock).not.toHaveBeenCalled()

      // Change status to failed
      rerender(<CodeChangesPanel executionId="exec-123" executionStatus="failed" />)

      expect(refreshMock).toHaveBeenCalledTimes(1)
    })

    it('should not call refresh when status changes between non-terminal states', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      const { rerender } = render(
        <CodeChangesPanel executionId="exec-123" executionStatus="pending" />
      )

      // Change status to running (non-terminal to non-terminal)
      rerender(<CodeChangesPanel executionId="exec-123" executionStatus="running" />)

      // Should not call refresh
      expect(refreshMock).not.toHaveBeenCalled()
    })

    it('should not call refresh when status changes between terminal states', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      const { rerender } = render(
        <CodeChangesPanel executionId="exec-123" executionStatus="completed" />
      )

      // Change status to stopped (terminal to terminal)
      rerender(<CodeChangesPanel executionId="exec-123" executionStatus="stopped" />)

      // Should not call refresh
      expect(refreshMock).not.toHaveBeenCalled()
    })

    it('should call refresh when clicking the refresh button', async () => {
      // Temporarily use real timers for this user interaction test
      vi.useRealTimers()

      const user = userEvent.setup()
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: false,
        error: null,
        refresh: refreshMock,
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      const refreshButton = screen.getByTitle('Refresh changes')
      expect(refreshMock).not.toHaveBeenCalled()

      await user.click(refreshButton)

      expect(refreshMock).toHaveBeenCalledTimes(1)

      // Restore fake timers
      vi.useFakeTimers()
    })

    it('should disable refresh button while loading', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: true,
        error: null,
        refresh: refreshMock,
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      const refreshButton = screen.getByTitle('Refresh changes')
      expect(refreshButton).toBeDisabled()
    })

    it('should show spinning icon on refresh button while loading', () => {
      const refreshMock = vi.fn()
      const data: ExecutionChangesResult = {
        available: true,
        captured: {
          files: [{ path: 'src/file1.ts', additions: 10, deletions: 5, status: 'M' }],
          summary: {
            totalFiles: 1,
            totalAdditions: 10,
            totalDeletions: 5,
          },
          commitRange: { before: 'abc123', after: 'def456' },
          uncommitted: false,
        },
      }

      mockUseExecutionChanges.mockReturnValue({
        data,
        loading: true,
        error: null,
        refresh: refreshMock,
      })

      render(<CodeChangesPanel executionId="exec-123" />)

      const refreshButton = screen.getByTitle('Refresh changes')
      const icon = refreshButton.querySelector('svg')
      expect(icon).toHaveClass('animate-spin')
    })
  })
})

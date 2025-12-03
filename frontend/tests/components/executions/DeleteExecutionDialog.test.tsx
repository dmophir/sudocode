import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import { DeleteExecutionDialog } from '@/components/executions/DeleteExecutionDialog'

describe('DeleteExecutionDialog', () => {
  beforeEach(() => {
    // Clear localStorage before each test to prevent interference
    localStorage.clear()
  })

  it('should not render when isOpen is false', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(screen.queryByText('Delete Execution')).not.toBeInTheDocument()
  })

  it('should render when isOpen is true', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('Delete Execution')).toBeInTheDocument()
    expect(screen.getByText(/This will permanently delete the execution and all logs and cannot be undone/)).toBeInTheDocument()
  })

  it('should call onConfirm with false, false when Delete button is clicked without checkboxes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    const deleteButton = screen.getByRole('button', { name: /^Delete$/ })
    await user.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledWith(false, false)
  })

  it('should call onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    const cancelButton = screen.getByRole('button', { name: /Cancel/ })
    await user.click(cancelButton)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('should disable buttons when isDeleting is true', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        isDeleting={true}
      />
    )

    expect(screen.getByRole('button', { name: /Deleting\.\.\./ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeDisabled()
  })

  it('should return null when executionId is null', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    const { container } = renderWithProviders(
      <DeleteExecutionDialog
        executionId={null}
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('should show branch deletion checkbox when branch was created by execution', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="worktree/test-branch"
        branchWasCreatedByExecution={true}
      />
    )

    expect(screen.getByText(/Delete created branch/)).toBeInTheDocument()
    expect(screen.getByText('worktree/test-branch')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('should not show branch deletion checkbox when branch was not created by execution', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="main"
        branchWasCreatedByExecution={false}
      />
    )

    expect(screen.queryByText(/Delete created branch/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('should not show branch deletion checkbox for detached HEAD', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="(detached)"
        branchWasCreatedByExecution={true}
      />
    )

    expect(screen.queryByText(/Delete created branch/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('should call onConfirm with true, false when branch checkbox is checked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="worktree/test-branch"
        branchWasCreatedByExecution={true}
      />
    )

    // Check the branch checkbox
    const checkbox = screen.getByRole('checkbox', { name: /Delete created branch/ })
    await user.click(checkbox)

    // Click delete
    const deleteButton = screen.getByRole('button', { name: /^Delete$/ })
    await user.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledWith(true, false)
  })

  it('should call onConfirm with false, true when worktree checkbox is checked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        hasWorktree={true}
        worktreePath="/path/to/worktree"
      />
    )

    // Check the worktree checkbox
    const checkbox = screen.getByRole('checkbox', { name: /Delete worktree/ })
    await user.click(checkbox)

    // Click delete
    const deleteButton = screen.getByRole('button', { name: /^Delete$/ })
    await user.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledWith(false, true)
  })

  it('should call onConfirm with true, true when both checkboxes are checked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="worktree/test-branch"
        branchWasCreatedByExecution={true}
        hasWorktree={true}
        worktreePath="/path/to/worktree"
      />
    )

    // Check both checkboxes
    const branchCheckbox = screen.getByRole('checkbox', { name: /Delete created branch/ })
    const worktreeCheckbox = screen.getByRole('checkbox', { name: /Delete worktree/ })
    await user.click(branchCheckbox)
    await user.click(worktreeCheckbox)

    // Click delete
    const deleteButton = screen.getByRole('button', { name: /^Delete$/ })
    await user.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledWith(true, true)
  })

  it('should disable checkboxes when isDeleting is true', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="worktree/test-branch"
        branchWasCreatedByExecution={true}
        hasWorktree={true}
        worktreePath="/path/to/worktree"
        isDeleting={true}
      />
    )

    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeDisabled()
    })
  })

  it('should show worktree checkbox when hasWorktree is true', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        hasWorktree={true}
        worktreePath="/path/to/worktree"
      />
    )

    expect(screen.getByText(/Delete worktree/)).toBeInTheDocument()
    expect(screen.getByText('/path/to/worktree')).toBeInTheDocument()
  })

  it('should not show worktree checkbox when hasWorktree is false', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        hasWorktree={false}
      />
    )

    expect(screen.queryByText(/Delete worktree/)).not.toBeInTheDocument()
  })


  it('should call onClose when pressing Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteExecutionDialog
        executionId="exec-1"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  describe('LocalStorage Persistence', () => {
    it('should load saved deleteBranch preference from localStorage', () => {
      localStorage.setItem('deleteExecution.deleteBranch', 'true')
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      renderWithProviders(
        <DeleteExecutionDialog
          executionId="exec-1"
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          branchName="worktree/test-branch"
          branchWasCreatedByExecution={true}
        />
      )

      const checkbox = screen.getByRole('checkbox', { name: /Delete created branch/ })
      expect(checkbox).toBeChecked()
    })

    it('should load saved deleteWorktree preference from localStorage', () => {
      localStorage.setItem('deleteExecution.deleteWorktree', 'true')
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      renderWithProviders(
        <DeleteExecutionDialog
          executionId="exec-1"
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          hasWorktree={true}
          worktreePath="/path/to/worktree"
        />
      )

      const checkbox = screen.getByRole('checkbox', { name: /Delete worktree/ })
      expect(checkbox).toBeChecked()
    })

    it('should save deleteBranch preference to localStorage when changed', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      renderWithProviders(
        <DeleteExecutionDialog
          executionId="exec-1"
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          branchName="worktree/test-branch"
          branchWasCreatedByExecution={true}
        />
      )

      const checkbox = screen.getByRole('checkbox', { name: /Delete created branch/ })
      await user.click(checkbox)

      expect(localStorage.getItem('deleteExecution.deleteBranch')).toBe('true')

      await user.click(checkbox)
      expect(localStorage.getItem('deleteExecution.deleteBranch')).toBe('false')
    })

    it('should save deleteWorktree preference to localStorage when changed', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      renderWithProviders(
        <DeleteExecutionDialog
          executionId="exec-1"
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          hasWorktree={true}
          worktreePath="/path/to/worktree"
        />
      )

      const checkbox = screen.getByRole('checkbox', { name: /Delete worktree/ })
      await user.click(checkbox)

      expect(localStorage.getItem('deleteExecution.deleteWorktree')).toBe('true')

      await user.click(checkbox)
      expect(localStorage.getItem('deleteExecution.deleteWorktree')).toBe('false')
    })
  })
})

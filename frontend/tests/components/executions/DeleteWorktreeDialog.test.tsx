import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import { DeleteWorktreeDialog } from '@/components/executions/DeleteWorktreeDialog'

describe('DeleteWorktreeDialog', () => {
  beforeEach(() => {
    // Clear localStorage before each test to prevent interference
    localStorage.clear()
  })

  it('should not render when isOpen is false', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
        isOpen={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(screen.queryByText('Delete Worktree')).not.toBeInTheDocument()
  })

  it('should render when isOpen is true', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('Delete Worktree')).toBeInTheDocument()
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()
    expect(screen.getByText('/path/to/worktree')).toBeInTheDocument()
  })

  it('should call onConfirm with false when Delete button is clicked without branch checkbox', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    )

    const deleteButton = screen.getByRole('button', { name: /^Delete$/ })
    await user.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('should call onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
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
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        isDeleting={true}
      />
    )

    expect(screen.getByRole('button', { name: /Deleting\.\.\./ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeDisabled()
  })

  it('should return null when worktreePath is null', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    const { container } = renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath={null}
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
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
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
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
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
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
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

  it('should call onConfirm with true when checkbox is checked and Delete is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="worktree/test-branch"
        branchWasCreatedByExecution={true}
      />
    )

    // Check the checkbox
    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    // Click delete
    const deleteButton = screen.getByRole('button', { name: /^Delete$/ })
    await user.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('should disable checkbox when isDeleting is true', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        branchName="worktree/test-branch"
        branchWasCreatedByExecution={true}
        isDeleting={true}
      />
    )

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeDisabled()
  })

  it('should call onClose when pressing Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    renderWithProviders(
      <DeleteWorktreeDialog
        worktreePath="/path/to/worktree"
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
      localStorage.setItem('deleteWorktree.deleteBranch', 'true')
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      renderWithProviders(
        <DeleteWorktreeDialog
          worktreePath="/path/to/worktree"
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          branchName="worktree/test-branch"
          branchWasCreatedByExecution={true}
        />
      )

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeChecked()
    })

    it('should save deleteBranch preference to localStorage when changed', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      renderWithProviders(
        <DeleteWorktreeDialog
          worktreePath="/path/to/worktree"
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          branchName="worktree/test-branch"
          branchWasCreatedByExecution={true}
        />
      )

      const checkbox = screen.getByRole('checkbox')
      await user.click(checkbox)

      expect(localStorage.getItem('deleteWorktree.deleteBranch')).toBe('true')

      await user.click(checkbox)
      expect(localStorage.getItem('deleteWorktree.deleteBranch')).toBe('false')
    })
  })
})

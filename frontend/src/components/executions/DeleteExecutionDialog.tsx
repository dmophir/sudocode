import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface DeleteExecutionDialogProps {
  executionId: string | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (deleteBranch: boolean, deleteWorktree: boolean) => void
  isDeleting?: boolean
  branchName?: string
  branchWasCreatedByExecution?: boolean
  hasWorktree?: boolean
  worktreePath?: string
}

const STORAGE_KEY_DELETE_BRANCH = 'deleteExecution.deleteBranch'
const STORAGE_KEY_DELETE_WORKTREE = 'deleteExecution.deleteWorktree'

export function DeleteExecutionDialog({
  executionId,
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  branchName,
  branchWasCreatedByExecution = false,
  hasWorktree = false,
  worktreePath,
}: DeleteExecutionDialogProps) {
  const [deleteBranch, setDeleteBranch] = useState(false)
  const [deleteWorktree, setDeleteWorktree] = useState(false)

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    const savedDeleteBranch = localStorage.getItem(STORAGE_KEY_DELETE_BRANCH)
    const savedDeleteWorktree = localStorage.getItem(STORAGE_KEY_DELETE_WORKTREE)

    if (savedDeleteBranch !== null) {
      setDeleteBranch(savedDeleteBranch === 'true')
    }
    if (savedDeleteWorktree !== null) {
      setDeleteWorktree(savedDeleteWorktree === 'true')
    }
  }, [])

  // Save preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DELETE_BRANCH, String(deleteBranch))
  }, [deleteBranch])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DELETE_WORKTREE, String(deleteWorktree))
  }, [deleteWorktree])

  if (!executionId) return null

  const showBranchOption = branchWasCreatedByExecution && branchName && branchName !== '(detached)'

  const handleConfirm = () => {
    onConfirm(deleteBranch, deleteWorktree)
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent onOverlayClick={onClose}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Execution</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this execution?
            <br />
            <br />
            This will permanently delete the execution and all logs and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 px-6 pb-2">
          {hasWorktree && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-worktree"
                checked={deleteWorktree}
                onCheckedChange={(checked) => setDeleteWorktree(checked === true)}
                disabled={isDeleting}
              />
              <Label
                htmlFor="delete-worktree"
                className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Delete worktree{' '}
                {worktreePath && <code className="ml-1 text-xs">{worktreePath}</code>}
              </Label>
            </div>
          )}
          {showBranchOption && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-branch"
                checked={deleteBranch}
                onCheckedChange={(checked) => setDeleteBranch(checked === true)}
                disabled={isDeleting}
              />
              <Label
                htmlFor="delete-branch"
                className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Delete created branch <code className="text-xs">{branchName}</code>
              </Label>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

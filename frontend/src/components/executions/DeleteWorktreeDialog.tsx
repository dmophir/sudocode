import { useState } from 'react'
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

interface DeleteWorktreeDialogProps {
  worktreePath: string | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (deleteBranch: boolean) => void
  isDeleting?: boolean
  branchName?: string
  branchWasCreatedByExecution?: boolean
}

export function DeleteWorktreeDialog({
  worktreePath,
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  branchName,
  branchWasCreatedByExecution = false,
}: DeleteWorktreeDialogProps) {
  const [deleteBranch, setDeleteBranch] = useState(false)

  if (!worktreePath) return null

  const showBranchOption = branchWasCreatedByExecution && branchName && branchName !== '(detached)'

  const handleConfirm = () => {
    onConfirm(deleteBranch)
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent onOverlayClick={onClose}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Worktree</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the worktree? This action cannot be undone.
            <br />
            <br />
            <strong>Worktree path:</strong>
            <br />
            <code className="text-xs">{worktreePath}</code>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showBranchOption && (
          <div className="flex items-center space-x-2 px-6 pb-2">
            <Checkbox
              id="delete-branch-worktree"
              checked={deleteBranch}
              onCheckedChange={(checked) => setDeleteBranch(checked === true)}
              disabled={isDeleting}
            />
            <Label
              htmlFor="delete-branch-worktree"
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Delete created branch <code className="text-xs">{branchName}</code>
            </Label>
          </div>
        )}
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

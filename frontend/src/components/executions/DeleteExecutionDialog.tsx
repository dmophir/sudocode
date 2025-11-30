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

interface DeleteExecutionDialogProps {
  executionId: string | null
  executionCount?: number
  isOpen: boolean
  onClose: () => void
  onConfirm: (deleteBranch: boolean) => void
  isDeleting?: boolean
  branchName?: string
  branchWasCreatedByExecution?: boolean
}

export function DeleteExecutionDialog({
  executionId,
  executionCount = 1,
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  branchName,
  branchWasCreatedByExecution = false,
}: DeleteExecutionDialogProps) {
  const [deleteBranch, setDeleteBranch] = useState(false)

  if (!executionId) return null

  const isChain = executionCount > 1
  const showBranchOption = branchWasCreatedByExecution && branchName && branchName !== '(detached)'

  const handleConfirm = () => {
    onConfirm(deleteBranch)
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent onOverlayClick={onClose}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Execution</AlertDialogTitle>
          <AlertDialogDescription>
            {isChain ? (
              <>
                <br />
                This will permanently delete:
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>All execution logs and history</li>
                  <li>The worktree (if it exists)</li>
                </ul>
                <br />
              </>
            ) : (
              <>
                Are you sure you want to delete this execution?
                <br />
                <br />
                This will permanently delete the execution, its worktree (if it exists), and all
                logs.
                <br />
                <br />
                This action cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showBranchOption && (
          <div className="flex items-center space-x-2 px-6 pb-2">
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

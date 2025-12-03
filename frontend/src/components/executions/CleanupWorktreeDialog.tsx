import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, FolderOpen, GitBranch } from 'lucide-react'
import type { Execution } from '@/types/execution'

export interface CleanupWorktreeDialogProps {
  execution: Execution
  isOpen: boolean
  onClose: () => void
  onConfirm: (deleteBranch: boolean) => Promise<void>
  isCleaning?: boolean
}

export function CleanupWorktreeDialog({
  execution,
  isOpen,
  onClose,
  onConfirm,
  isCleaning = false,
}: CleanupWorktreeDialogProps) {
  const [deleteBranch, setDeleteBranch] = useState(true)

  const handleConfirm = async () => {
    await onConfirm(deleteBranch)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isCleaning) {
          onClose()
        }
      }}
    >
      <DialogContent
        className="sm:max-w-[500px]"
        onPointerDownOutside={(e) => {
          if (isCleaning) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isCleaning) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Cleanup Worktree</DialogTitle>
          <DialogDescription>Permanently delete the worktree directory</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Worktree info */}
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <FolderOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Worktree Path</p>
                <p className="break-all font-mono text-sm">{execution.worktree_path}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <GitBranch className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Worktree branch{deleteBranch ? ' (to be deleted)' : ''}
                </p>
                <p className="break-all font-mono text-sm">{execution.branch_name}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <GitBranch className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Base Branch (unchanged)
                </p>
                <p className="break-all font-mono text-sm">{execution.target_branch}</p>
              </div>
            </div>
          </div>

          {/* Delete branch checkbox */}
          <div className="flex items-center space-x-3 rounded-md border border-border p-4">
            <Checkbox
              id="delete-branch"
              checked={deleteBranch}
              onCheckedChange={(checked) => setDeleteBranch(checked === true)}
              disabled={isCleaning}
            />
            <div className="flex-1">
              <Label
                htmlFor="delete-branch"
                className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Also delete temp branch{' '}
                <span className="font-mono text-xs">({execution.branch_name})</span>
              </Label>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {deleteBranch ? (
                  <>The branch will be deleted. Make sure all important changes have been synced.</>
                ) : (
                  <>The branch will be preserved for future reference or manual cleanup.</>
                )}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCleaning}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isCleaning}
            className="min-w-[100px]"
          >
            {isCleaning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>Delete</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, GitFork } from 'lucide-react'

interface ForkSessionDialogProps {
  open: boolean
  onSubmit: (prompt: string) => Promise<void>
  onCancel: () => void
  sessionId?: string | null
}

export function ForkSessionDialog({
  open,
  onSubmit,
  onCancel,
  sessionId,
}: ForkSessionDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (prompt.trim().length === 0) {
      setError('Prompt cannot be empty')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSubmit(prompt.trim())
      // Reset state on success
      setPrompt('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fork session')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (!isSubmitting) {
      setPrompt('')
      setError(null)
      onCancel()
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      handleCancel()
    }
  }

  const canSubmit = prompt.trim().length > 0 && !isSubmitting

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <GitFork className="h-5 w-5" />
            <DialogTitle>Fork Session to Try Alternatives</DialogTitle>
          </div>
          <DialogDescription>
            Branch from this execution to explore a different approach. The original session and code
            remain unchanged, allowing you to safely experiment with alternatives.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Session ID Display */}
          {sessionId && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground">Forking from Session</p>
                  <p className="mt-1 font-mono text-xs break-all">{sessionId}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
            <div className="flex items-start gap-2">
              <GitFork className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-medium">What is forking?</p>
                <p className="mt-1 text-blue-800 dark:text-blue-200">
                  Forking creates a new branch from the current state, letting you try alternative
                  solutions. Both versions remain accessible so you can compare approaches or switch
                  back if needed.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
          )}

          {/* Prompt Textarea */}
          <div className="space-y-2">
            <Label htmlFor="prompt">What alternative would you like to try?</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              placeholder={
                'Describe a different approach to explore.\n\nExamples:\n• "Try using async/await instead of promises"\n• "Refactor this to use a state machine pattern"\n• "Implement this with a different data structure"'
              }
              className="resize-none"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              The fork will start with full context from the original session but explore a different
              solution path.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              'Forking...'
            ) : (
              <>
                <GitFork className="mr-2 h-4 w-4" />
                Fork Session
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

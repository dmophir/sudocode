/**
 * Workflow hooks using React Query for data fetching and mutations
 */

import { useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Workflow, CreateWorkflowOptions } from '@/types/workflow'
import type { Issue, WebSocketMessage } from '@/types/api'
import { workflowsApi, ListWorkflowsParams, issuesApi } from '@/lib/api'
import { useWebSocketContext } from '@/contexts/WebSocketContext'
import { useProject } from '@/hooks/useProject'

// =============================================================================
// Query Keys
// =============================================================================

export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (params?: ListWorkflowsParams) => [...workflowKeys.lists(), params] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  events: (id: string) => [...workflowKeys.detail(id), 'events'] as const,
}

// =============================================================================
// useWorkflows - List all workflows with real-time updates
// =============================================================================

export function useWorkflows(params?: ListWorkflowsParams) {
  const queryClient = useQueryClient()
  const { currentProjectId } = useProject()
  const { connected, subscribe, addMessageHandler, removeMessageHandler } =
    useWebSocketContext()

  // Include projectId in query key for proper cache separation
  const queryKey = currentProjectId
    ? [...workflowKeys.list(params), currentProjectId]
    : workflowKeys.list(params)

  const query = useQuery({
    queryKey,
    queryFn: () => workflowsApi.list(params),
    staleTime: 30_000, // 30 seconds - WebSocket handles real-time updates
    enabled: !!currentProjectId,
  })

  // Message handler for WebSocket updates
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      // Handle workflow-specific events
      if (
        message.type === 'workflow_created' ||
        message.type === 'workflow_updated' ||
        message.type === 'workflow_deleted' ||
        message.type === 'workflow_started' ||
        message.type === 'workflow_paused' ||
        message.type === 'workflow_resumed' ||
        message.type === 'workflow_completed' ||
        message.type === 'workflow_failed' ||
        message.type === 'workflow_cancelled' ||
        message.type === 'workflow_step_started' ||
        message.type === 'workflow_step_completed' ||
        message.type === 'workflow_step_failed' ||
        message.type === 'workflow_step_skipped'
      ) {
        // Invalidate all workflow queries
        queryClient.invalidateQueries({ queryKey: workflowKeys.all })
      }
    },
    [queryClient]
  )

  // Register message handler and subscribe to workflow updates
  useEffect(() => {
    const handlerId = 'useWorkflows'
    addMessageHandler(handlerId, handleMessage)

    if (connected) {
      subscribe('workflow')
    }

    return () => {
      removeMessageHandler(handlerId)
    }
  }, [connected, subscribe, addMessageHandler, removeMessageHandler, handleMessage])

  return query
}

// =============================================================================
// useWorkflow - Get single workflow by ID with enriched issue data
// =============================================================================

export function useWorkflow(id: string | undefined) {
  // Fetch the workflow
  const workflowQuery = useQuery({
    queryKey: workflowKeys.detail(id!),
    queryFn: () => workflowsApi.get(id!),
    enabled: !!id,
  })

  // Get all issues (we'll filter to the ones we need)
  // Using the cached issues list to avoid N+1 queries
  const issuesQuery = useQuery({
    queryKey: ['issues'],
    queryFn: () => issuesApi.getAll(),
    enabled: !!workflowQuery.data,
    staleTime: 60_000, // 1 minute - issues don't change as frequently
  })

  // Build issues map for the workflow steps
  const issues = useMemo(() => {
    if (!workflowQuery.data || !issuesQuery.data) return undefined

    const issueIds = new Set(workflowQuery.data.steps.map((s) => s.issueId))
    const issuesMap: Record<string, Issue> = {}

    for (const issue of issuesQuery.data) {
      if (issueIds.has(issue.id)) {
        issuesMap[issue.id] = issue
      }
    }

    return issuesMap
  }, [workflowQuery.data, issuesQuery.data])

  return {
    workflow: workflowQuery.data,
    issues,
    isLoading: workflowQuery.isLoading || (workflowQuery.data && issuesQuery.isLoading),
    error: workflowQuery.error || issuesQuery.error,
    refetch: () => {
      workflowQuery.refetch()
      issuesQuery.refetch()
    },
  }
}

// =============================================================================
// useWorkflowMutations - Workflow lifecycle actions
// =============================================================================

export function useWorkflowMutations() {
  const queryClient = useQueryClient()

  const invalidateWorkflows = () => {
    queryClient.invalidateQueries({ queryKey: workflowKeys.all })
  }

  const create = useMutation({
    mutationFn: (options: CreateWorkflowOptions) => workflowsApi.create(options),
    onSuccess: (workflow) => {
      invalidateWorkflows()
      toast.success(`Workflow "${workflow.title}" created`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to create workflow: ${error.message}`)
    },
  })

  const start = useMutation({
    mutationFn: (id: string) => workflowsApi.start(id),
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) })
      invalidateWorkflows()
      toast.success('Workflow started')
    },
    onError: (error: Error) => {
      toast.error(`Failed to start workflow: ${error.message}`)
    },
  })

  const pause = useMutation({
    mutationFn: (id: string) => workflowsApi.pause(id),
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) })
      invalidateWorkflows()
      toast.success('Workflow paused')
    },
    onError: (error: Error) => {
      toast.error(`Failed to pause workflow: ${error.message}`)
    },
  })

  const resume = useMutation({
    mutationFn: (id: string) => workflowsApi.resume(id),
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) })
      invalidateWorkflows()
      toast.success('Workflow resumed')
    },
    onError: (error: Error) => {
      toast.error(`Failed to resume workflow: ${error.message}`)
    },
  })

  const cancel = useMutation({
    mutationFn: (id: string) => workflowsApi.cancel(id),
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) })
      invalidateWorkflows()
      toast.success('Workflow cancelled')
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel workflow: ${error.message}`)
    },
  })

  const deleteWorkflow = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: () => {
      invalidateWorkflows()
      toast.success('Workflow deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete workflow: ${error.message}`)
    },
  })

  return {
    create: create.mutateAsync,
    start: start.mutateAsync,
    pause: pause.mutateAsync,
    resume: resume.mutateAsync,
    cancel: cancel.mutateAsync,
    delete: deleteWorkflow.mutateAsync,
    isCreating: create.isPending,
    isStarting: start.isPending,
    isPausing: pause.isPending,
    isResuming: resume.isPending,
    isCancelling: cancel.isPending,
    isDeleting: deleteWorkflow.isPending,
  }
}

// =============================================================================
// useWorkflowStepActions - Step-level actions
// =============================================================================

export function useWorkflowStepActions(workflowId: string) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) })
    queryClient.invalidateQueries({ queryKey: workflowKeys.all })
  }

  const retry = useMutation({
    mutationFn: (stepId: string) => workflowsApi.retryStep(workflowId, stepId),
    onSuccess: () => {
      invalidate()
      toast.success('Step retry initiated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to retry step: ${error.message}`)
    },
  })

  const skip = useMutation({
    mutationFn: ({ stepId, reason }: { stepId: string; reason?: string }) =>
      workflowsApi.skipStep(workflowId, stepId, reason),
    onSuccess: () => {
      invalidate()
      toast.success('Step skipped')
    },
    onError: (error: Error) => {
      toast.error(`Failed to skip step: ${error.message}`)
    },
  })

  return {
    retry: (stepId: string) => retry.mutateAsync(stepId),
    skip: (stepId: string, reason?: string) => skip.mutateAsync({ stepId, reason }),
    isRetrying: retry.isPending,
    isSkipping: skip.isPending,
  }
}

// =============================================================================
// useWorkflowProgress - Calculate workflow progress stats
// =============================================================================

interface WorkflowProgress {
  total: number
  completed: number
  running: number
  failed: number
  pending: number
  blocked: number
  percentage: number
}

export function useWorkflowProgress(workflow: Workflow | undefined): WorkflowProgress {
  return useMemo(() => {
    if (!workflow) {
      return {
        total: 0,
        completed: 0,
        running: 0,
        failed: 0,
        pending: 0,
        blocked: 0,
        percentage: 0,
      }
    }

    const steps = workflow.steps
    const total = steps.length
    const completed = steps.filter((s) => s.status === 'completed').length
    const running = steps.filter((s) => s.status === 'running').length
    const failed = steps.filter((s) => s.status === 'failed').length
    const pending = steps.filter((s) => s.status === 'pending' || s.status === 'ready').length
    const blocked = steps.filter((s) => s.status === 'blocked').length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return {
      total,
      completed,
      running,
      failed,
      pending,
      blocked,
      percentage,
    }
  }, [workflow])
}

// =============================================================================
// useWorkflowEvents - Get workflow event history
// =============================================================================

export function useWorkflowEvents(workflowId: string | undefined) {
  return useQuery({
    queryKey: workflowKeys.events(workflowId!),
    queryFn: () => workflowsApi.getEvents(workflowId!),
    enabled: !!workflowId,
    staleTime: 10_000, // 10 seconds - events update frequently
  })
}

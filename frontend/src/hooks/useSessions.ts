import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionsApi } from '@/lib/api'
import type { Session } from '@/types/api'

/**
 * Hook for managing sessions with React Query
 */
export function useSessions(options?: {
  agent_type?: string
  archived?: boolean
  limit?: number
  offset?: number
}) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['sessions', options],
    queryFn: () => sessionsApi.getAll(options),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Session> }) =>
      sessionsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['sessions'] })
      const previousSessions = queryClient.getQueryData<Session[]>(['sessions'])
      queryClient.setQueryData<Session[]>(['sessions'], (old) =>
        old?.map((session) => (session.id === id ? { ...session, ...data } : session))
      )
      return { previousSessions }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(['sessions'], context.previousSessions)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: sessionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const archiveSession = (id: string) => updateMutation.mutate({ id, data: { archived: true } })
  const unarchiveSession = (id: string) =>
    updateMutation.mutate({ id, data: { archived: false } })

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    updateSession: updateMutation.mutate,
    updateSessionAsync: updateMutation.mutateAsync,
    createSession: createMutation.mutate,
    createSessionAsync: createMutation.mutateAsync,
    deleteSession: deleteMutation.mutate,
    archiveSession,
    unarchiveSession,
    isUpdating: updateMutation.isPending,
    isCreating: createMutation.isPending,
  }
}

/**
 * Hook for fetching a single session
 */
export function useSession(id: string) {
  const query = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => sessionsApi.getById(id),
    enabled: !!id,
  })

  return {
    session: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

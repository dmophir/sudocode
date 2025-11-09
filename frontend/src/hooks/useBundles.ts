import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bundlesApi } from '@/lib/api'
import type { ContextBundle } from '@/types/api'

/**
 * Hook for managing context bundles with React Query
 */
export function useBundles(options?: { archived?: boolean; limit?: number; offset?: number }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['bundles', options],
    queryFn: () => bundlesApi.getAll(options),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ContextBundle> }) =>
      bundlesApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['bundles'] })
      const previousBundles = queryClient.getQueryData<ContextBundle[]>(['bundles'])
      queryClient.setQueryData<ContextBundle[]>(['bundles'], (old) =>
        old?.map((bundle) => (bundle.id === id ? { ...bundle, ...data } : bundle))
      )
      return { previousBundles }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousBundles) {
        queryClient.setQueryData(['bundles'], context.previousBundles)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bundles'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: bundlesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundles'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: bundlesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundles'] })
    },
  })

  const archiveBundle = (id: string) => updateMutation.mutate({ id, data: { archived: true } })
  const unarchiveBundle = (id: string) => updateMutation.mutate({ id, data: { archived: false } })

  return {
    bundles: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    updateBundle: updateMutation.mutate,
    updateBundleAsync: updateMutation.mutateAsync,
    createBundle: createMutation.mutate,
    createBundleAsync: createMutation.mutateAsync,
    deleteBundle: deleteMutation.mutate,
    archiveBundle,
    unarchiveBundle,
    isUpdating: updateMutation.isPending,
    isCreating: createMutation.isPending,
  }
}

/**
 * Hook for fetching a single bundle
 */
export function useBundle(id: string) {
  const query = useQuery({
    queryKey: ['bundles', id],
    queryFn: () => bundlesApi.getById(id),
    enabled: !!id,
  })

  return {
    bundle: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Hook for fetching bundle items
 */
export function useBundleItems(bundleId: string) {
  const query = useQuery({
    queryKey: ['bundles', bundleId, 'items'],
    queryFn: () => bundlesApi.getItems(bundleId),
    enabled: !!bundleId,
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

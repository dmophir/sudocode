import { useNavigate } from 'react-router-dom'
import { BundleCard } from './BundleCard'
import type { ContextBundle } from '@/types/api'

interface BundleListProps {
  bundles: ContextBundle[]
  bundleItemCounts?: Map<string, number>
  loading?: boolean
  emptyMessage?: string
}

export function BundleList({
  bundles,
  bundleItemCounts,
  loading = false,
  emptyMessage = 'No bundles found',
}: BundleListProps) {
  const navigate = useNavigate()

  const handleBundleClick = (bundle: ContextBundle) => {
    navigate(`/bundles/${bundle.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading bundles...</p>
        </div>
      </div>
    )
  }

  if (!bundles || bundles.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">{emptyMessage}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a bundle to group related sessions, specs, and issues
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {bundles.map((bundle) => (
        <BundleCard
          key={bundle.id}
          bundle={bundle}
          itemCount={bundleItemCounts?.get(bundle.id)}
          onClick={handleBundleClick}
        />
      ))}
    </div>
  )
}

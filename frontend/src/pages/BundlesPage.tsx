import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBundles } from '@/hooks/useBundles'
import { BundleList } from '@/components/bundles/BundleList'
import { BundleEditor } from '@/components/bundles/BundleEditor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Plus } from 'lucide-react'

type SortOption = 'newest' | 'last-updated'

const SORT_STORAGE_KEY = 'sudocode:bundles:sortOption'

export default function BundlesPage() {
  const navigate = useNavigate()
  const { bundles, isLoading, createBundleAsync, isCreating } = useBundles({ archived: false })
  const [filterText, setFilterText] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const [sortOption, setSortOption] = useState<SortOption>(() => {
    try {
      const stored = localStorage.getItem(SORT_STORAGE_KEY)
      if (stored && ['newest', 'last-updated'].includes(stored)) {
        return stored as SortOption
      }
    } catch (error) {
      console.error('Failed to load sort preference from localStorage:', error)
    }
    return 'newest'
  })

  const handleSortChange = (value: string) => {
    const newSortOption = value as SortOption
    setSortOption(newSortOption)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, newSortOption)
    } catch (error) {
      console.error('Failed to save sort preference to localStorage:', error)
    }
  }

  const handleCreateBundle = async (data: { name: string; description?: string }) => {
    try {
      const bundle = await createBundleAsync(data)
      setShowCreateDialog(false)
      navigate(`/bundles/${bundle.id}`)
    } catch (error) {
      console.error('Failed to create bundle:', error)
      alert('Failed to create bundle')
    }
  }

  // Filter and sort bundles
  const filteredAndSortedBundles = useMemo(() => {
    let filtered = bundles

    // Filter by search text
    if (filterText) {
      const searchText = filterText.toLowerCase()
      filtered = filtered.filter(
        (bundle) =>
          bundle.name.toLowerCase().includes(searchText) ||
          (bundle.description && bundle.description.toLowerCase().includes(searchText))
      )
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'last-updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        default:
          return 0
      }
    })

    return sorted
  }, [bundles, filterText, sortOption])

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Context Bundles</h1>
          <Badge variant="secondary">{bundles.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter bundles..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-9 w-64 pl-8"
            />
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            variant="default"
            size="sm"
            className="text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Bundle
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden px-8 py-4">
        <div className="mb-4 flex justify-end">
          <Select value={sortOption} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="last-updated">Last Updated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-auto">
          <BundleList bundles={filteredAndSortedBundles} loading={isLoading} />
        </div>
      </div>

      {/* Create Bundle Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Bundle</DialogTitle>
          </DialogHeader>
          <BundleEditor
            bundle={null}
            onSave={handleCreateBundle}
            onCancel={() => setShowCreateDialog(false)}
            isLoading={isCreating}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

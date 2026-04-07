import { useNavigate } from 'react-router-dom'
import { useSpecs } from '@/hooks/useSpecs'
import { useProjectRoutes } from '@/hooks/useProjectRoutes'
import { SpecList } from '@/components/specs/SpecList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

type SortOption = 'priority' | 'newest' | 'last-updated'

const SORT_STORAGE_KEY = 'sudocode:archivedSpecs:sortOption'

export default function ArchivedSpecsPage() {
  const { specs, isLoading } = useSpecs(true)
  const navigate = useNavigate()
  const { paths } = useProjectRoutes()
  const [filterText, setFilterText] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    try {
      const stored = localStorage.getItem(SORT_STORAGE_KEY)
      if (stored && ['priority', 'newest', 'last-updated'].includes(stored)) {
        return stored as SortOption
      }
    } catch (error) {
      console.error('Failed to load sort preference from localStorage:', error)
    }
    return 'priority'
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

  // Filter and sort specs
  const filteredAndSortedSpecs = useMemo(() => {
    const filtered = filterText
      ? specs.filter((spec) => {
          const searchText = filterText.toLowerCase()
          return (
            spec.id.toLowerCase().includes(searchText) ||
            spec.title.toLowerCase().includes(searchText) ||
            (spec.content && spec.content.toLowerCase().includes(searchText))
          )
        })
      : specs

    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'priority':
          if (a.priority !== b.priority) {
            return a.priority - b.priority
          }
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

        case 'last-updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()

        default:
          return 0
      }
    })

    return sorted
  }, [specs, filterText, sortOption])

  return (
    <div className="flex-1 p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(paths.specs())}
              className="h-8 w-8 p-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold">Archived Specs</h1>
          </div>
          <p className="text-muted-foreground ml-10">
            {isLoading ? 'Loading...' : `${specs.length} archived spec${specs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter specs..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-9 w-64 pl-8"
            />
          </div>
          <Select value={sortOption} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="last-updated">Updated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <SpecList specs={filteredAndSortedSpecs} loading={isLoading} />
    </div>
  )
}

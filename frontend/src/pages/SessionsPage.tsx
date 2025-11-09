import { useState, useMemo } from 'react'
import { useSessions } from '@/hooks/useSessions'
import { SessionList } from '@/components/sessions/SessionList'
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
import { Search, Archive } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type SortOption = 'newest' | 'last-updated'
type AgentTypeFilter = 'all' | 'claude-code' | 'codex'

const SORT_STORAGE_KEY = 'sudocode:sessions:sortOption'
const AGENT_FILTER_STORAGE_KEY = 'sudocode:sessions:agentFilter'

export default function SessionsPage() {
  const navigate = useNavigate()
  const { sessions, isLoading } = useSessions({ archived: false })
  const [filterText, setFilterText] = useState('')

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

  const [agentTypeFilter, setAgentTypeFilter] = useState<AgentTypeFilter>(() => {
    try {
      const stored = localStorage.getItem(AGENT_FILTER_STORAGE_KEY)
      if (stored && ['all', 'claude-code', 'codex'].includes(stored)) {
        return stored as AgentTypeFilter
      }
    } catch (error) {
      console.error('Failed to load agent filter preference from localStorage:', error)
    }
    return 'all'
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

  const handleAgentFilterChange = (value: string) => {
    const newFilter = value as AgentTypeFilter
    setAgentTypeFilter(newFilter)
    try {
      localStorage.setItem(AGENT_FILTER_STORAGE_KEY, newFilter)
    } catch (error) {
      console.error('Failed to save agent filter preference to localStorage:', error)
    }
  }

  // Filter and sort sessions
  const filteredAndSortedSessions = useMemo(() => {
    // First filter by agent type
    let filtered = sessions
    if (agentTypeFilter !== 'all') {
      filtered = filtered.filter((session) => session.agent_type === agentTypeFilter)
    }

    // Then filter by search text
    if (filterText) {
      const searchText = filterText.toLowerCase()
      filtered = filtered.filter(
        (session) =>
          session.title.toLowerCase().includes(searchText) ||
          (session.description && session.description.toLowerCase().includes(searchText)) ||
          session.session_id.toLowerCase().includes(searchText)
      )
    }

    // Then sort
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
  }, [sessions, filterText, sortOption, agentTypeFilter])

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Sessions</h1>
          <Badge variant="secondary">{sessions.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter sessions..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-9 w-64 pl-8"
            />
          </div>
          <Select value={agentTypeFilter} onValueChange={handleAgentFilterChange}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              <SelectItem value="claude-code">Claude Code</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
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
          <SessionList sessions={filteredAndSortedSessions} loading={isLoading} />
        </div>
      </div>
    </div>
  )
}

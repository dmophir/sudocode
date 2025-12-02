import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExecutionsSidebar } from '@/components/executions/ExecutionsSidebar'
import type { Execution, ExecutionStatus } from '@/types/execution'

// Mock WebSocket context
const mockSubscribe = vi.fn()
const mockUnsubscribe = vi.fn()
const mockAddMessageHandler = vi.fn()
const mockRemoveMessageHandler = vi.fn()

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({
    connected: true,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    addMessageHandler: mockAddMessageHandler,
    removeMessageHandler: mockRemoveMessageHandler,
  }),
}))

// Sample executions for testing
const createMockExecution = (overrides: Partial<Execution> = {}): Execution => ({
  id: 'exec-123',
  issue_id: 'i-abc',
  issue_uuid: 'uuid-abc',
  mode: 'worktree',
  prompt: 'Test prompt',
  config: null,
  agent_type: 'claude',
  session_id: 'session-123',
  workflow_execution_id: 'workflow-123',
  target_branch: 'main',
  branch_name: 'sudocode/exec-123',
  before_commit: 'commit-before',
  after_commit: null,
  worktree_path: '/path/to/worktree',
  status: 'running',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  completed_at: null,
  cancelled_at: null,
  exit_code: null,
  error_message: null,
  error: null,
  model: null,
  summary: null,
  files_changed: null,
  parent_execution_id: null,
  step_type: null,
  step_index: null,
  step_config: null,
  ...overrides,
})

describe('ExecutionsSidebar', () => {
  const mockOnToggleVisibility = vi.fn()
  const mockOnRefresh = vi.fn()
  const mockOnStatusFilterChange = vi.fn()
  const mockOnShowAll = vi.fn()
  const mockOnHideAll = vi.fn()

  // Default props for all tests
  const defaultProps = {
    onToggleVisibility: mockOnToggleVisibility,
    onRefresh: mockOnRefresh,
    statusFilters: new Set<ExecutionStatus>(),
    onStatusFilterChange: mockOnStatusFilterChange,
    onShowAll: mockOnShowAll,
    onHideAll: mockOnHideAll,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no executions provided', () => {
    render(<ExecutionsSidebar {...defaultProps} executions={[]} visibleExecutionIds={new Set()} />)

    expect(screen.getByText('No executions yet.')).toBeInTheDocument()
    expect(screen.getByText('Start by creating an execution from an issue.')).toBeInTheDocument()
  })

  it('renders executions list with metadata', () => {
    const executions: Execution[] = [
      createMockExecution({
        id: 'exec-1',
        issue_id: 'i-test1',
        branch_name: 'sudocode/test-branch-1',
        status: 'running',
      }),
      createMockExecution({
        id: 'exec-2',
        issue_id: 'i-test2',
        branch_name: 'sudocode/test-branch-2',
        status: 'completed',
      }),
    ]

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={new Set()}
      />
    )

    // Check execution count badge
    expect(screen.getByText('2')).toBeInTheDocument()

    // Check executions are rendered (using getAllByText since IDs appear in truncated form)
    const executionIds = screen.getAllByText(/exec-/)
    expect(executionIds.length).toBeGreaterThanOrEqual(2)

    // Check status badges
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()

    // Check issue IDs
    expect(screen.getByText('i-test1')).toBeInTheDocument()
    expect(screen.getByText('i-test2')).toBeInTheDocument()
  })

  it('shows checkboxes with correct checked state', () => {
    const executions: Execution[] = [
      createMockExecution({ id: 'exec-1', status: 'running' }),
      createMockExecution({ id: 'exec-2', status: 'completed' }),
    ]

    const visibleIds = new Set(['exec-1'])

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={visibleIds}
      />
    )

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)

    // First checkbox should be checked
    expect(checkboxes[0]).toBeChecked()
    // Second checkbox should not be checked
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('calls onToggleVisibility when checkbox is clicked', () => {
    const executions: Execution[] = [createMockExecution({ id: 'exec-1', status: 'running' })]

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={new Set()}
      />
    )

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(mockOnToggleVisibility).toHaveBeenCalledWith('exec-1')
  })

  it('calls onToggleVisibility when execution item is clicked', () => {
    const executions: Execution[] = [
      createMockExecution({ id: 'exec-unique-123', status: 'running', branch_name: 'test-branch' }),
    ]

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={new Set()}
      />
    )

    // Click on the execution item (not the checkbox)
    // Find by status badge which is unique per execution
    const statusBadge = screen.getByText('Running')
    const executionItem = statusBadge.closest('.border-b')
    if (executionItem) {
      fireEvent.click(executionItem)
      expect(mockOnToggleVisibility).toHaveBeenCalledWith('exec-unique-123')
    }
  })

  it('calls onRefresh when refresh button is clicked', () => {
    const executions: Execution[] = [createMockExecution({ id: 'exec-1', status: 'running' })]

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={new Set()}
      />
    )

    // Find refresh button specifically by RefreshCw icon
    const buttons = screen.getAllByRole('button')
    const refreshButton = buttons.find(btn => {
      const svg = btn.querySelector('svg')
      return svg?.classList.contains('lucide-refresh-cw')
    })

    if (refreshButton) {
      fireEvent.click(refreshButton)
      expect(mockOnRefresh).toHaveBeenCalled()
    } else {
      throw new Error('Refresh button not found')
    }
  })

  it('subscribes to WebSocket events on mount', () => {
    const executions: Execution[] = [createMockExecution({ id: 'exec-1', status: 'running' })]

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={new Set()}
      />
    )

    expect(mockSubscribe).toHaveBeenCalledWith('execution')
    expect(mockAddMessageHandler).toHaveBeenCalledWith('executions-sidebar', expect.any(Function))
  })

  it('renders different status badges correctly', () => {
    const executions: Execution[] = [
      createMockExecution({ id: 'exec-1', status: 'running' }),
      createMockExecution({ id: 'exec-2', status: 'completed' }),
      createMockExecution({ id: 'exec-3', status: 'failed' }),
      createMockExecution({ id: 'exec-4', status: 'pending' }),
    ]

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={new Set()}
      />
    )

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('does not show refresh button when onRefresh is not provided', () => {
    const executions: Execution[] = [createMockExecution({ id: 'exec-1', status: 'running' })]

    render(
      <ExecutionsSidebar
        {...defaultProps}
        executions={executions}
        visibleExecutionIds={new Set()}
        onRefresh={undefined}
      />
    )

    // Should not render refresh button (RefreshCw icon)
    const buttons = screen.queryAllByRole('button')
    const refreshButton = buttons.find(btn => {
      const svg = btn.querySelector('svg')
      return svg?.classList.contains('lucide-refresh-cw')
    })
    expect(refreshButton).toBeUndefined()
  })
})

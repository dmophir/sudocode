import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExecutionGridTile } from '@/components/executions/ExecutionGridTile'
import type { Execution } from '@/types/execution'
import { executionsApi } from '@/lib/api'

// Mock the API
vi.mock('@/lib/api', () => ({
  executionsApi: {
    createFollowUp: vi.fn(),
  },
}))

// Mock ExecutionMonitor component
vi.mock('@/components/executions/ExecutionMonitor', () => ({
  ExecutionMonitor: ({ executionId, compact, hideTodoTracker }: any) => (
    <div data-testid="execution-monitor">
      <div>Execution ID: {executionId}</div>
      <div>Compact: {String(compact)}</div>
      <div>Hide Todo Tracker: {String(hideTodoTracker)}</div>
    </div>
  ),
}))

// Mock AgentConfigPanel component
vi.mock('@/components/executions/AgentConfigPanel', () => ({
  AgentConfigPanel: ({
    issueId,
    onStart,
    disabled,
    isFollowUp,
    promptPlaceholder,
    disableContextualActions,
  }: any) => (
    <div data-testid="agent-config-panel">
      <div>Issue ID: {issueId}</div>
      <div>Is Follow-up: {String(isFollowUp)}</div>
      <div>Disabled: {String(disabled)}</div>
      <div>Disable Contextual Actions: {String(disableContextualActions)}</div>
      <input
        data-testid="prompt-input"
        placeholder={promptPlaceholder}
        onChange={(e) => {
          if (e.target.value) {
            onStart({}, e.target.value)
          }
        }}
      />
    </div>
  ),
}))

// Sample execution for testing
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
  model: 'claude-sonnet-4',
  summary: null,
  files_changed: null,
  parent_execution_id: null,
  step_type: null,
  step_index: null,
  step_config: null,
  ...overrides,
})

describe('ExecutionGridTile', () => {
  const mockOnToggleVisibility = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.open to prevent jsdom errors
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders execution ID and status badge', () => {
    const execution = createMockExecution({ id: 'exec-test-123', status: 'running' })

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    // Check execution ID is displayed
    expect(screen.getByText('exec-test-123')).toBeInTheDocument()

    // Check status badge is displayed
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('renders ExecutionMonitor in compact mode', () => {
    const execution = createMockExecution({ id: 'exec-456' })

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    const monitor = screen.getByTestId('execution-monitor')
    expect(monitor).toBeInTheDocument()
    expect(screen.getByText('Execution ID: exec-456')).toBeInTheDocument()
    expect(screen.getByText('Compact: true')).toBeInTheDocument()
    expect(screen.getByText('Hide Todo Tracker: true')).toBeInTheDocument()
  })

  it('renders AgentConfigPanel in follow-up mode', () => {
    const execution = createMockExecution({ issue_id: 'i-test' })

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    const panel = screen.getByTestId('agent-config-panel')
    expect(panel).toBeInTheDocument()
    expect(screen.getByText('Issue ID: i-test')).toBeInTheDocument()
    expect(screen.getByText('Is Follow-up: true')).toBeInTheDocument()
    expect(screen.getByText('Disable Contextual Actions: true')).toBeInTheDocument()
  })

  it('displays different status badges correctly', () => {
    const statuses: Execution['status'][] = [
      'running',
      'completed',
      'failed',
      'pending',
      'preparing',
      'paused',
      'cancelled',
      'stopped',
    ]

    statuses.forEach((status) => {
      const execution = createMockExecution({ status })
      const { unmount } = render(
        <ExecutionGridTile
          execution={execution}
          onToggleVisibility={mockOnToggleVisibility}
          onDelete={mockOnDelete}
        />
      )

      // Check that status badge is rendered (capitalize first letter)
      const statusText = status.charAt(0).toUpperCase() + status.slice(1)
      expect(screen.getByText(statusText)).toBeInTheDocument()

      unmount()
    })
  })

  it('calls onToggleVisibility when close button is clicked', () => {
    const execution = createMockExecution({ id: 'exec-close-test' })

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    // Find the close button (should be the second button, after external link)
    const buttons = screen.getAllByRole('button')
    // Filter to only get buttons in the header (not from mocked child components)
    const headerButtons = Array.from(buttons).filter(
      (btn) =>
        !btn.closest('[data-testid="agent-config-panel"]') &&
        !btn.closest('[data-testid="execution-monitor"]')
    )

    // Second button should be the close button
    expect(headerButtons.length).toBe(2)
    fireEvent.click(headerButtons[1])
    expect(mockOnToggleVisibility).toHaveBeenCalledWith('exec-close-test')
  })

  it('opens full view in new tab when external link button is clicked', () => {
    const execution = createMockExecution({ id: 'exec-full-view' })

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    // Find and click the external link button
    const buttons = screen.getAllByRole('button')
    // Filter to only get buttons in the header
    const headerButtons = Array.from(buttons).filter(
      (btn) =>
        !btn.closest('[data-testid="agent-config-panel"]') &&
        !btn.closest('[data-testid="execution-monitor"]')
    )

    // First button should be the external link (before the close button)
    fireEvent.click(headerButtons[0])

    expect(window.open).toHaveBeenCalledWith('/executions/exec-full-view', '_blank')
  })

  it('does not render close button when onToggleVisibility is not provided', () => {
    const execution = createMockExecution()

    render(<ExecutionGridTile execution={execution} />)

    // Should only have one button (external link), not two
    const buttons = screen.getAllByRole('button')
    // Filter out buttons from mocked child components
    const actualButtons = Array.from(buttons).filter(
      (btn) => !btn.closest('[data-testid="agent-config-panel"]')
    )
    expect(actualButtons.length).toBe(1)
  })

  it('submits follow-up correctly', async () => {
    const execution = createMockExecution({ id: 'exec-followup' })
    vi.mocked(executionsApi.createFollowUp).mockResolvedValue({
      ...execution,
      id: 'exec-followup-2',
    } as Execution)

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    const promptInput = screen.getByTestId('prompt-input')
    fireEvent.change(promptInput, { target: { value: 'Test follow-up message' } })

    await waitFor(() => {
      expect(executionsApi.createFollowUp).toHaveBeenCalledWith('exec-followup', {
        feedback: 'Test follow-up message',
      })
    })
  })

  it('handles follow-up submission errors gracefully', async () => {
    const execution = createMockExecution({ id: 'exec-error' })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(executionsApi.createFollowUp).mockRejectedValue(new Error('API error'))

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    const promptInput = screen.getByTestId('prompt-input')
    fireEvent.change(promptInput, { target: { value: 'Test message' } })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
  })

  it('shows correct prompt placeholder', () => {
    const execution = createMockExecution()

    render(
      <ExecutionGridTile
        execution={execution}
        onToggleVisibility={mockOnToggleVisibility}
        onDelete={mockOnDelete}
      />
    )

    const promptInput = screen.getByPlaceholderText('Send a follow-up message...')
    expect(promptInput).toBeInTheDocument()
  })
})

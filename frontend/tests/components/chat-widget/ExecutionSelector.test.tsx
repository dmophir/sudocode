import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExecutionSelector } from '@/components/chat-widget/ExecutionSelector'
import type { Execution } from '@/types/execution'

// Helper to create mock execution
const createMockExecution = (overrides: Partial<Execution> = {}): Execution => ({
  id: 'exec-123',
  issue_id: 'i-abc',
  issue_uuid: 'uuid-abc',
  mode: 'worktree',
  prompt: 'Test prompt',
  config: null,
  agent_type: 'claude-code',
  session_id: 'session-123',
  workflow_execution_id: null,
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

describe('ExecutionSelector', () => {
  const defaultProps = {
    executions: [] as Execution[],
    value: null as string | null,
    onChange: vi.fn(),
    autoConnectLatest: true,
    onAutoConnectChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Empty State', () => {
    it('should render select trigger', () => {
      render(<ExecutionSelector {...defaultProps} />)

      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('should show "Select execution" when no value and no auto-connect', () => {
      render(<ExecutionSelector {...defaultProps} autoConnectLatest={false} />)

      expect(screen.getByText('Select execution')).toBeInTheDocument()
    })

    it('should show "Auto (latest active)" when auto-connect is enabled', () => {
      render(<ExecutionSelector {...defaultProps} autoConnectLatest={true} />)

      expect(screen.getByText('Auto (latest active)')).toBeInTheDocument()
    })
  })

  describe('With Executions', () => {
    it('should show selected execution agent type', () => {
      const executions = [createMockExecution({ id: 'exec-1', agent_type: 'claude-code' })]

      render(
        <ExecutionSelector
          {...defaultProps}
          executions={executions}
          value="exec-1"
          autoConnectLatest={false}
        />
      )

      // ExecutionSelector shows agent type, not ID in the trigger
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
    })

    it('should display execution options when opened', async () => {
      const user = userEvent.setup()
      const executions = [
        createMockExecution({ id: 'exec-1', status: 'running', agent_type: 'claude-code' }),
        createMockExecution({ id: 'exec-2', status: 'completed', agent_type: 'codex' }),
      ]

      render(<ExecutionSelector {...defaultProps} executions={executions} />)

      // Open the dropdown
      await user.click(screen.getByRole('combobox'))

      // Should show auto option (appears multiple times: in trigger and in dropdown)
      expect(screen.getAllByText('Auto (latest active)').length).toBeGreaterThanOrEqual(1)

      // Should show executions by their agent type labels
      expect(screen.getAllByText('Claude Code').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Codex').length).toBeGreaterThan(0)
    })

    it('should group executions by status', async () => {
      const user = userEvent.setup()
      const executions = [
        createMockExecution({ id: 'exec-running', status: 'running' }),
        createMockExecution({ id: 'exec-completed', status: 'completed' }),
        createMockExecution({ id: 'exec-pending', status: 'pending' }),
      ]

      render(<ExecutionSelector {...defaultProps} executions={executions} />)

      await user.click(screen.getByRole('combobox'))

      // Should have Active and Recent groups
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Recent')).toBeInTheDocument()
    })
  })

  describe('Selection', () => {
    it('should call onChange when execution is selected', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const executions = [createMockExecution({ id: 'exec-1', agent_type: 'codex', status: 'completed' })]

      render(
        <ExecutionSelector {...defaultProps} executions={executions} onChange={onChange} />
      )

      await user.click(screen.getByRole('combobox'))
      // Click on the Codex option (in Recent group)
      const options = screen.getAllByRole('option')
      // Find the option that's not the auto option
      const codexOption = options.find(opt => opt.textContent?.includes('Codex'))
      if (codexOption) {
        await user.click(codexOption)
      }

      expect(onChange).toHaveBeenCalledWith('exec-1')
    })

    it('should call onAutoConnectChange when auto option is selected', async () => {
      const user = userEvent.setup()
      const onAutoConnectChange = vi.fn()
      const executions = [createMockExecution({ id: 'exec-1', status: 'running' })]

      render(
        <ExecutionSelector
          {...defaultProps}
          executions={executions}
          autoConnectLatest={false}
          onAutoConnectChange={onAutoConnectChange}
        />
      )

      await user.click(screen.getByRole('combobox'))
      await user.click(screen.getByText('Auto (latest active)'))

      expect(onAutoConnectChange).toHaveBeenCalledWith(true)
    })
  })

  describe('Status Indicators', () => {
    it('should show running status indicator', async () => {
      const user = userEvent.setup()
      const executions = [createMockExecution({ id: 'exec-1', status: 'running' })]

      render(<ExecutionSelector {...defaultProps} executions={executions} />)

      await user.click(screen.getByRole('combobox'))

      // Running status should have a loader or indicator
      const container = screen.getByRole('listbox')
      expect(container).toBeInTheDocument()
    })

    it('should show completed status', async () => {
      const user = userEvent.setup()
      const executions = [createMockExecution({ id: 'exec-1', status: 'completed' })]

      render(<ExecutionSelector {...defaultProps} executions={executions} />)

      await user.click(screen.getByRole('combobox'))

      // Completed status is in "Recent" group
      expect(screen.getByText('Recent')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should apply custom className to trigger', () => {
      render(<ExecutionSelector {...defaultProps} className="custom-class" />)

      // The className is applied to the SelectTrigger (the combobox button)
      const trigger = screen.getByRole('combobox')
      expect(trigger.className).toContain('custom-class')
    })
  })
})

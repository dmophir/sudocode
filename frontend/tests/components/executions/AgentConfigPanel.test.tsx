import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import { AgentConfigPanel } from '@/components/executions/AgentConfigPanel'
import { executionsApi } from '@/lib/api'

// Mock the API
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    executionsApi: {
      ...actual.executionsApi,
      prepare: vi.fn(),
    },
  }
})

describe('AgentConfigPanel', () => {
  const mockOnStart = vi.fn()
  const mockPrepareResult = {
    issue: {
      id: 'i-test',
      title: 'Test Issue',
      description: 'Test description',
      status: 'open' as const,
      priority: 0,
      created_at: '2024-01-01T00:00:00Z',
    },
    defaultConfig: {
      mode: 'worktree' as const,
      model: 'claude-sonnet-4',
      cleanupMode: 'manual' as const,
    },
    availableModels: ['claude-sonnet-4', 'claude-opus-4'],
    availableBranches: ['main', 'develop'],
    renderedPrompt: 'Test prompt',
    relatedSpecs: [],
    relatedFeedback: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(executionsApi.prepare).mockResolvedValue(mockPrepareResult)
  })

  it('should submit on Enter key press', async () => {
    const user = userEvent.setup()

    renderWithProviders(<AgentConfigPanel issueId="i-test" onStart={mockOnStart} />)

    // Wait for component to load
    await waitFor(() => {
      expect(executionsApi.prepare).toHaveBeenCalled()
    })

    const textarea = screen.getByPlaceholderText('Enter prompt for the agent...')
    await user.type(textarea, 'Test prompt')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(mockOnStart).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'worktree',
        }),
        'Test prompt'
      )
    })
  })

  it('should create newline on Shift+Enter key press', async () => {
    const user = userEvent.setup()

    renderWithProviders(<AgentConfigPanel issueId="i-test" onStart={mockOnStart} />)

    // Wait for component to load
    await waitFor(() => {
      expect(executionsApi.prepare).toHaveBeenCalled()
    })

    const textarea = screen.getByPlaceholderText('Enter prompt for the agent...')
    await user.type(textarea, 'Line 1{Shift>}{Enter}{/Shift}Line 2')

    // Should have newline and not submit
    expect(textarea).toHaveValue('Line 1\nLine 2')
    expect(mockOnStart).not.toHaveBeenCalled()
  })

  it('should not submit on Enter when prompt is empty', async () => {
    const user = userEvent.setup()

    renderWithProviders(<AgentConfigPanel issueId="i-test" onStart={mockOnStart} />)

    // Wait for component to load
    await waitFor(() => {
      expect(executionsApi.prepare).toHaveBeenCalled()
    })

    const textarea = screen.getByPlaceholderText('Enter prompt for the agent...')
    await user.click(textarea)
    await user.keyboard('{Enter}')

    // Should not submit when empty
    expect(mockOnStart).not.toHaveBeenCalled()
  })

  it('should not submit on Enter when disabled', async () => {
    const user = userEvent.setup()

    renderWithProviders(<AgentConfigPanel issueId="i-test" onStart={mockOnStart} disabled={true} />)

    // Wait for component to load
    await waitFor(() => {
      expect(executionsApi.prepare).toHaveBeenCalled()
    })

    const textarea = screen.getByPlaceholderText('Enter prompt for the agent...')
    await user.type(textarea, 'Test prompt')
    await user.keyboard('{Enter}')

    // Should not submit when disabled
    expect(mockOnStart).not.toHaveBeenCalled()
  })
})

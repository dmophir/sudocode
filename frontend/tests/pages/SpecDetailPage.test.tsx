import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SpecDetailPage from '@/pages/SpecDetailPage'
import * as useSpecsHook from '@/hooks/useSpecs'
import * as useIssuesHook from '@/hooks/useIssues'

// Mock the hooks
vi.mock('@/hooks/useSpecs')
vi.mock('@/hooks/useIssues')

const mockSpec = {
  id: 'SPEC-001',
  title: 'Test Spec',
  content: '# Test Content\n\nThis is a test spec.',
  priority: 1,
  file_path: 'test.md',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockUpdateSpec = vi.fn()

const renderSpecDetailPage = (specId = 'SPEC-001') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/specs/${specId}`]}>
        <Routes>
          <Route path="/specs/:id" element={<SpecDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SpecDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    vi.mocked(useSpecsHook.useSpec).mockReturnValue({
      spec: mockSpec,
      isLoading: false,
      isError: false,
    } as any)

    vi.mocked(useSpecsHook.useSpecFeedback).mockReturnValue({
      feedback: [],
    } as any)

    vi.mocked(useSpecsHook.useSpecs).mockReturnValue({
      updateSpec: mockUpdateSpec,
      isUpdating: false,
    } as any)

    vi.mocked(useIssuesHook.useIssues).mockReturnValue({
      issues: [],
    } as any)
  })

  it('should render spec with editable title and priority', async () => {
    renderSpecDetailPage()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Spec')).toBeInTheDocument()
      expect(screen.getByText(/High \(P1\)/)).toBeInTheDocument()
    })
  })

  it('should show save status indicator', async () => {
    renderSpecDetailPage()

    await waitFor(() => {
      expect(screen.getByText('All changes saved')).toBeInTheDocument()
    })
  })

  it('should update title and trigger auto-save', async () => {
    const user = userEvent.setup()
    renderSpecDetailPage()

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Spec')).toBeInTheDocument()
    })

    // Modify the title
    const titleInput = screen.getByDisplayValue('Test Spec')
    await user.clear(titleInput)
    await user.type(titleInput, 'Updated Spec Title')

    // Should show unsaved changes
    expect(screen.getByText('Unsaved changes...')).toBeInTheDocument()

    // Wait for auto-save (1 second debounce)
    await waitFor(
      () => {
        expect(mockUpdateSpec).toHaveBeenCalledWith({
          id: 'SPEC-001',
          data: expect.objectContaining({
            title: 'Updated Spec Title',
          }),
        })
      },
      { timeout: 2000 }
    )
  })

  it('should update priority and trigger auto-save', async () => {
    const user = userEvent.setup()
    renderSpecDetailPage()

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText(/High \(P1\)/)).toBeInTheDocument()
    })

    // Click priority dropdown - get all comboboxes and find the priority one
    const comboboxes = screen.getAllByRole('combobox')
    const priorityTrigger = comboboxes.find((box) =>
      box.textContent?.includes('High (P1)')
    )
    expect(priorityTrigger).toBeDefined()
    await user.click(priorityTrigger!)

    // Select new priority
    await waitFor(() => {
      const criticalOption = screen.getByText(/Critical \(P0\)/)
      return user.click(criticalOption)
    })

    // Wait for auto-save
    await waitFor(
      () => {
        expect(mockUpdateSpec).toHaveBeenCalledWith({
          id: 'SPEC-001',
          data: expect.objectContaining({
            priority: 0,
          }),
        })
      },
      { timeout: 2000 }
    )
  })

  it('should show loading state', () => {
    vi.mocked(useSpecsHook.useSpec).mockReturnValue({
      spec: null,
      isLoading: true,
      isError: false,
    } as any)

    renderSpecDetailPage()

    expect(screen.getByText('Loading spec...')).toBeInTheDocument()
  })

  it('should show error state when spec not found', () => {
    vi.mocked(useSpecsHook.useSpec).mockReturnValue({
      spec: null,
      isLoading: false,
      isError: true,
    } as any)

    renderSpecDetailPage()

    expect(screen.getByText('Spec not found')).toBeInTheDocument()
    expect(screen.getByText(/doesn't exist or has been deleted/)).toBeInTheDocument()
  })

  it('should show feedback panel toggle button', async () => {
    renderSpecDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Feedback/ })).toBeInTheDocument()
    })
  })

  it('should display spec metadata', async () => {
    renderSpecDetailPage()

    await waitFor(() => {
      expect(screen.getByText('SPEC-001')).toBeInTheDocument()
      expect(screen.getByText('test.md')).toBeInTheDocument()
    })
  })

  it('should render back button', async () => {
    renderSpecDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument()
    })
  })

  it('should show updating status when saving', async () => {
    vi.mocked(useSpecsHook.useSpecs).mockReturnValue({
      updateSpec: mockUpdateSpec,
      isUpdating: true,
    } as any)

    renderSpecDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })
  })
})

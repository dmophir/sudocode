import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpecViewerTiptap } from '@/components/specs/SpecViewerTiptap'
import { renderWithProviders } from '@/test/test-utils'

describe('SpecViewerTiptap', () => {
  const sampleContent = `# Test Spec\n\nThis is the content.`

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render spec content with view mode toggles', () => {
    renderWithProviders(<SpecViewerTiptap content={sampleContent} />)

    expect(screen.getByText('Formatted')).toBeInTheDocument()
    expect(screen.getByText('Source')).toBeInTheDocument()
  })

  it('should not show edit/view toggle buttons since it is always editable', () => {
    renderWithProviders(<SpecViewerTiptap content={sampleContent} />)

    // Should not have Edit or View buttons
    expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View/i })).not.toBeInTheDocument()
  })

  it('should switch between formatted and source view', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SpecViewerTiptap content={sampleContent} />)

    // Should have both view mode buttons
    expect(screen.getByRole('button', { name: /Formatted/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Source/i })).toBeInTheDocument()

    // Switch to source view
    const sourceButton = screen.getByRole('button', { name: /Source/i })
    await user.click(sourceButton)

    // Should show source view content
    await waitFor(() => {
      expect(screen.getByText(/Test Spec/)).toBeInTheDocument()
    })
  })

  it('should accept onChange callback for auto-save functionality', () => {
    const onChange = vi.fn()

    renderWithProviders(<SpecViewerTiptap content={sampleContent} onChange={onChange} />)

    // Component should render without errors when onChange is provided
    expect(screen.getByText('Formatted')).toBeInTheDocument()
  })

  it('should display feedback count in source view', async () => {
    const user = userEvent.setup()
    const feedback = [
      {
        id: 'fb1',
        issue_id: 'ISSUE-001',
        spec_id: 'SPEC-001',
        type: 'comment' as const,
        content: 'Test feedback',
        anchor: JSON.stringify({ line_number: 1 }),
        dismissed: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ]

    renderWithProviders(<SpecViewerTiptap content={sampleContent} feedback={feedback} />)

    // Switch to source view to see feedback count
    const sourceButton = screen.getByRole('button', { name: /Source/i })
    await user.click(sourceButton)

    await waitFor(() => {
      expect(screen.getByText(/1 feedback item/)).toBeInTheDocument()
    })
  })
})

import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { TiptapMarkdownViewer } from '@/components/specs/TiptapMarkdownViewer'

describe('Entity Mention Rendering', () => {
  it('should render basic issue mention as badge', async () => {
    const content = 'This references [[ISSUE-001]]'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    // Wait for Tiptap to process the content and render the link
    await waitFor(
      () => {
        const link = screen.getByRole('link', { name: /ISSUE-001/i })
        expect(link).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    // Check that the link points to the correct URL
    const link = screen.getByRole('link', { name: /ISSUE-001/i })
    expect(link).toHaveAttribute('href', '/issues/ISSUE-001')
  })

  it('should render spec mention as badge', async () => {
    const content = 'See [[SPEC-002]] for details'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    await waitFor(
      () => {
        const link = screen.getByRole('link', { name: /SPEC-002/i })
        expect(link).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    const link = screen.getByRole('link', { name: /SPEC-002/i })
    expect(link).toHaveAttribute('href', '/specs/SPEC-002')
  })

  it('should render mention with display text', async () => {
    const content = '[[ISSUE-003|OAuth Implementation]]'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    await waitFor(
      () => {
        const link = screen.getByRole('link', { name: /OAuth Implementation/i })
        expect(link).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    const link = screen.getByRole('link', { name: /OAuth Implementation/i })
    expect(link).toHaveAttribute('href', '/issues/ISSUE-003')
  })

  it('should render mention with relationship type', async () => {
    const content = '[[ISSUE-004]]{ implements }'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    await waitFor(
      () => {
        const link = screen.getByRole('link', { name: /ISSUE-004/i })
        expect(link).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    const link = screen.getByRole('link', { name: /ISSUE-004/i })
    expect(link).toHaveAttribute('href', '/issues/ISSUE-004')

    // Check that relationship type is rendered as text (may appear multiple times)
    const implementsElements = screen.getAllByText(/implements/i)
    expect(implementsElements.length).toBeGreaterThan(0)
  })

  it('should render multiple mentions', async () => {
    const content = '[[ISSUE-001]] and [[SPEC-002]] and [[ISSUE-003|Display]]'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    await waitFor(
      () => {
        expect(screen.getByRole('link', { name: /ISSUE-001/i })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /SPEC-002/i })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Display/i })).toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  })

  it('should create clickable links to entity pages', async () => {
    const content = '[[ISSUE-005]]'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    await waitFor(
      () => {
        const link = screen.getByRole('link', { name: /ISSUE-005/i })
        expect(link).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    const link = screen.getByRole('link', { name: /ISSUE-005/i })
    expect(link).toHaveAttribute('href', '/issues/ISSUE-005')
  })

  it('should not render escaped mentions', async () => {
    const content = 'Escaped: \\[\\[ISSUE-006\\]\\]'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    // Wait a bit for any processing
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Should not create a link for escaped mention
    const links = screen.queryAllByRole('link')
    const issue006Link = links.find((link) => link.getAttribute('href') === '/issues/ISSUE-006')
    expect(issue006Link).toBeUndefined()

    // Should display the escaped text as literal text (the backslashes will be rendered by the browser)
    expect(screen.getByText((content) => content.includes('[[ISSUE-006]]'))).toBeInTheDocument()
  })

  it('should render mentions within complex markdown', async () => {
    const content = `# Heading

This is a paragraph with [[ISSUE-001]].

## Subheading

- List item with [[SPEC-002|Spec]]
- Another with [[ISSUE-003]]{ implements }`

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    await waitFor(
      () => {
        expect(screen.getByRole('link', { name: /ISSUE-001/i })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Spec/i })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /ISSUE-003/i })).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    // Verify heading and list structure are preserved
    expect(screen.getByRole('heading', { level: 1, name: /heading/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /subheading/i })).toBeInTheDocument()
  })

  it('should handle empty content gracefully', async () => {
    const content = ''

    const { container } = renderWithProviders(<TiptapMarkdownViewer content={content} />)

    // Should not crash
    expect(container).toBeInTheDocument()
  })

  it('should handle content with no entity mentions', async () => {
    const content = 'Just regular text with no mentions'

    renderWithProviders(<TiptapMarkdownViewer content={content} />)

    await waitFor(
      () => {
        expect(screen.getByText(/just regular text/i)).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    // Should not have any links (entity mentions render as links)
    const links = screen.queryAllByRole('link')
    expect(links.length).toBe(0)
  })
})

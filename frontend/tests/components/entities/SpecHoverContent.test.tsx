import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpecHoverContent } from '@/components/entities/SpecHoverContent'
import type { Spec } from '@/types/api'

describe('SpecHoverContent', () => {
  const mockSpec: Spec = {
    id: 's-test123',
    uuid: 'uuid-test123',
    title: 'Test Spec Title',
    content: 'Test content',
    file_path: '/path/to/spec.md',
    priority: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  const mockImplementingIssues = [
    { id: 'i-impl001', type: 'issue' as const },
    { id: 'i-impl002', type: 'issue' as const },
  ]

  describe('loading state', () => {
    it('should show loading skeleton when isLoading is true', () => {
      render(
        <SpecHoverContent
          spec={undefined}
          implementingIssues={[]}
          isLoading={true}
          isError={false}
        />
      )

      // Check for skeleton elements (they have animate-pulse class)
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('error state', () => {
    it('should show error message when isError is true', () => {
      render(
        <SpecHoverContent
          spec={undefined}
          implementingIssues={[]}
          isLoading={false}
          isError={true}
        />
      )

      expect(screen.getByText('Failed to load spec details')).toBeInTheDocument()
    })

    it('should show error message when spec is undefined', () => {
      render(
        <SpecHoverContent
          spec={undefined}
          implementingIssues={[]}
          isLoading={false}
          isError={false}
        />
      )

      expect(screen.getByText('Failed to load spec details')).toBeInTheDocument()
    })
  })

  describe('successful render', () => {
    it('should display spec title', () => {
      render(
        <SpecHoverContent
          spec={mockSpec}
          implementingIssues={[]}
          isLoading={false}
          isError={false}
        />
      )

      expect(screen.getByText('Test Spec Title')).toBeInTheDocument()
    })

    it('should show "No implementing issues" when empty', () => {
      render(
        <SpecHoverContent
          spec={mockSpec}
          implementingIssues={[]}
          isLoading={false}
          isError={false}
        />
      )

      expect(screen.getByText('No implementing issues')).toBeInTheDocument()
    })
  })

  describe('implementing issues', () => {
    it('should display implementing issues section', () => {
      render(
        <SpecHoverContent
          spec={mockSpec}
          implementingIssues={mockImplementingIssues}
          isLoading={false}
          isError={false}
        />
      )

      expect(screen.getByText('Implementing issues')).toBeInTheDocument()
    })

    it('should display issue badges', () => {
      render(
        <SpecHoverContent
          spec={mockSpec}
          implementingIssues={mockImplementingIssues}
          isLoading={false}
          isError={false}
        />
      )

      expect(screen.getByText('i-impl001')).toBeInTheDocument()
      expect(screen.getByText('i-impl002')).toBeInTheDocument()
    })

    it('should limit displayed issues to 5 and show count for more', () => {
      const manyIssues = [
        { id: 'i-impl001', type: 'issue' as const },
        { id: 'i-impl002', type: 'issue' as const },
        { id: 'i-impl003', type: 'issue' as const },
        { id: 'i-impl004', type: 'issue' as const },
        { id: 'i-impl005', type: 'issue' as const },
        { id: 'i-impl006', type: 'issue' as const },
        { id: 'i-impl007', type: 'issue' as const },
      ]

      render(
        <SpecHoverContent
          spec={mockSpec}
          implementingIssues={manyIssues}
          isLoading={false}
          isError={false}
        />
      )

      // First 5 should be visible
      expect(screen.getByText('i-impl001')).toBeInTheDocument()
      expect(screen.getByText('i-impl005')).toBeInTheDocument()
      // 6th and 7th should not be visible
      expect(screen.queryByText('i-impl006')).not.toBeInTheDocument()
      expect(screen.queryByText('i-impl007')).not.toBeInTheDocument()
      // Should show "+2 more"
      expect(screen.getByText('+2 more')).toBeInTheDocument()
    })

    it('should not show "No implementing issues" when issues exist', () => {
      render(
        <SpecHoverContent
          spec={mockSpec}
          implementingIssues={mockImplementingIssues}
          isLoading={false}
          isError={false}
        />
      )

      expect(screen.queryByText('No implementing issues')).not.toBeInTheDocument()
    })
  })
})

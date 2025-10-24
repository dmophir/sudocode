import { useEffect, useState } from 'react'
import { specsApi } from '@/lib/api'
import type { Spec } from '@/types/api'

export default function SpecsPage() {
  const [specs, setSpecs] = useState<Spec[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    specsApi
      .getAll()
      .then((data) => {
        setSpecs(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load specs:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading specs...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Specs</h1>
        <p className="text-muted-foreground">
          Found {specs.length} specs | Spec viewer coming in ISSUE-023
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {specs.map((spec) => (
          <div key={spec.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{spec.id}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Priority {spec.priority}
              </span>
            </div>
            <h3 className="mb-2 font-semibold">{spec.title}</h3>
            {spec.content && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {spec.content.slice(0, 200)}...
              </p>
            )}
            {spec.file_path && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {spec.file_path}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

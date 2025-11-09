import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { bundlesApi } from '@/lib/api'
import type { ContextBundle, ContextBundleItem } from '@/types/api'

interface BundleEditorProps {
  bundle: ContextBundle | null
  onSave: (data: { name: string; description?: string }) => void
  onCancel: () => void
  isLoading?: boolean
}

export function BundleEditor({ bundle, onSave, onCancel, isLoading = false }: BundleEditorProps) {
  const [name, setName] = useState(bundle?.name || '')
  const [description, setDescription] = useState(bundle?.description || '')
  const [items, setItems] = useState<ContextBundleItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [newItemEntityType, setNewItemEntityType] = useState<'session' | 'spec' | 'issue' | 'execution'>('session')
  const [newItemEntityId, setNewItemEntityId] = useState('')

  // Load items if editing existing bundle
  useEffect(() => {
    if (bundle?.id) {
      setLoadingItems(true)
      bundlesApi
        .getItems(bundle.id)
        .then((fetchedItems) => {
          setItems(fetchedItems)
        })
        .catch((error) => {
          console.error('Failed to load bundle items:', error)
        })
        .finally(() => {
          setLoadingItems(false)
        })
    }
  }, [bundle?.id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      alert('Please enter a bundle name')
      return
    }
    onSave({ name: name.trim(), description: description.trim() || undefined })
  }

  const handleAddItem = async () => {
    if (!bundle?.id || !newItemEntityId.trim()) {
      alert('Please enter an entity ID')
      return
    }

    try {
      const newItem = await bundlesApi.addItem(bundle.id, {
        entity_type: newItemEntityType,
        entity_id: newItemEntityId.trim(),
      })
      setItems([...items, newItem])
      setNewItemEntityId('')
    } catch (error) {
      console.error('Failed to add item:', error)
      alert('Failed to add item to bundle')
    }
  }

  const handleRemoveItem = async (item: ContextBundleItem) => {
    if (!bundle?.id) return

    try {
      await bundlesApi.removeItem(bundle.id, item.entity_type, item.entity_id)
      setItems(items.filter((i) => !(i.entity_type === item.entity_type && i.entity_id === item.entity_id)))
    } catch (error) {
      console.error('Failed to remove item:', error)
      alert('Failed to remove item from bundle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Bundle Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter bundle name..."
          required
          maxLength={500}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter bundle description..."
          rows={3}
          disabled={isLoading}
        />
      </div>

      {/* Bundle items section - only show when editing existing bundle */}
      {bundle?.id && (
        <div className="space-y-2">
          <Label>Bundle Items</Label>

          {loadingItems ? (
            <p className="text-sm text-muted-foreground">Loading items...</p>
          ) : (
            <>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-2">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items in bundle</p>
                ) : (
                  items.map((item) => (
                    <div
                      key={`${item.entity_type}-${item.entity_id}`}
                      className="flex items-center justify-between rounded bg-muted p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium">
                          {item.entity_type}
                        </span>
                        <span className="font-mono text-sm">{item.entity_id}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(item)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* Add new item form */}
              <div className="flex gap-2">
                <Select value={newItemEntityType} onValueChange={(value: any) => setNewItemEntityType(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="session">Session</SelectItem>
                    <SelectItem value="spec">Spec</SelectItem>
                    <SelectItem value="issue">Issue</SelectItem>
                    <SelectItem value="execution">Execution</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={newItemEntityId}
                  onChange={(e) => setNewItemEntityId(e.target.value)}
                  placeholder="Entity ID (e.g., SESS-001)"
                  className="flex-1"
                />
                <Button type="button" onClick={handleAddItem} variant="outline">
                  Add
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : bundle ? 'Update Bundle' : 'Create Bundle'}
        </Button>
      </div>
    </form>
  )
}

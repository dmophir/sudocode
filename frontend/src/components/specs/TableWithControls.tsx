import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TableWithControls({ editor, getPos }: NodeViewProps) {
  // Helper to select the first cell in the table before running commands
  const selectFirstCell = () => {
    const pos = getPos()
    if (typeof pos === 'number') {
      try {
        // Navigate to the first cell inside the table
        const $pos = editor.state.doc.resolve(pos + 1)

        // Find the first table cell or header
        let cellPos = pos + 1
        const tableNode = $pos.node($pos.depth)

        // Traverse to find the first cell
        tableNode.descendants((node, offset) => {
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            cellPos = pos + 1 + offset + 1 // +1 for inside table, +offset for position, +1 for inside cell
            return false // Stop searching
          }
          return true
        })

        editor.chain().focus().setTextSelection(cellPos).run()
        return true
      } catch (e) {
        console.error('Failed to select table cell:', e)
        return false
      }
    }
    return false
  }

  const addRowBelow = () => {
    console.log('addRowBelow called')
    if (selectFirstCell()) {
      const result = editor.chain().focus().addRowAfter().run()
      console.log('addRowAfter result:', result)
    }
  }

  const addColumnRight = () => {
    console.log('addColumnRight called')
    if (selectFirstCell()) {
      const result = editor.chain().focus().addColumnAfter().run()
      console.log('addColumnAfter result:', result)
    }
  }

  const deleteTable = () => {
    console.log('deleteTable called')
    if (selectFirstCell()) {
      const result = editor.chain().focus().deleteTable().run()
      console.log('deleteTable result:', result)
    }
  }

  return (
    <NodeViewWrapper className="relative group my-4 inline-block">
      {/* Right controls - Add column after */}
      <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="flex flex-col gap-1 pointer-events-auto">
          <Button
            size="sm"
            variant="ghost"
            onClick={addColumnRight}
            className="h-5 w-5 p-0 bg-background/30 hover:bg-background/60 backdrop-blur-sm"
            type="button"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Bottom controls - Add row after and delete table */}
      <div className="absolute -bottom-6 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="flex gap-1 pointer-events-auto">
          <Button
            size="sm"
            variant="ghost"
            onClick={addRowBelow}
            className="h-5 px-2 text-xs bg-background/30 hover:bg-background/60 backdrop-blur-sm"
            type="button"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={deleteTable}
            className="h-5 px-2 text-xs text-destructive hover:text-destructive bg-background/30 hover:bg-background/60 backdrop-blur-sm"
            type="button"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Table content */}
      <NodeViewContent as={'table' as any} className="border-collapse table-auto w-full" />
    </NodeViewWrapper>
  )
}

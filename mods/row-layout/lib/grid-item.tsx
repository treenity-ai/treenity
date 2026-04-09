import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LayoutItem } from './types'

type GridItemProps = {
  item: LayoutItem
  editable?: boolean
  children: ReactNode
  onUpdate?: (patch: Partial<LayoutItem>) => void
  onHide?: () => void
  onRemove?: () => void
  isCrossRow?: boolean
}

export function GridItem({ item, editable, children, onUpdate, onHide, onRemove, isCrossRow }: GridItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.ref,
  })

  return (
    <div
      ref={setNodeRef}
      className={`relative group min-h-[40px] rounded-md ${item.padding ?? ''} ${isDragging ? 'opacity-30' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {isCrossRow && (
        <div className="absolute -left-1 top-0 bottom-0 flex items-center z-10">
          <div className="w-0.5 h-full bg-primary rounded-full" />
        </div>
      )}

      {editable && (
        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <button
            {...attributes}
            {...listeners}
            className="p-0.5 rounded hover:bg-[--card] cursor-grab text-[--text-3]"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {children}
    </div>
  )
}

import { useDroppable } from '@dnd-kit/core'

export function DropZone({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`h-2 -my-1 rounded transition-colors ${isOver ? 'bg-primary/30' : ''}`}
    />
  )
}

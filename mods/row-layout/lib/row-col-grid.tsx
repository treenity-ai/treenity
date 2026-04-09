import {
  closestCenter, DndContext, DragOverlay,
  PointerSensor, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useState } from 'react'
import { DropZone } from './drop-zone'
import { GridItem } from './grid-item'
import { GridRow } from './grid-row'
import { isComponentRef, type LayoutRow, type RowColGridProps } from './types'

function findItem(rows: LayoutRow[], ref: string) {
  for (let ri = 0; ri < rows.length; ri++) {
    const ii = rows[ri].items.findIndex(i => i.ref === ref)
    if (ii !== -1) return { rowIdx: ri, itemIdx: ii, rowId: rows[ri].id }
  }
  return null
}

function zoneAwareCollision(args: Parameters<typeof closestCenter>[0]) {
  const zones = args.droppableContainers.filter(c => String(c.id).startsWith('zone-'))
  if (zones.length) {
    const zoneHits = pointerWithin({ ...args, droppableContainers: zones })
    if (zoneHits.length) return zoneHits
  }
  const items = args.droppableContainers.filter(c => !String(c.id).startsWith('zone-'))
  return closestCenter({ ...args, droppableContainers: items })
}

let _counter = 0
const rid = () => `r${Date.now().toString(36)}${(_counter++).toString(36)}`

export function RowColGrid(props: RowColGridProps) {
  const { rows, hidden, gap, padding, renderItem, editable, onChange } = props
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const activePos = activeId ? findItem(rows, activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    setOverId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      setActiveId(null)
      setOverId(null)
      return
    }

    const src = findItem(rows, String(active.id))
    if (!src) { setActiveId(null); return }

    const newRows = rows.map(r => ({ ...r, items: [...r.items] }))

    const zoneMatch = String(over.id).match(/^zone-(\d+)$/)
    if (zoneMatch) {
      const zoneIdx = parseInt(zoneMatch[1])
      const [item] = newRows[src.rowIdx].items.splice(src.itemIdx, 1)
      const cleaned = newRows.filter(r => r.items.length > 0)
      const insertIdx = Math.min(zoneIdx, cleaned.length)
      cleaned.splice(insertIdx, 0, { id: rid(), items: [item] })
      onChange?.({ rows: cleaned })
      setActiveId(null)
      setOverId(null)
      return
    }

    const dst = findItem(rows, String(over.id))
    if (!dst) { setActiveId(null); return }

    if (src.rowIdx === dst.rowIdx) {
      newRows[src.rowIdx].items = arrayMove(newRows[src.rowIdx].items, src.itemIdx, dst.itemIdx)
    } else {
      const [item] = newRows[src.rowIdx].items.splice(src.itemIdx, 1)
      newRows[dst.rowIdx].items.splice(dst.itemIdx, 0, item)
    }

    onChange?.({ rows: newRows.filter(r => r.items.length > 0) })
    setActiveId(null)
    setOverId(null)
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    setOverId(event.over ? String(event.over.id) : null)
  }

  function handleHide(ref: string) {
    const newR = rows.map(r => ({ ...r, items: r.items.filter(i => i.ref !== ref) }))
    const patch: Partial<{ rows: LayoutRow[]; hidden: string[] }> = {
      rows: newR.filter(r => r.items.length > 0),
    }
    if (isComponentRef(ref)) {
      patch.hidden = [...(hidden ?? []), ref]
    }
    onChange?.(patch)
  }

  if (!editable) {
    return (
      <div className={`flex flex-col ${gap ?? 'gap-3'} ${padding ?? ''}`}>
        {rows.map(row => {
          const gridCols = row.grid ?? `repeat(${row.items.length}, 1fr)`
          return (
            <div key={row.id} className={`grid ${row.gap ?? 'gap-3'}`} style={{ gridTemplateColumns: gridCols }}>
              {row.items.map(item => (
                <div key={item.ref} className={item.padding ?? ''}>
                  {renderItem(item.ref)}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={zoneAwareCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
    >
      <div className={`flex flex-col ${gap ?? 'gap-3'} ${padding ?? ''}`}>
        <DropZone id="zone-0" />
        {rows.map((row, ri) => (
          <div key={row.id}>
            <GridRow
              row={row}
              editable
              activeRowId={activePos?.rowId ?? null}
              renderItem={(item, isCrossRow) => (
                <GridItem
                  key={item.ref}
                  item={item}
                  editable
                  isCrossRow={isCrossRow && overId === item.ref}
                  onHide={() => handleHide(item.ref)}
                >
                  {renderItem(item.ref)}
                </GridItem>
              )}
            />
            <DropZone id={`zone-${ri + 1}`} />
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeId && (
          <div className="rounded-md bg-[--card] border border-[--border] shadow-lg p-2 opacity-80">
            {renderItem(activeId)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

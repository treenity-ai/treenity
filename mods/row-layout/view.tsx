import { type ComponentData, getComponents, type NodeData, register } from '@treenity/core'
import { Render, RenderContext, type View } from '@treenity/react'
import { useChildren } from '@treenity/react'
import { useEffect, useState } from 'react'
import { RowColGrid } from './lib/row-col-grid'
import { isComponentRef } from './lib/types'
import type { LayoutRow } from './lib/types'
import type { RowColLayout } from './types'

let _counter = 0
const rid = () => `r${Date.now().toString(36)}${(_counter++).toString(36)}`

function toLayoutRef(name: string): string {
  return name === '' ? '#' : `#${name}`
}

function childToRef(childPath: string, parentPath: string): string {
  const prefix = parentPath === '/' ? '/' : parentPath + '/'
  return childPath.startsWith(prefix) ? childPath.slice(prefix.length) : childPath
}

function reconcile(discoveredRefs: Set<string>, rows: LayoutRow[], hidden: string[]) {
  const seen = new Set<string>()
  const reconciledRows = rows
    .map(r => ({
      ...r,
      items: r.items.filter(i => {
        if (!discoveredRefs.has(i.ref) || seen.has(i.ref)) return false
        seen.add(i.ref)
        return true
      }),
    }))
    .filter(r => r.items.length > 0)

  const dedupedHidden = [...new Set(hidden)].filter(h => discoveredRefs.has(h) && !seen.has(h))
  return { rows: reconciledRows, hidden: dedupedHidden }
}

const RowColLayoutView: View<RowColLayout> = ({ value, onChange, ctx }) => {
  const [editable, setEditable] = useState(false)

  const node = ctx?.node
  if (!node) return null

  const allComps = getComponents(node)

  const compMap = new Map<string, ComponentData>()
  for (const [name, comp] of allComps) {
    if (comp.$type === 'layout.row-col') continue
    compMap.set(toLayoutRef(name), comp)
  }

  const children = useChildren(node.$path)
  const childMap = new Map<string, NodeData>()
  for (const child of children) {
    const ref = childToRef(child.$path, node.$path)
    childMap.set(ref, child)
  }

  const discoveredRefs = new Set([
    ...compMap.keys(),
    ...(value.rows ?? []).flatMap(r => r.items.map(i => i.ref)).filter(ref => !isComponentRef(ref) && childMap.has(ref)),
  ])

  const { rows: cleanRows, hidden: cleanHidden } = reconcile(
    discoveredRefs, value.rows ?? [], value.hidden ?? [],
  )

  const storedRowsJson = JSON.stringify(value.rows ?? [])
  const cleanRowsJson = JSON.stringify(cleanRows)
  const storedHiddenJson = JSON.stringify(value.hidden ?? [])
  const cleanHiddenJson = JSON.stringify(cleanHidden)

  useEffect(() => {
    if (storedRowsJson !== cleanRowsJson || storedHiddenJson !== cleanHiddenJson) {
      onChange?.({ rows: cleanRows, hidden: cleanHidden })
    }
  }, [storedRowsJson, cleanRowsJson, storedHiddenJson, cleanHiddenJson])

  const mentionedRefs = new Set(cleanRows.flatMap(r => r.items.map(i => i.ref)))
  const hiddenSet = new Set(cleanHidden)
  const autoRows: LayoutRow[] = [...compMap.keys()]
    .filter(ref => !mentionedRefs.has(ref) && !hiddenSet.has(ref))
    .map(ref => ({ id: rid(), items: [{ ref }] }))

  const effectiveRows = [...cleanRows, ...autoRows]

  function renderItem(ref: string) {
    if (isComponentRef(ref)) {
      const compData = compMap.get(ref)
      if (!compData) return <div className="text-[--text-3] text-sm italic">Unknown: {ref}</div>

      const itemConfig = effectiveRows.flatMap(r => r.items).find(i => i.ref === ref)
      const renderCtx = itemConfig?.context ?? value.context ?? 'react'

      return (
        <RenderContext name={renderCtx}>
          <Render value={compData} />
        </RenderContext>
      )
    }

    const child = childMap.get(ref)
    if (!child) return <div className="text-[--text-3] text-sm italic">Missing child: {ref}</div>

    const itemConfig = effectiveRows.flatMap(r => r.items).find(i => i.ref === ref)
    const renderCtx = itemConfig?.context ?? value.context ?? 'react'

    return (
      <RenderContext name={renderCtx}>
        <Render value={child} />
      </RenderContext>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setEditable(!editable)}
        className="absolute top-1 right-1 z-30 p-1 rounded hover:bg-[--card] text-[--text-3]"
      >
        {editable ? '\u2715' : '\u2699'}
      </button>

      <RowColGrid
        rows={effectiveRows}
        hidden={cleanHidden}
        gap={value.gap}
        padding={value.padding}
        context={value.context}
        renderItem={renderItem}
        editable={editable}
        onChange={(patch) => onChange?.(patch)}
      />
    </div>
  )
}

register('layout.row-col', 'react', RowColLayoutView)

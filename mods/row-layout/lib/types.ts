import type { ReactNode } from 'react'

export type LayoutItem = {
  ref: string
  context?: string
  padding?: string
}

export type LayoutRow = {
  id: string
  items: LayoutItem[]
  grid?: string
  gap?: string
}

export type RowColGridProps = {
  gap?: string
  padding?: string
  context?: string
  rows: LayoutRow[]
  hidden: string[]
  renderItem: (ref: string) => ReactNode
  editable?: boolean
  onChange?: (patch: Partial<{ rows: LayoutRow[]; hidden: string[]; gap: string; padding: string; context: string }>) => void
}

export const isComponentRef = (ref: string) => ref.startsWith('#')
export const componentKey = (ref: string) => ref.slice(1)

import { type ComponentData, isComponent, type NodeData, register } from '@treenity/core';
import type { TypeSchema } from '@treenity/core/schema/types';
import { useCurrentNode } from '@treenity/react/context';
import { useChildren } from '@treenity/react/hooks';
import { useSchema } from '@treenity/react/schema-loader';
import React, { useMemo, useState } from 'react';
import type { UITable } from './types';

// ── Field tree types ──

type FieldNode = {
  key: string;
  label: string;
  type?: string;
  children?: FieldNode[];
};

// ── Build field tree from schema + data sample ──

function buildFieldTree(schema: TypeSchema | null, sample: Record<string, unknown>[]): FieldNode[] {
  const nodes: FieldNode[] = [];
  const seen = new Set<string>();

  if (schema?.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (key.startsWith('$')) continue;
      seen.add(key);
      nodes.push({ key, label: (prop as any).title || key });
    }
  }

  for (const row of sample.slice(0, 10)) {
    for (const [key, val] of Object.entries(row)) {
      if (key.startsWith('$') || seen.has(key)) continue;
      seen.add(key);

      if (isComponent(val)) {
        const children = Object.keys(val)
          .filter(k => !k.startsWith('$'))
          .map(k => ({ key: `${key}.${k}`, label: k }));
        nodes.push({ key, label: key, type: val.$type, children });
      } else {
        nodes.push({ key, label: key });
      }
    }
  }

  return nodes;
}

// ── Helpers ──

function resolveDisplayType(child: NodeData, field: string): string {
  if (!field) return child.$type;
  const val = (child as any)[field];
  return val?.$type ?? '';
}

// ── Edit View ──

function TableEditView({ value, onChange }: { value: ComponentData; onChange?: (next: ComponentData) => void }) {
  const node = useCurrentNode();
  const children = useChildren(node.$path, { watch: true, limit: 1000 });

  const state = value as unknown as UITable;
  const emit = (patch: Partial<UITable>) => {
    if (!onChange) return;
    onChange({ ...value, ...patch } as ComponentData);
  };

  // Detect types
  const { types, typeMap } = useMemo(() => {
    const map = new Map<string, NodeData[]>();
    for (const child of children) {
      const dt = resolveDisplayType(child, state.field ?? '');
      if (!dt) continue;
      const arr = map.get(dt) ?? [];
      arr.push(child);
      map.set(dt, arr);
    }
    return { typeMap: map, types: [...map.keys()] };
  }, [children, state.field]);

  const activeType = state.displayType && types.includes(state.displayType)
    ? state.displayType
    : types[0] ?? '';

  const sample = useMemo(() => {
    const matched = typeMap.get(activeType) ?? [];
    return matched.slice(0, 10) as Record<string, unknown>[];
  }, [typeMap, activeType]);

  const schema = useSchema(activeType);
  const fieldTree = useMemo(() => buildFieldTree(schema, sample), [schema, sample]);

  const savedColumns = state.columns?.[activeType] ?? [];
  const hasCustomColumns = savedColumns.length > 0;

  const toggleField = (key: string, label: string) => {
    let cols = savedColumns.length > 0 ? [...savedColumns] : fieldTree.map(f => ({ field: f.key, label: f.label, visible: true }));
    const idx = cols.findIndex(c => c.field === key);
    if (idx >= 0) {
      cols[idx] = { ...cols[idx], visible: !cols[idx].visible };
    } else {
      cols.push({ field: key, label, visible: true });
    }
    emit({ columns: { ...state.columns, [activeType]: cols } });
  };

  const resetColumns = () => {
    const next = { ...state.columns };
    delete next[activeType];
    emit({ columns: next });
  };

  const isFieldVisible = (key: string) => {
    if (!hasCustomColumns) return true;
    const col = savedColumns.find(c => c.field === key);
    return col?.visible !== false;
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <span className="text-zinc-400 w-20">Page size</span>
          <input
            type="number"
            min={1}
            max={1000}
            className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
            value={state.pageSize ?? 25}
            onChange={e => emit({ pageSize: Number(e.target.value) || 25 })}
          />
        </label>

        <label className="flex items-center gap-2">
          <span className="text-zinc-400 w-20">Field</span>
          <input
            type="text"
            placeholder="(node itself)"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 placeholder:text-zinc-600"
            value={state.field ?? ''}
            onChange={e => emit({ field: e.target.value })}
          />
        </label>

        {types.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="text-zinc-400 w-20">Type</span>
            <select
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300"
              value={activeType}
              onChange={e => emit({ displayType: e.target.value })}
            >
              {types.map(t => (
                <option key={t} value={t}>{t} ({typeMap.get(t)?.length ?? 0})</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400 font-medium">Columns{activeType ? ` — ${activeType}` : ''}</span>
          {hasCustomColumns && (
            <button
              onClick={resetColumns}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              reset
            </button>
          )}
        </div>

        {fieldTree.length === 0 && (
          <div className="text-zinc-500 py-2">No fields detected</div>
        )}

        <div className="flex flex-col gap-0.5">
          {fieldTree.map(field => (
            <div key={field.key}>
              <div className="flex items-center gap-1.5 py-0.5 hover:bg-zinc-800/50 rounded px-1">
                {field.children ? (
                  <button
                    onClick={() => toggleExpand(field.key)}
                    className="text-zinc-500 w-4 text-center"
                  >
                    {expanded.has(field.key) ? '▾' : '▸'}
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={isFieldVisible(field.key)}
                    onChange={() => toggleField(field.key, field.label)}
                    className="w-auto rounded border-zinc-600"
                  />
                  <span className="text-zinc-300">{field.label}</span>
                  {field.type && (
                    <span className="text-zinc-600 text-[10px]">{field.type}</span>
                  )}
                </label>
              </div>

              {field.children && expanded.has(field.key) && (
                <div className="ml-5 flex flex-col gap-0.5">
                  {field.children.map(sub => (
                    <label key={sub.key} className="flex items-center gap-1.5 py-0.5 px-1 hover:bg-zinc-800/50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isFieldVisible(sub.key)}
                        onChange={() => toggleField(sub.key, sub.label)}
                        className="w-auto rounded border-zinc-600"
                      />
                      <span className="text-zinc-300">{sub.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

register('ui.table', 'react:edit', TableEditView as any);

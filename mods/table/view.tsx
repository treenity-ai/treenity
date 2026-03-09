import { type ComponentData, isComponent, type NodeData, register } from '@treenity/core';
import type { TypeSchema } from '@treenity/core/schema/types';
import { Render, RenderContext, type ViewCtx } from '@treenity/react/context';
import { useChildren } from '@treenity/react/hooks';
import { useSchema } from '@treenity/react/schema-loader';
import React, { useMemo } from 'react';
import type { ColumnConfig, UITable } from './types';
import { useDebouncedSync } from './use-debounced-sync';

// ── Helpers ──

function resolveField(child: NodeData, field: string): Record<string, unknown> {
  if (!field) return child;
  const val = (child as any)[field];
  if (val && typeof val === 'object') return val;
  return child;
}

function resolveDisplayType(field: string, comp: Record<string, unknown>): string {
  if (!field) return (comp as any).$type ?? '';
  const val = comp as any;
  return val.$type ?? '';
}

function cellValue(row: Record<string, unknown>, field: string): unknown {
  return row[field];
}

function formatCell(val: unknown): string {
  if (val == null || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function CellValue({ value }: { value: unknown }) {
  if (isComponent(value)) return <Render value={value} />;
  return <>{formatCell(value)}</>;
}

function buildColumnsFromSchema(schema: TypeSchema): ColumnConfig[] {
  if (!schema.properties) return [];
  return Object.entries(schema.properties)
    .filter(([k]) => !k.startsWith('$'))
    .map(([field, prop]) => ({
      field,
      label: (prop as any).title || field,
      visible: true,
    }));
}

function buildColumnsFromData(rows: Record<string, unknown>[]): ColumnConfig[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 20)) {
    for (const k of Object.keys(row)) {
      if (!k.startsWith('$')) keys.add(k);
    }
  }
  return [...keys].map(field => ({ field, label: field, visible: true }));
}

// ── Table View ──

const TABLE_DEFAULTS: UITable = { displayType: '', field: '', pageSize: 25, page: 0, sort: '', sortDir: 'asc', columns: {} };

function TableView({ value, ctx }: { value: ComponentData; ctx?: ViewCtx | null }) {
  if (!ctx?.node) throw new Error('TableView: no node context');
  const node = ctx.node;
  const componentKey = useMemo(() => {
    for (const [k, v] of Object.entries(node)) {
      if (v === value) return k;
    }
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object' && (v as any).$type === 'ui.table') return k;
    }
    return 'table';
  }, [node, value]);

  const [state, update] = useDebouncedSync<UITable>(node, componentKey, TABLE_DEFAULTS);
  const children = useChildren(node.$path, { watch: true, limit: 1000 });

  // Collect unique types from children (resolved through field)
  const { typeMap, types } = useMemo(() => {
    const map = new Map<string, NodeData[]>();
    for (const child of children) {
      const resolved = resolveField(child, state.field);
      const dt = resolveDisplayType(state.field, resolved);
      if (!dt) continue;
      const arr = map.get(dt) ?? [];
      arr.push(child);
      map.set(dt, arr);
    }
    return { typeMap: map, types: [...map.keys()] };
  }, [children, state.field]);

  // Active display type
  const activeType = state.displayType && types.includes(state.displayType)
    ? state.displayType
    : types[0] ?? '';

  // Rows for active type
  const rawRows = useMemo(() => {
    const matched = typeMap.get(activeType) ?? [];
    return matched.map(child => ({
      $path: child.$path,
      data: resolveField(child, state.field),
    }));
  }, [typeMap, activeType, state.field]);

  // Columns: from saved config, schema, or data
  const schema = useSchema(activeType);
  const columns = useMemo(() => {
    const saved = state.columns[activeType];
    if (saved?.length) return saved.filter(c => c.visible !== false);

    if (schema) return buildColumnsFromSchema(schema);
    if (rawRows.length) return buildColumnsFromData(rawRows.map(r => r.data));
    return [];
  }, [state.columns, activeType, schema, rawRows]);

  // Filter
  const filtered = useMemo(() => {
    return rawRows.filter(row => {
      for (const col of columns) {
        if (!col.filter) continue;
        const val = formatCell(cellValue(row.data, col.field));
        if (!val.toLowerCase().includes(col.filter.toLowerCase())) return false;
      }
      return true;
    });
  }, [rawRows, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!state.sort) return filtered;
    const dir = state.sortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = cellValue(a.data, state.sort);
      const vb = cellValue(b.data, state.sort);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, state.sort, state.sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / (state.pageSize || 25)));
  const page = Math.min(state.page || 0, totalPages - 1);
  const pageRows = sorted.slice(page * state.pageSize, (page + 1) * state.pageSize);

  // Handlers
  const toggleSort = (field: string) => {
    if (state.sort === field) {
      update({ sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' } as Partial<UITable>);
    } else {
      update({ sort: field, sortDir: 'asc' } as Partial<UITable>);
    }
  };

  const setColumnFilter = (field: string, filter: string) => {
    const current = (state.columns ?? {})[activeType] ?? columns;
    const next = current.map(c => c.field === field ? { ...c, filter } : c);
    update({ columns: { ...(state.columns ?? {}), [activeType]: next }, page: 0 } as Partial<UITable>);
  };

  const setPage = (p: number) => update({ page: p } as Partial<UITable>);

  const setDisplayType = (dt: string) => {
    update({ displayType: dt, page: 0 } as Partial<UITable>);
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {types.length > 1 && types.map(t => (
          <button
            key={t}
            onClick={() => setDisplayType(t)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              t === activeType
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {t} <span className="text-zinc-500">({typeMap.get(t)?.length ?? 0})</span>
          </button>
        ))}

        <span className="ml-auto text-xs text-zinc-500">
          {sorted.length} row{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {columns.length > 0 ? (
        <RenderContext name="react:compact:cell">
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  {columns.map(col => (
                    <th
                      key={col.field}
                      className="text-left px-2 py-1.5 font-medium text-zinc-400 cursor-pointer hover:text-zinc-200 select-none"
                      onClick={() => toggleSort(col.field)}
                    >
                      <span>{col.label ?? col.field}</span>
                      {state.sort === col.field && (
                        <span className="ml-1 text-blue-400">
                          {state.sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-zinc-800/50">
                  {columns.map(col => (
                    <th key={col.field} className="px-1 py-1">
                      <input
                        type="text"
                        placeholder="filter"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                        value={col.filter ?? ''}
                        onChange={e => setColumnFilter(col.field, e.target.value)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => (
                  <tr
                    key={row.$path}
                    className="border-b border-zinc-800/30 hover:bg-zinc-800/30 transition-colors"
                  >
                    {columns.map(col => (
                      <td key={col.field} className="px-2 py-1.5 text-zinc-300 truncate max-w-[300px]">
                        <CellValue value={cellValue(row.data, col.field)} />
                      </td>
                    ))}
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="px-2 py-4 text-center text-zinc-500">
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </RenderContext>
      ) : (
        <div className="text-zinc-500 py-4 text-center">No children or schema</div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className="px-2 py-0.5 rounded border border-zinc-700 disabled:opacity-30 hover:border-zinc-500 transition-colors"
          >
            Prev
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-0.5 rounded border border-zinc-700 disabled:opacity-30 hover:border-zinc-500 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

register('ui.table', 'react', TableView as any);

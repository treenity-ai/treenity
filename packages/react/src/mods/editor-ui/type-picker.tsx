import { type NodeData, isOfType } from '@treenity/core/core';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { trpc } from '#trpc';

export type TypeInfo = { type: string; label: string; description: string };

export async function loadTypes(): Promise<TypeInfo[]> {
  const { items } = (await trpc.getChildren.query({ path: '/sys/types', limit: 0, depth: 99 })) as {
    items: NodeData[];
    total: number;
  };
  return items
    .filter((n) => isOfType(n, 'type'))
    .map((n) => {
      const schema = n.schema as { $type: string; title?: string; description?: string } | undefined;
      const typeName = n.$path.slice('/sys/types/'.length).replace(/\//g, '.');
      return {
        type: typeName,
        label: schema?.title ?? typeName,
        description: schema?.description ?? '',
      };
    });
}

type GroupNode = {
  name: string;
  types: TypeInfo[];
  children: Map<string, GroupNode>;
};

function buildTree(types: TypeInfo[]): GroupNode {
  const root: GroupNode = { name: '', types: [], children: new Map() };

  for (const t of types) {
    const dotIdx = t.type.indexOf('.');
    if (dotIdx === -1) {
      root.types.push(t);
      continue;
    }

    const ns = t.type.slice(0, dotIdx);
    if (!root.children.has(ns)) {
      root.children.set(ns, { name: ns, types: [], children: new Map() });
    }
    root.children.get(ns)!.types.push(t);
  }

  const byDots = (a: TypeInfo, b: TypeInfo) => {
    const da = a.type.split('.').length;
    const db = b.type.split('.').length;
    return da !== db ? da - db : a.type.localeCompare(b.type);
  };
  root.types.sort(byDots);
  for (const g of root.children.values()) g.types.sort(byDots);

  return root;
}

function matchesFilter(t: TypeInfo, lf: string): boolean {
  return (
    t.type.toLowerCase().includes(lf) ||
    t.label.toLowerCase().includes(lf) ||
    t.description.toLowerCase().includes(lf)
  );
}

function TypeItem({
  t,
  selected,
  onSelect,
}: {
  t: TypeInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`type-picker-item${selected ? ' active' : ''}`}
      onClick={onSelect}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="type-name">{t.type}</span>
          {t.label !== t.type && <span className="type-label">{t.label}</span>}
        </div>
        {t.description && (
          <span className="text-[11px] text-[--text-3] leading-tight">{t.description}</span>
        )}
      </div>
    </div>
  );
}

function GroupSection({
  group,
  filter,
  selectedType,
  onSelect,
  defaultOpen,
}: {
  group: GroupNode;
  filter: string;
  selectedType: string | null;
  onSelect: (type: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const lf = filter.toLowerCase();
  const visibleTypes = lf ? group.types.filter((t) => matchesFilter(t, lf)) : group.types;

  useEffect(() => {
    if (lf && visibleTypes.length > 0) setOpen(true);
  }, [lf, visibleTypes.length]);

  if (visibleTypes.length === 0) return null;

  return (
    <div className="mb-1">
      <div
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[--text-3] uppercase tracking-wider cursor-pointer select-none hover:text-[--text-2]"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {group.name || 'core'}
        <span className="font-normal text-[10px] ml-1 opacity-60">{visibleTypes.length}</span>
      </div>
      {open && visibleTypes.map((t) => (
        <TypeItem key={t.type} t={t} selected={selectedType === t.type} onSelect={() => onSelect(t.type)} />
      ))}
    </div>
  );
}

export function TypePicker({
  onSelect,
  onCancel,
  title = 'Create Node',
  nameLabel = 'Node name',
  action = 'Create',
  autoName = false,
}: {
  onSelect: (name: string, type: string) => void;
  onCancel: () => void;
  title?: string;
  nameLabel?: string;
  action?: string;
  autoName?: boolean;
}) {
  const [types, setTypes] = useState<TypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [nameManual, setNameManual] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTypes()
      .then(setTypes)
      .catch((err) => {
        console.error('Failed to load types:', err);
        setError('Failed to load types');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  function handleSelectType(type: string) {
    setSelectedType(type);
    if (autoName && !nameManual) {
      const lastSegment = type.includes('.') ? type.slice(type.lastIndexOf('.') + 1) : type;
      setName(lastSegment);
    }
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  const tree = buildTree(types);
  const hasFilter = filter.length > 0;

  const groups = [...tree.children.values()];
  if (tree.types.length > 0) {
    groups.push({ name: '', types: tree.types, children: new Map() });
  }

  function handleSubmit() {
    if (name && selectedType) onSelect(name, selectedType);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  return (
    <div className="type-picker-overlay" onClick={onCancel}>
      <div className="type-picker" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="type-picker-header">{title}</div>

        <div className="type-picker-search">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[--text-3] pointer-events-none" />
            <input
              ref={filterRef}
              className="pl-7"
              placeholder="Search types..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <input
            ref={nameRef}
            placeholder={nameLabel}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameManual(true); }}
          />
        </div>

        <div className="type-picker-list">
          {groups.map((g) => (
            <GroupSection
              key={g.name || '__core'}
              group={g}
              filter={filter}
              selectedType={selectedType}
              onSelect={handleSelectType}
              defaultOpen={hasFilter || groups.length <= 3}
            />
          ))}
          {loading && (
            <div className="p-3 text-[--text-3] text-[13px]">Loading types...</div>
          )}
          {error && (
            <div className="p-3 text-[--danger] text-[13px]">{error}</div>
          )}
          {!loading && !error && groups.length === 0 && (
            <div className="p-3 text-[--text-3] text-[13px]">No types found</div>
          )}
        </div>

        <div className="type-picker-footer">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!name || !selectedType}
            onClick={handleSubmit}
          >
            {action}
            {name ? ` "${name}"` : ''}
            {selectedType ? ` as ${selectedType}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

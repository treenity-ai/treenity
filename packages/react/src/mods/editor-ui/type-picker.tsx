import { Button } from '#components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '#components/ui/command';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { trpc } from '#trpc';
import { isOfType, type NodeData } from '@treenity/core';
import { useEffect, useMemo, useRef, useState } from 'react';

export type TypeInfo = { type: string; label: string; description: string };

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function matchTokens(text: string, sTokens: string[]): number {
  const vTokens = text.split(/[.\s\-_]+/).filter(Boolean);
  let total = 0;
  for (const st of sTokens) {
    let best = 0;
    for (const vt of vTokens) {
      if (vt.startsWith(st)) { best = Math.max(best, 0.9); continue; }
      if (vt.includes(st)) { best = Math.max(best, 0.7); continue; }
      if (st.length >= 2) {
        const maxDist = st.length <= 3 ? 1 : Math.floor(st.length / 3);
        if (editDistance(st, vt) <= maxDist) { best = Math.max(best, 0.5); continue; }
        if (vt.length > st.length && editDistance(st, vt.slice(0, st.length + 1)) <= maxDist) {
          best = Math.max(best, 0.4);
        }
      }
    }
    total += best;
  }
  return sTokens.length > 0 ? total / sTokens.length : 0;
}

function typeFilter(value: string, search: string, keywords?: string[]): number {
  const s = search.toLowerCase().trim();
  if (!s) return 1;
  const v = value.toLowerCase();

  // Exact substring in type name — top priority
  if (v.includes(s)) return 1;

  const sTokens = s.split(/\s+/).filter(Boolean);

  // Match against type name (high weight)
  const typeScore = matchTokens(v, sTokens);
  if (typeScore >= 0.3) return 0.5 + typeScore * 0.5;

  // Match against keywords (label + description, lower weight)
  if (keywords?.length) {
    const kwText = keywords.join(' ').toLowerCase();
    if (kwText.includes(s)) return 0.5;
    const kwScore = matchTokens(kwText, sTokens);
    if (kwScore >= 0.3) return kwScore * 0.4;
  }

  return 0;
}

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

function groupByNamespace(types: TypeInfo[]): Map<string, TypeInfo[]> {
  const groups = new Map<string, TypeInfo[]>();
  for (const t of types) {
    const dotIdx = t.type.indexOf('.');
    const ns = dotIdx === -1 ? 'core' : t.type.slice(0, dotIdx);
    if (!groups.has(ns)) groups.set(ns, []);
    groups.get(ns)!.push(t);
  }
  return groups;
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
  const [name, setName] = useState('');
  const [nameManual, setNameManual] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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

  const visibleTypes = useMemo(() => {
    const s = search.trim();
    if (!s) return types;
    return types
      .map((t) => ({ ...t, score: typeFilter(t.type, s, [t.label, t.description].filter(Boolean)) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [search, types]);

  function handleSelectType(type: string) {
    setSelectedType(type);
    if (autoName && !nameManual) {
      const lastSegment = type.includes('.') ? type.slice(type.lastIndexOf('.') + 1) : type;
      setName(lastSegment);
    }
    requestAnimationFrame(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    });
  }

  function handleSubmit() {
    if (name && selectedType) onSelect(name, selectedType);
  }

  const groups = groupByNamespace(visibleTypes);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="p-0 gap-0 max-w-[380px] overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
        </DialogHeader>

        <Command className="rounded-none border-none" shouldFilter={false}>
          <CommandInput placeholder="Search types..." onValueChange={setSearch} />
          <CommandList className="max-h-[280px]">
            {loading && <div className="p-3 text-muted-foreground text-[13px]">Loading types...</div>}
            {error && <div className="p-3 text-destructive text-[13px]">{error}</div>}
            {!loading && visibleTypes.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">No types found</div>
            )}
            {[...groups.entries()].map(([ns, items]) => (
              <CommandGroup key={ns} heading={ns}>
                {items.map((t) => (
                  <CommandItem
                    key={t.type}
                    value={t.type}
                    onSelect={() => handleSelectType(t.type)}
                    className={selectedType === t.type ? 'bg-accent text-accent-foreground' : ''}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px]">{t.type}</span>
                        {t.label !== t.type && <span className="text-muted-foreground text-[12px]">{t.label}</span>}
                      </div>
                      {t.description && (
                        <span className="text-[11px] text-muted-foreground/60 leading-tight">{t.description}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>

        <div className="px-4 py-3 border-t border-border">
          <Input
            ref={nameRef}
            className="h-8 text-sm"
            placeholder={nameLabel}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameManual(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
          />
        </div>

        <DialogFooter className="px-4 pb-4">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!name || !selectedType} onClick={handleSubmit}>
            {action}
            {name ? ` "${name}"` : ''}
            {selectedType ? ` as ${selectedType}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

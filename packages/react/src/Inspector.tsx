// Inspector — view + edit panel for selected node (Unity-style inspector)
// Shell only: delegates rendering to registered views, provides generic edit UI

import './Inspector.css';
import { ConfirmDialog } from '#components/ConfirmDialog';
import { PathBreadcrumb } from '#components/PathBreadcrumb';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible';
import { ScrollArea } from '#components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { NodeProvider, Render, RenderContext } from '#context';
import { toPlain } from '#lib/to-plain';
import { FieldLabel, RefEditor } from '#mods/editor-ui/FieldLabel';
import {
  getActions,
  getActionSchema,
  getComponents,
  getPlainFields,
  getSchema,
  getViewContexts,
  pickDefaultContext,
} from '#mods/editor-ui/node-utils';
import { type ComponentData, type GroupPerm, isRef, type NodeData, resolve } from '@treenity/core';
import type { TypeSchema } from '@treenity/core/schema/types';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { proxy, snapshot, useSnapshot } from 'valtio';
import { AclEditor } from './AclEditor';
import * as cache from './cache';
import { ErrorBoundary } from './ErrorBoundary';
import { set, usePath } from './hooks';
import { useSchema } from './schema-loader';
import { trpc } from './trpc';

type AnyClass = { new(): Record<string, unknown> };

function EditPanel({ node, type, data, onData }: {
  node: NodeData;
  type: string;
  data: Record<string, unknown>;
  onData: (d: Record<string, unknown>) => void;
}) {
  return (
    <NodeProvider value={node}>
      <RenderContext name="react:edit">
        <Render
          value={{ $type: type, ...data } as ComponentData}
          onChange={(next: ComponentData) => {
            const d: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(next as Record<string, unknown>)) {
              if (k === '$type' || k === '$path') continue;
              d[k] = v;
            }
            onData(d);
          }}
        />
      </RenderContext>
    </NodeProvider>
  );
}

type Props = {
  path: string | null;
  currentUserId?: string;
  onDelete: (path: string) => void;
  onAddComponent: (path: string) => void;
  onSelect: (path: string) => void;
  onSetRoot?: (path: string) => void;
  toast: (msg: string) => void;
};


// Pretty-print action result value
function ResultView({ value }: { value: unknown }) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object')
    return <span className="font-mono text-[11px]">{String(value)}</span>;

  // Object/array with typed $type → render via Render
  if ('$type' in (value as any)) {
    return <Render value={value as ComponentData} />;
  }

  // Plain object — key/value pairs
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-muted-foreground text-[11px]">empty</span>;

  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-[11px]">
          <span className="text-muted-foreground shrink-0">{k}</span>
          <span className="font-mono text-foreground/80 truncate">
            {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')}
          </span>
        </div>
      ))}
    </div>
  );
}

// Action pills — compact action buttons that expand on click
function ActionCardList({
  path,
  componentName,
  compType,
  toast,
  onActionComplete,
}: {
  path: string;
  componentName: string;
  compType: string;
  compData: Record<string, unknown>;
  toast: (msg: string) => void;
  onActionComplete?: () => void;
}) {
  const schema = useSchema(compType);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paramsText, setParamsText] = useState<Record<string, string>>({});
  const [schemaData, setSchemaData] = useState<Record<string, Record<string, unknown>>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; value: unknown }>>({});
  const [resultMode, setResultMode] = useState<Record<string, 'pretty' | 'json'>>({});

  if (schema === undefined) return null;

  const actions = getActions(compType, schema);
  if (actions.length === 0) return null;

  async function run(a: string) {
    setRunning(a);
    try {
      const actionSchema = getActionSchema(compType, a);
      let data: unknown = {};
      if (actionSchema) {
        data = schemaData[a] ?? {};
      } else {
        const raw = (paramsText[a] ?? '').trim();
        if (raw && raw !== '{}') {
          try { data = JSON.parse(raw); }
          catch { toast('Invalid JSON params'); setRunning(null); return; }
        }
      }
      const result = await trpc.execute.mutate({ path, key: componentName, action: a, data });
      const fresh = (await trpc.get.query({ path, watch: true })) as NodeData | undefined;
      if (fresh) cache.put(fresh);
      onActionComplete?.();
      setResults((prev) => ({ ...prev, [a]: { ok: true, value: result } }));
      setExpanded(a);
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [a]: { ok: false, value: e instanceof Error ? e.message : String(e) },
      }));
      setExpanded(a);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mt-2.5 pt-2.5 border-t border-border">
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <Button
            key={a}
            variant="outline"
            size="sm"
            className={`h-6 rounded-full font-mono text-[11px] text-green-400 border-green-400/30 hover:bg-green-400/10 hover:border-green-400/50 ${expanded === a ? 'bg-green-400/15 border-green-400' : ''} ${running === a ? 'opacity-60 pointer-events-none' : ''}`}
            onClick={() => setExpanded(expanded === a ? null : a)}
          >
            {running === a ? '...' : a}
            {results[a] && !results[a].ok && expanded !== a && (
              <span className="ml-1 text-destructive">!</span>
            )}
            {results[a]?.ok && expanded !== a && (
              <span className="ml-1 text-primary/60">✓</span>
            )}
          </Button>
        ))}
      </div>

      {expanded && (() => {
        const a = expanded;
        const actionSchema = getActionSchema(compType, a);
        const hasParams = actionSchema !== null && Object.keys(actionSchema.properties).length > 0;
        const noParams = actionSchema !== null && Object.keys(actionSchema.properties).length === 0;
        const result = results[a];
        const mode = resultMode[a] ?? 'pretty';

        return (
          <div className="mt-2 p-2 px-2.5 border border-border rounded-md bg-card">
            {/* Params section */}
            {hasParams && (
              <div className="flex flex-col gap-1.5 mb-2">
                {Object.entries(actionSchema!.properties).map(([field, prop]) => {
                  const p = prop as { type: string; title?: string; format?: string };
                  const val = (schemaData[a] ?? {})[field];
                  const setField = (v: unknown) =>
                    setSchemaData((prev) => ({
                      ...prev,
                      [a]: { ...(prev[a] ?? {}), [field]: v },
                    }));
                  return (
                    <div key={field} className="flex flex-col gap-0.5">
                      <label>{p.title ?? field}</label>
                      {p.type === 'number' || p.format === 'number' ? (
                        <input type="number" value={String(val ?? 0)}
                          onChange={(e) => setField(Number(e.target.value))} />
                      ) : p.type === 'boolean' ? (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={!!val} className="w-auto"
                            onChange={(e) => setField(e.target.checked)} />
                          <span className="text-[11px]">{val ? 'true' : 'false'}</span>
                        </label>
                      ) : (
                        <input value={String(val ?? '')}
                          onChange={(e) => setField(e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Free-form JSON params for untyped actions */}
            {!hasParams && !noParams && (
              <textarea
                className="min-h-12 text-[11px] mb-2"
                value={paramsText[a] ?? '{}'}
                onChange={(e) => setParamsText((prev) => ({ ...prev, [a]: e.target.value }))}
                spellCheck={false}
                rows={2}
              />
            )}

            {/* Run button */}
            <Button
              size="sm"
              className="h-6 rounded-full text-[11px] font-medium"
              disabled={running !== null}
              onClick={() => run(a)}
            >
              {running === a ? '...' : '▶'} {a}
            </Button>

            {/* Result */}
            {result && (
              <div className={`mt-2 p-1.5 px-2 rounded-md bg-background border ${result.ok ? 'border-border' : 'border-destructive/40 bg-destructive/5'}`}>
                {!result.ok ? (
                  <span className="text-destructive font-mono text-[11px]">{String(result.value)}</span>
                ) : result.value === undefined || result.value === null ? (
                  <span className="text-primary text-[11px]">✓ done</span>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Result</span>
                      {typeof result.value === 'object' && (
                        <div className="flex gap-0.5">
                          <Button
                            variant={mode === 'pretty' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-5 px-1.5 text-[10px] rounded-full"
                            onClick={() => setResultMode((p) => ({ ...p, [a]: 'pretty' }))}
                          >View</Button>
                          <Button
                            variant={mode === 'json' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-5 px-1.5 text-[10px] rounded-full"
                            onClick={() => setResultMode((p) => ({ ...p, [a]: 'json' }))}
                          >JSON</Button>
                        </div>
                      )}
                    </div>
                    {mode === 'json' ? (
                      <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap break-all leading-relaxed">
                        {JSON.stringify(result.value, null, 2)}
                      </pre>
                    ) : (
                      <ResultView value={result.value} />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}



function NodeCard({
  path,
  type,
  onChangeType,
}: {
  path: string;
  type: string;
  onChangeType: (t: string) => void;
}) {
  return (
    <Collapsible className="border-t border-border mt-2 pt-0.5 first:border-t-0 first:mt-0 first:pt-0">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none">
        <span>Node</span>
        <span className="flex items-center gap-2 normal-case tracking-normal font-normal text-[11px] font-mono text-foreground/50">
          {path}
          <span className="text-primary">{type}</span>
          <ChevronRight className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="py-0.5 pb-2.5">
          <div className="field">
            <label>$path</label>
            <input value={path} readOnly />
          </div>
          <div className="field">
            <label>$type</label>
            <input value={type} onChange={(e) => onChangeType(e.target.value)} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}


export function Inspector({ path, currentUserId, onDelete, onAddComponent, onSelect, onSetRoot, toast }: Props) {
  const node = usePath(path);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [st] = useState(() => proxy({
    context: 'react',
    editing: false,
    nodeType: '',
    compTexts: {} as Record<string, string>,
    compData: {} as Record<string, Record<string, unknown>>,
    plainData: {} as Record<string, unknown>,
    tab: 'properties' as 'properties' | 'json',
    jsonText: '',
    collapsed: { $node: true } as Record<string, boolean>,
    aclOwner: '',
    aclRules: [] as GroupPerm[],
    dirty: false,
    stale: false,
    syncedPath: null as string | null,
    syncedRev: null as unknown,
  }));
  const snap = useSnapshot(st);

  function syncFromNode(n: NodeData) {
    st.nodeType = n.$type;
    st.aclOwner = (n.$owner as string) ?? '';
    st.aclRules = n.$acl ? [...(n.$acl as GroupPerm[])] : [];
    const texts: Record<string, string> = {};
    const cdata: Record<string, Record<string, unknown>> = {};
    for (const [name, comp] of getComponents(n)) {
      texts[name] = JSON.stringify(comp, null, 2);
      const d: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(comp)) {
        if (!k.startsWith('$')) d[k] = v;
      }
      cdata[name] = d;
    }
    st.compTexts = texts;
    st.compData = cdata;
    st.plainData = getPlainFields(n);
    st.jsonText = JSON.stringify(n, null, 2);
    st.tab = 'properties';
  }

  useEffect(() => {
    if (!node) return;

    const pathChanged = node.$path !== st.syncedPath;
    if (pathChanged) {
      st.context = pickDefaultContext(node.$type);
      syncFromNode(node);
      st.syncedPath = node.$path;
      st.syncedRev = node.$rev;
      st.dirty = false;
      st.stale = false;
      return;
    }

    if (node.$rev !== st.syncedRev) {
      if (st.dirty) {
        st.stale = true;
      } else {
        syncFromNode(node);
        st.syncedRev = node.$rev;
      }
    }
  }, [node?.$path, node?.$rev]);

  function handleReset() {
    if (!node) return;
    const current = cache.get(node.$path) ?? node;
    syncFromNode(current);
    st.syncedRev = current.$rev;
    st.dirty = false;
    st.stale = false;
  }

  if (!node) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/40">
          <div className="text-[32px] opacity-30">&#9741;</div>
          <p>Select a node to inspect</p>
        </div>
      </div>
    );
  }

  const nodeName = node.$path === '/' ? '/' : node.$path.slice(node.$path.lastIndexOf('/') + 1);
  const components = getComponents(node);
  const viewContexts = getViewContexts(node.$type, node);
  const schemaHandler = resolve(node.$type, 'schema');
  const schema = schemaHandler ? (schemaHandler() as TypeSchema) : null;

  // Main component: when the node IS the component (its $type has a registered class).
  // Show the class's fields (with defaults as fallback for unset fields).
  const mainCompCls = resolve(node.$type, 'class') as AnyClass | null;
  const mainCompDefaults = mainCompCls ? new mainCompCls() : null;

  async function handleSave() {
    if (!node) return;
    const s = toPlain(snapshot(st));
    let toSave: NodeData;
    if (s.tab === 'json') {
      try {
        toSave = JSON.parse(s.jsonText);
      } catch {
        toast('Invalid JSON');
        return;
      }
    } else {
      toSave = { $path: node.$path, $type: s.nodeType, ...s.plainData } as NodeData;
      if (s.aclOwner) toSave.$owner = s.aclOwner;
      if (s.aclRules.length > 0) toSave.$acl = [...s.aclRules] as GroupPerm[];
      for (const [name, comp] of components) {
        const ctype = (comp as ComponentData).$type;
        const cschema = getSchema(ctype);
        const cd = s.compData[name];
        if ((cschema || (cd && Object.keys(cd).length > 0)) && cd) {
          toSave[name] = { $type: ctype, ...cd };
        } else {
          const text = s.compTexts[name];
          if (text === undefined) continue;
          try {
            toSave[name] = JSON.parse(text);
          } catch {
            toast(`Invalid JSON in component: ${name}`);
            return;
          }
        }
      }
    }
    await set(toSave);
    const fresh = cache.get(node.$path);
    if (fresh) {
      syncFromNode(fresh);
      st.syncedRev = fresh.$rev;
    }
    st.dirty = false;
    st.stale = false;
    toast('Saved');
  }

  function handleAdd() {
    if (!node) return;
    onAddComponent(node.$path);
  }

  function handleRemoveComponent(name: string) {
    if (!node) return;
    const next = { ...node };
    delete next[name];
    set(next);
  }

  function toggleCollapse(name: string) {
    st.collapsed[name] = !st.collapsed[name];
  }

  return (
    <div className="editor">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-border bg-card shrink-0">
        <PathBreadcrumb path={node.$path} onSelect={onSelect} />
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2>{nodeName}</h2>
          <Badge variant="outline" className="font-mono text-[10px]">{node.$type}</Badge>
          <a
            href={node.$path}
            target="_blank"
            rel="noopener"
            className="text-[11px] text-muted-foreground hover:text-primary no-underline"
          >
            View &#8599;
          </a>
          {onSetRoot && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => onSetRoot(node.$path)} title="Focus subtree">
              &#8962;
            </Button>
          )}
          {viewContexts.length > 1 && (
            <span className="flex gap-0.5">
              {viewContexts.map((c) => (
                <Button
                  key={c}
                  variant={snap.context === c ? 'default' : 'ghost'}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => { st.context = c; }}
                >
                  {c.replace('react:', '')}
                </Button>
              ))}
            </span>
          )}
          <span className="flex-1" />
          <Button variant={snap.editing ? 'ghost' : 'default'} size="sm" className="h-7" onClick={() => { st.editing = !st.editing; }}>
            {snap.editing ? 'Close' : 'Edit'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete ${node.$path}?`}
            description="This action cannot be undone."
            variant="destructive"
            onConfirm={() => onDelete(node.$path)}
          />
        </div>
      </div>

      {/* Rendered view */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <ErrorBoundary>
            <RenderContext name={snap.context}>
              <div className="node-view">
                <Render value={node} />
              </div>
            </RenderContext>
          </ErrorBoundary>
        </div>
      </ScrollArea>

      {/* Slide-out edit panel */}
      <div className={`edit-panel${snap.editing ? ' open' : ''}`}>
        <div className="edit-panel-header">
          <span>Edit {nodeName}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { st.editing = false; }}>
            &#10005;
          </Button>
        </div>

        <Tabs value={snap.tab} onValueChange={(v) => {
          st.tab = v as 'properties' | 'json';
          if (v === 'json') st.jsonText = JSON.stringify({ ...node, ...st.plainData }, null, 2);
        }} className="px-3 pt-2">
          <TabsList className="h-8 bg-secondary">
            <TabsTrigger value="properties" className="text-xs">Properties</TabsTrigger>
            <TabsTrigger value="json" className="text-xs">JSON</TabsTrigger>
          </TabsList>
        </Tabs>

        <ScrollArea className="flex-1">
          <div className="p-3.5">
          {snap.tab === 'properties' ? (
            <>
              <NodeCard path={node.$path} type={snap.nodeType} onChangeType={(v) => { st.nodeType = v; st.dirty = true; }} />
              <AclEditor
                path={node.$path}
                owner={snap.aclOwner}
                rules={snap.aclRules as GroupPerm[]}
                currentUserId={currentUserId}
                onChange={(o, r) => {
                  st.aclOwner = o; st.aclRules = r; st.dirty = true;
                }}
              />

              <div className="border-t border-border mt-2 pt-0.5 first:border-t-0 first:mt-0 first:pt-0">
                <div className="flex items-center justify-between py-2 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{node.$type}</div>
                  <ErrorBoundary>
                    <EditPanel node={node} type={node.$type} data={snap.plainData as Record<string, unknown>} onData={(d) => { st.plainData = d; st.dirty = true; }} />
                    <ActionCardList
                      path={node.$path}
                      componentName=""
                      compType={node.$type}
                      compData={snap.plainData as Record<string, unknown>}
                      toast={toast}
                      onActionComplete={handleReset}
                    />
                  </ErrorBoundary>
                </div>

              {components.map(([name, comp]) => (
                <div key={name} className="border-t border-border mt-2 pt-0.5 first:border-t-0 first:mt-0 first:pt-0">
                  <div className="flex items-center justify-between py-2 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleCollapse(name)}>
                    <span className="font-mono text-[12px]">{name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground/50 font-mono">{(comp as ComponentData).$type}</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={(e) => { e.stopPropagation(); handleRemoveComponent(name); }}
                      >
                        Remove
                      </Button>
                    </span>
                  </div>
                  {!snap.collapsed[name] && (
                    <ErrorBoundary>
                      <EditPanel
                        node={node}
                        type={(comp as ComponentData).$type}
                        data={(snap.compData[name] ?? {}) as Record<string, unknown>}
                        onData={(d) => { st.compData[name] = d; st.dirty = true; }}
                      />
                      <ActionCardList
                        path={node.$path}
                        componentName={name}
                        compType={(comp as ComponentData).$type}
                        compData={(snap.compData[name] ?? {}) as Record<string, unknown>}
                        toast={toast}
                        onActionComplete={handleReset}
                      />
                    </ErrorBoundary>
                  )}
                </div>
              ))}

              {!schema && !mainCompDefaults && Object.keys(snap.plainData).length > 0 && (
                <div className="border-t border-border mt-2 pt-0.5 first:border-t-0 first:mt-0 first:pt-0">
                  <div className="flex items-center justify-between py-2 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</div>
                  <div className="py-0.5 pb-2.5">
                    {Object.entries(snap.plainData).map(([k, v]) => {
                      const onCh = (next: unknown) => { st.plainData[k] = next; st.dirty = true; };
                      return (
                        <div key={k} className={`field${typeof v === 'object' && v !== null ? ' stack' : ''}`}>
                          <FieldLabel label={k} value={v} onChange={onCh} />
                          {typeof v === 'object' && isRef(v) ? (
                            <RefEditor value={v as { $ref: string; $map?: string }} onChange={onCh} />
                          ) : (
                            <input
                              value={typeof v === 'string' ? v : JSON.stringify(v)}
                              onChange={(e) => { st.plainData[k] = e.target.value; st.dirty = true; }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="relative bg-background border border-border rounded-md overflow-hidden">
              <textarea
                value={snap.jsonText}
                onChange={(e) => { st.jsonText = e.target.value; st.dirty = true; }}
                spellCheck={false}
              />
            </div>
          )}
          </div>
        </ScrollArea>

        <div className="edit-panel-actions">
          {snap.stale && (
            <Button variant="ghost" size="sm" onClick={handleReset} title="Node updated externally">
              Reset
            </Button>
          )}
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
          {snap.tab === 'properties' && (
            <Button variant="outline" size="sm" onClick={handleAdd}>+ Component</Button>
          )}
        </div>
      </div>
    </div>
  );
}

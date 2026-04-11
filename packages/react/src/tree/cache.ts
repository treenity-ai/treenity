// Treenity Client Cache — reactive node store
// useSyncExternalStore-friendly: stable snapshots, targeted notifications
// IDB persistence: fire-and-forget writes, hydrate() on startup.

import type { NodeData } from '@treenity/core';
import * as idb from './idb';
import { stampNode } from '#symbols';

/** Shallow-freeze in dev mode to catch accidental cache mutation at the source */
const devFreeze: (node: NodeData) => void =
  import.meta.env?.DEV ? (node) => Object.freeze(node) : () => {};

type Sub = () => void;

const nodes = new Map<string, NodeData>();
// Explicit parent -> children index. This allows nodes to have their real $path
// while still appearing as children of virtual folders like query mounts.
const parentIndex = new Map<string, Set<string>>();
// Reverse index: child path -> set of parents that list it. Needed so an
// in-place update to a node living in N parents (natural + virtual query mounts)
// fans out childSubs to every parent, not just the natural one.
const nodeToParents = new Map<string, Set<string>>();
const pathSubs = new Map<string, Set<Sub>>();
const childSubs = new Map<string, Set<Sub>>();
const globalSubs = new Set<Sub>();
const childSnap = new Map<string, NodeData[]>();
let version = 0;

// lastUpdated: timestamp of last put() per path.
// Used for reconnect refresh ordering (most recently viewed first).
const lastUpdated = new Map<string, number>();
export const getLastUpdated = (path: string) => lastUpdated.get(path) ?? 0;

function addSub(map: Map<string, Set<Sub>>, key: string, cb: Sub): () => void {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(cb);
  return () => {
    const s = map.get(key);
    if (s) {
      s.delete(cb);
      if (!s.size) map.delete(key);
    }
  };
}

function fire(map: Map<string, Set<Sub>>, key: string) {
  const s = map.get(key);
  if (s) for (const cb of s) cb();
}

function bump() {
  version++;
  for (const cb of globalSubs) cb();
}

function parentOf(p: string): string | null {
  if (p === '/') return null;
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

function linkParent(path: string, parent: string) {
  let parents = nodeToParents.get(path);
  if (!parents) { parents = new Set(); nodeToParents.set(path, parents); }
  parents.add(parent);
}

function unlinkParent(path: string, parent: string) {
  const parents = nodeToParents.get(path);
  if (!parents) return;
  parents.delete(parent);
  if (parents.size === 0) nodeToParents.delete(path);
}

/** Fire childSubs for every parent currently listing this path. */
function fireAllParents(path: string) {
  const parents = nodeToParents.get(path);
  if (!parents) return;
  for (const p of parents) {
    childSnap.delete(p);
    fire(childSubs, p);
  }
}

// ── Reads ──

export const get = (path: string) => nodes.get(path);
export const has = (path: string) => nodes.has(path);
export const size = () => nodes.size;
export const getVersion = () => version;

/** True iff children for `parent` have been registered via putMany (even an empty list).
 *  Distinguishes "not yet fetched" from "fetched, zero children" — getChildren() always
 *  returns an array, so consumers that care about the loading boundary must use this. */
export const hasChildrenLoaded = (parent: string) => parentIndex.has(parent);

export function getChildren(parent: string): NodeData[] {
  let snap = childSnap.get(parent);
  if (snap) return snap;
  
  const out: NodeData[] = [];
  const children = parentIndex.get(parent);
  
  if (children) {
    for (const p of children) {
      const n = nodes.get(p);
      if (n) out.push(n);
    }
  } else {
    // Fallback: If not indexed explicitly, find children by string prefix 
    const prefix = parent === '/' ? '/' : parent + '/';
    for (const [p, n] of nodes) {
      if (p === parent || !p.startsWith(prefix)) continue;
      const rest = parent === '/' ? p.slice(1) : p.slice(prefix.length);
      if (rest && !rest.includes('/')) out.push(n);
    }
  }
  
  out.sort((a, b) => a.$path.localeCompare(b.$path));
  childSnap.set(parent, out);
  return out;
}

// ── Parent Index Management ──

export function addToParent(path: string, parent: string) {
  if (!parentIndex.has(parent)) parentIndex.set(parent, new Set());
  if (!parentIndex.get(parent)!.has(path)) {
    parentIndex.get(parent)!.add(path);
    linkParent(path, parent);
    childSnap.delete(parent);
    fire(childSubs, parent);
    bump();
  }
}

export function removeFromParent(path: string, parent: string) {
  const children = parentIndex.get(parent);
  if (children && children.has(path)) {
    children.delete(path);
    unlinkParent(path, parent);
    childSnap.delete(parent);
    fire(childSubs, parent);
    bump();
  }
}

// ── Writes ──

export function put(node: NodeData, virtualParent?: string) {
  stampNode(node);
  nodes.set(node.$path, node);
  devFreeze(node);
  const p = virtualParent ?? parentOf(node.$path);
  if (p !== null) {
    if (!parentIndex.has(p)) parentIndex.set(p, new Set());
    parentIndex.get(p)!.add(node.$path);
    linkParent(node.$path, p);
  }
  fire(pathSubs, node.$path);
  // Fan-out to every parent currently listing this node (natural + any VPs).
  // In-place updates on a node visible in multiple parents notify all of them.
  fireAllParents(node.$path);
  bump();
  for (const h of putHooks) h(node.$path);

  const ts = Date.now();
  lastUpdated.set(node.$path, ts);
  idb.save({ path: node.$path, data: node, lastUpdated: ts, virtualParent }).catch(() => {});
}

export function putMany(items: NodeData[], virtualParent?: string) {
  const dirty = new Set<string>();
  if (virtualParent) {
    if (!parentIndex.has(virtualParent)) parentIndex.set(virtualParent, new Set());
    dirty.add(virtualParent);
  }
  const ts = Date.now();
  const idbEntries: idb.IDBEntry[] = [];
  for (const n of items) {
    stampNode(n);
    nodes.set(n.$path, n);
    devFreeze(n);
    lastUpdated.set(n.$path, ts);
    fire(pathSubs, n.$path);
    const p = virtualParent ?? parentOf(n.$path);
    if (p !== null) {
      if (!parentIndex.has(p)) parentIndex.set(p, new Set());
      parentIndex.get(p)!.add(n.$path);
      linkParent(n.$path, p);
      dirty.add(p);
    }
    // Collect all parents already listing this node so fan-out hits them too.
    const existing = nodeToParents.get(n.$path);
    if (existing) for (const ep of existing) dirty.add(ep);
    idbEntries.push({ path: n.$path, data: n, lastUpdated: ts, virtualParent });
  }
  for (const p of dirty) {
    childSnap.delete(p);
    fire(childSubs, p);
  }
  if (items.length || dirty.size) bump();
  idb.saveMany(idbEntries).catch(() => {});
}

export function remove(path: string, virtualParent?: string) {
  nodes.delete(path);
  lastUpdated.delete(path);

  // Snapshot parents before unlinking so we can fire them after.
  // A removed node must clear out of every parent that listed it —
  // leaving stale entries in other parentIndex buckets would dangle.
  const parents = nodeToParents.get(path);
  const toFire = new Set<string>();
  if (parents) {
    for (const p of parents) {
      parentIndex.get(p)?.delete(path);
      childSnap.delete(p);
      toFire.add(p);
    }
    nodeToParents.delete(path);
  }
  // Honor explicit virtualParent hint even if reverse index is empty
  // (legacy callers may remove before put).
  const p = virtualParent ?? parentOf(path);
  if (p !== null && !toFire.has(p)) {
    parentIndex.get(p)?.delete(path);
    childSnap.delete(p);
    toFire.add(p);
  }

  fire(pathSubs, path);
  for (const fp of toFire) fire(childSubs, fp);
  bump();
  idb.del(path).catch(() => {});
}

// ── Subscriptions ──

export const subscribePath = (path: string, cb: Sub) => addSub(pathSubs, path, cb);
export const subscribeChildren = (parent: string, cb: Sub) => addSub(childSubs, parent, cb);
export const subscribeGlobal = (cb: Sub): (() => void) => {
  globalSubs.add(cb);
  return () => globalSubs.delete(cb);
};

// ── Per-put hook (used by bind engine) ──
const putHooks = new Set<(path: string) => void>();
export function onNodePut(cb: (path: string) => void): () => void {
  putHooks.add(cb);
  return () => putHooks.delete(cb);
}

// ── Extra accessors ──
export function notifyPath(path: string) { fire(pathSubs, path); }
export function getSnapshot(path: string): NodeData | undefined {
  const node = nodes.get(path);
  if (!node) return undefined;
  return structuredClone(node);
}

// ── SSE Reconnect ──
// Generation counter — bumped when SSE reconnects with preserved=false.
// useChildren depends on this to re-fetch and re-register watches.
let sseGen = 0;
const genSubs = new Set<Sub>();
export const getSSEGen = () => sseGen;
export function subscribeSSEGen(cb: Sub) {
  genSubs.add(cb);
  return () => genSubs.delete(cb);
}
export function signalReconnect() {
  sseGen++;
  for (const cb of genSubs) cb();
}

// ── Bulk ──

export function clear() {
  nodes.clear();
  parentIndex.clear();
  nodeToParents.clear();
  childSnap.clear();
  lastUpdated.clear();
  bump();
  idb.clearAll().catch(() => {});
}

// Populate cache from IDB on startup — no IDB writes triggered.
// Call before first render for instant stale paint.
export async function hydrate(): Promise<void> {
  try {
    const entries = await idb.loadAll();
    for (const { data, lastUpdated: ts, virtualParent } of entries) {
      stampNode(data);
      nodes.set(data.$path, data);
      devFreeze(data);
      lastUpdated.set(data.$path, ts);
      const p = virtualParent ?? parentOf(data.$path);
      if (p !== null) {
        if (!parentIndex.has(p)) parentIndex.set(p, new Set());
        parentIndex.get(p)!.add(data.$path);
        linkParent(data.$path, p);
        childSnap.delete(p);
      }
    }
    if (entries.length) bump();
  } catch {
    // IDB unavailable (private browsing, etc.) — continue without persistence
  }
}

// Expose raw Map for Tree component (read-only contract)
export const raw = () => nodes;

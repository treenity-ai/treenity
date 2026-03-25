// Auto-save: onChange partial → MutationOp[] → throttled tree.patch()
// Phase 2 of mutation pipeline.

import { useCallback, useEffect, useRef } from 'react';
import { trpc } from './trpc';

type MutationOp = ['r', string, unknown] | ['d', string];

// ── Typed dot-notation partial ──

/** Dot-paths for nested objects: { meta: { title: string } } → 'meta.title' */
type DotPaths<T, Prefix extends string = ''> = T extends object
  ? { [K in keyof T & string]:
      | `${Prefix}${K}`
      | DotPaths<T[K], `${Prefix}${K}.`>
    }[keyof T & string]
  : never;

/** Get the type at a dot-path: DotValue<{ meta: { title: string } }, 'meta.title'> = string */
type DotValue<T, P extends string> =
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T ? DotValue<T[K], Rest> : never
    : P extends keyof T ? T[P] : never;

/** Fields that can be replaced at top level (full object) or deleted (via undefined) */
type TopLevel<T> = {
  [K in keyof T & string]?: T[K] | undefined;
};

/** Fields that can be set via dot-notation or deleted (via undefined) */
type DotLevel<T> = {
  [P in DotPaths<T> as P extends `${string}.${string}` ? P : never]?: DotValue<T, P> | undefined;
};

/** What onChange accepts: top-level partial OR dot-notation paths, typed.
 *  undefined = delete field. */
export type OnChange<T> = TopLevel<Omit<T, `$${string}`>> & DotLevel<Omit<T, `$${string}`>>;

// ── mergeToOps: partial object → MutationOp[] ──

function validateDotKey(k: string): boolean {
  if (!k.includes('.')) return true;
  const segs = k.split('.');
  return segs.every(s => s.length > 0 && !/^\d+$/.test(s));
}

export function mergeToOps(partial: Record<string, unknown>): MutationOp[] {
  // Returns only 'r' (replace) and 'd' (delete) — both idempotent
  const ops: MutationOp[] = [];
  for (const [k, v] of Object.entries(partial)) {
    if (k.startsWith('$')) continue;
    if (!validateDotKey(k)) continue;
    if (v === undefined) ops.push(['d', k] as const);
    else ops.push(['r', k, v] as const);
  }
  return ops;
}

// ── mergeIntoNode: optimistic local merge ──

export function mergeIntoNode<T extends Record<string, unknown>>(node: T, partial: Record<string, unknown>): T {
  const merged = { ...node };
  for (const [k, v] of Object.entries(partial)) {
    if (k.startsWith('$')) continue;
    if (v === undefined) { delete merged[k]; continue; }
    if (k.includes('.') && validateDotKey(k)) {
      setByPath(merged, k, v);
    } else if (!k.includes('.')) {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  return merged as T;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const existing = cur[parts[i]];
    if (existing == null || typeof existing !== 'object') {
      cur[parts[i]] = {};
    } else {
      cur[parts[i]] = { ...(existing as Record<string, unknown>) };
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

// ── useAutoSave hook ──

const FLUSH_DELAY = 500;

export function useAutoSave<T extends Record<string, unknown>>(path: string) {
  const pending = useRef<Record<string, unknown> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const pathRef = useRef(path);
  pathRef.current = path;

  const flush = useCallback(async () => {
    if (!pending.current || inflight.current) return;

    const ops = mergeToOps(pending.current);
    pending.current = null;
    timer.current = null;

    if (ops.length === 0) return;

    inflight.current = true;
    try {
      await trpc.patch.mutate({ path: pathRef.current, ops });
    } catch (e) {
      console.error('[auto-save] patch failed:', e);
    } finally {
      inflight.current = false;
      if (pending.current) {
        timer.current = setTimeout(flush, FLUSH_DELAY);
      }
    }
  }, []);

  const onChange = useCallback((partial: OnChange<T>) => {
    if (!partial || typeof partial !== 'object') return;

    pending.current = pending.current
      ? { ...pending.current, ...(partial as Record<string, unknown>) }
      : { ...(partial as Record<string, unknown>) };

    if (!timer.current) {
      timer.current = setTimeout(flush, FLUSH_DELAY);
    }
  }, [flush]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) {
        const ops = mergeToOps(pending.current);
        if (ops.length > 0) {
          trpc.patch.mutate({ path: pathRef.current, ops }).catch(() => {});
        }
      }
    };
  }, []);

  return onChange;
}

// Symbol-based component location metadata.
// Stamped on deserialization (cache.put). Non-enumerable so they're
// invisible to structuredClone, spread, and JSON/keys/entries.

import { isComponent, type NodeData } from '@treenity/core';

export const $key = Symbol.for('treenity.$key');
export const $node = Symbol.for('treenity.$node');

function hide(obj: object, sym: symbol, value: unknown): void {
  Object.defineProperty(obj, sym, { value, enumerable: false, writable: false, configurable: true });
}

export function stampNode(node: NodeData): void {
  if ((node as any)[$node] === node) return;

  hide(node, $key, '');
  hide(node, $node, node);

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$') || !isComponent(v)) continue;
    hide(v, $key, k);
    hide(v, $node, node);
  }
}

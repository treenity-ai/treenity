// Symbol-based component location metadata.
// Stamped on deserialization (cache.put). Survive spread, invisible to JSON/keys/entries.

import { isComponent, type NodeData } from '@treenity/core';

export const $key = Symbol.for('treenity.$key');
export const $node = Symbol.for('treenity.$node');

export function stampNode(node: NodeData): void {
  (node as any)[$key] = '';
  (node as any)[$node] = node;

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$') || !isComponent(v)) continue;
    (v as any)[$key] = k;
    (v as any)[$node] = node;
  }
}

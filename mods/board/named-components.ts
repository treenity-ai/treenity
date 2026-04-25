import { type ComponentData, isComponent, type NodeData } from '@treenity/core';

export function getNamedComponents(node: NodeData, current?: unknown): [string, ComponentData][] {
  const entries: [string, ComponentData][] = [];

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$') || key === 'taskRef') continue;
    if (!isComponent(value)) continue;
    if (value === current) continue;
    entries.push([key, value]);
  }

  return entries;
}

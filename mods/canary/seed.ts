import { type NodeData } from '@treenity/core/core';
import { registerPrefab } from '@treenity/core/mod';

registerPrefab('canary', 'seed', [
  { $path: 'canary', $type: 'dir' },
  { $path: 'canary/runner', $type: 'canary.runner' },
  { $path: 'sys/autostart/canary', $type: 'ref', $ref: '/canary/runner' },
] as NodeData[]);

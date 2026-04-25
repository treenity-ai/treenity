import type { NodeData } from '@treenity/core';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getNamedComponents } from './named-components';

describe('getNamedComponents', () => {
  it('keeps sibling components for node-level board.task', () => {
    const node = {
      $path: '/board/data/t-1',
      $type: 'board.task',
      title: 'Task',
      chat: { $type: 'metatron.chat', title: 'Chat' },
      plan: { $type: 'ai.plan', summary: 'Plan' },
      taskRef: '/agents/task-1',
    } as NodeData;

    const entries = getNamedComponents(node, node);

    assert.deepEqual(entries.map(([key]) => key), ['chat', 'plan']);
  });

  it('skips current attached component to avoid self-recursive render', () => {
    const task = { $type: 'board.task', title: 'Attached task' };
    const node = {
      $path: '/scratch/x',
      $type: 't.dir',
      task,
      chat: { $type: 'metatron.chat', title: 'Chat' },
    } as NodeData;

    const entries = getNamedComponents(node, task);

    assert.deepEqual(entries.map(([key]) => key), ['chat']);
  });

  it('returns empty when attached board.task is the only component', () => {
    const task = { $type: 'board.task', title: 'Attached task' };
    const node = {
      $path: '/scratch/solo',
      $type: 't.dir',
      task,
    } as NodeData;

    const entries = getNamedComponents(node, task);

    assert.equal(entries.length, 0);
  });
});

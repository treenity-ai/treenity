import { createNode, type NodeData, register } from '#core';
import { restoreRegistrySnapshot, saveRegistrySnapshot } from '#core/index.test';
import { type ActionCtx, serverNodeHandle } from '#server/actions';
import { createMemoryTree } from '#tree';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { describeTree, exportSchemaForLLM } from '.';

const snap = saveRegistrySnapshot();

function makeCtx(tree: ReturnType<typeof createMemoryTree>, node: NodeData): ActionCtx {
  const nc = serverNodeHandle(tree);
  return { node, tree, signal: AbortSignal.timeout(5000), nc };
}

describe('exportSchemaForLLM', () => {
  beforeEach(() => restoreRegistrySnapshot(new Map()));
  afterEach(() => restoreRegistrySnapshot(snap));

  it('returns types with schemas', () => {
    register('task', 'schema', () => ({
      title: 'Task',
      type: 'object',
      properties: { status: { type: 'string', title: 'Status' } },
    }));
    register('task', 'react', () => 'component');
    const result = exportSchemaForLLM();
    assert.equal(result.types.length, 1);
    const t = result.types[0];
    assert.equal(t.type, 't.task');
    assert.deepEqual((t.schema as any).title, 'Task');
    assert.ok(t.contexts.includes('schema'));
    assert.ok(t.contexts.includes('react'));
  });

  it('extracts actions from contexts', () => {
    register('task', 'schema', () => ({ title: 'Task', type: 'object', properties: {} }));
    register('task', 'action:complete', () => 'done');
    register('task', 'action:assign', () => 'assigned');
    const result = exportSchemaForLLM();
    const t = result.types[0];
    assert.deepEqual(t.actions.sort(), ['assign', 'complete']);
    assert.ok(!t.contexts.includes('action:complete'));
  });

  it('returns null schema when no schema handler', () => {
    register('widget', 'react', () => 'component');
    const result = exportSchemaForLLM();
    const t = result.types.find((x) => x.type === 't.widget')!;
    assert.equal(t.schema, null);
  });

  it('returns empty types when registry is empty', () => {
    const result = exportSchemaForLLM();
    assert.deepEqual(result.types, []);
  });
});

describe('describeTree', () => {
  beforeEach(() => restoreRegistrySnapshot(new Map()));
  afterEach(() => restoreRegistrySnapshot(snap));

  it('renders tree structure', async () => {
    const tree = createMemoryTree();
    const root = createNode('/', 'root');
    await tree.set(root);
    await tree.set(createNode('/pages', 'dir'));
    await tree.set(createNode('/pages/main', 'page'));
    await tree.set(createNode('/users', 'dir'));

    const text = await describeTree(makeCtx(tree, root), { depth: 3 });
    assert.ok(text.includes('/ (t.root)'));
    assert.ok(text.includes('  pages (t.dir)'));
    assert.ok(text.includes('    main (t.page)'));
    assert.ok(text.includes('  users (t.dir)'));
  });

  it('respects depth limit', async () => {
    const tree = createMemoryTree();
    const root = createNode('/', 'root');
    await tree.set(root);
    await tree.set(createNode('/a', 'dir'));
    await tree.set(createNode('/a/b', 'dir'));
    await tree.set(createNode('/a/b/c', 'item'));

    const text = await describeTree(makeCtx(tree, root), { depth: 1 });
    assert.ok(text.includes('a (t.dir)'));
    assert.ok(!text.includes('b (t.dir)'));
  });

  it('describes subtree from given node', async () => {
    const tree = createMemoryTree();
    const pages = createNode('/pages', 'dir');
    await tree.set(pages);
    await tree.set(createNode('/pages/main', 'page'));

    const text = await describeTree(makeCtx(tree, pages), {});
    assert.ok(text.startsWith('/pages (t.dir)'));
    assert.ok(text.includes('main (t.page)'));
  });

  it('sorts children alphabetically', async () => {
    const tree = createMemoryTree();
    const root = createNode('/', 'root');
    await tree.set(root);
    await tree.set(createNode('/zebra', 'animal'));
    await tree.set(createNode('/apple', 'fruit'));

    const text = await describeTree(makeCtx(tree, root), { depth: 1 });
    const lines = text.split('\n');
    assert.ok(lines.indexOf('  apple (t.fruit)') < lines.indexOf('  zebra (t.animal)'));
  });
});

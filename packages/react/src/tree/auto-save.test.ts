import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeToOps, mergeIntoNode } from './auto-save';

describe('mergeToOps', () => {
  it('replace field', () => {
    const ops = mergeToOps({ title: 'new' });
    assert.deepEqual(ops, [['r', 'title', 'new']]);
  });

  it('delete field via undefined', () => {
    const ops = mergeToOps({ obsolete: undefined });
    assert.deepEqual(ops, [['d', 'obsolete']]);
  });

  it('dot-notation field', () => {
    const ops = mergeToOps({ 'meta.title': 'updated' });
    assert.deepEqual(ops, [['r', 'meta.title', 'updated']]);
  });

  it('mixed ops', () => {
    const ops = mergeToOps({ title: 'x', draft: undefined, 'meta.count': 5 });
    assert.equal(ops.length, 3);
    assert.deepEqual(ops[0], ['r', 'title', 'x']);
    assert.deepEqual(ops[1], ['d', 'draft']);
    assert.deepEqual(ops[2], ['r', 'meta.count', 5]);
  });

  it('skips $ fields', () => {
    const ops = mergeToOps({ $path: '/x', $type: 'y', title: 'z' });
    assert.deepEqual(ops, [['r', 'title', 'z']]);
  });

  it('skips invalid dot keys', () => {
    const ops = mergeToOps({ 'field..inner': 1, 'arr.0.name': 2, valid: 3 });
    assert.deepEqual(ops, [['r', 'valid', 3]]);
  });

  it('empty partial → empty ops', () => {
    assert.deepEqual(mergeToOps({}), []);
  });
});

describe('mergeIntoNode', () => {
  it('replaces top-level field', () => {
    const result = mergeIntoNode({ $path: '/x', $type: 'y', title: 'old' }, { title: 'new' });
    assert.equal(result.title, 'new');
    assert.equal(result.$path, '/x');
  });

  it('deletes field via undefined', () => {
    const result = mergeIntoNode({ $path: '/x', $type: 'y', draft: true }, { draft: undefined });
    assert.equal('draft' in result, false);
  });

  it('deep merge via dot-notation', () => {
    const node = { $path: '/x', $type: 'y', meta: { title: 'old', count: 0 } };
    const result = mergeIntoNode(node, { 'meta.title': 'new' });
    assert.equal((result.meta as any).title, 'new');
    assert.equal((result.meta as any).count, 0);
  });

  it('does not mutate original node', () => {
    const node = { $path: '/x', $type: 'y', meta: { title: 'old' } };
    mergeIntoNode(node, { 'meta.title': 'new' });
    assert.equal((node.meta as any).title, 'old');
  });

  it('skips $ fields', () => {
    const result = mergeIntoNode({ $path: '/x', $type: 'y' }, { $path: '/hacked' } as any);
    assert.equal(result.$path, '/x');
  });
});

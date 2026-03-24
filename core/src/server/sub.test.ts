import { createNode } from '#core';
import { createMemoryTree } from '#tree';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type NodeEvent, withSubscriptions } from './sub';

describe('Subscriptions', () => {
  it('emits on set (children)', async () => {
    const tree = withSubscriptions(createMemoryTree());
    const events: NodeEvent[] = [];
    tree.subscribe('/bot', (e) => events.push(e), { children: true });

    await tree.set(createNode('/bot/commands/start', 'page'));
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'set');
    assert.equal(events[0].path, '/bot/commands/start');
  });

  it('emits on remove (children)', async () => {
    const tree = withSubscriptions(createMemoryTree());
    const events: NodeEvent[] = [];
    await tree.set(createNode('/bot/x', 'page'));
    tree.subscribe('/bot', (e) => events.push(e), { children: true });
    await tree.remove('/bot/x');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'remove');
  });

  it('does not emit for unrelated paths', async () => {
    const tree = withSubscriptions(createMemoryTree());
    const events: NodeEvent[] = [];
    tree.subscribe('/bot', (e) => events.push(e), { children: true });
    await tree.set(createNode('/users/1', 'user'));
    assert.equal(events.length, 0);
  });

  it('emits for exact path match', async () => {
    const tree = withSubscriptions(createMemoryTree());
    const events: NodeEvent[] = [];
    tree.subscribe('/bot', (e) => events.push(e));
    await tree.set(createNode('/bot', 'bot'));
    assert.equal(events.length, 1);
  });

  it('unsubscribe stops events (children)', async () => {
    const tree = withSubscriptions(createMemoryTree());
    const events: NodeEvent[] = [];
    const unsub = tree.subscribe('/bot', (e) => events.push(e), { children: true });
    await tree.set(createNode('/bot/x', 'page'));
    assert.equal(events.length, 1);
    unsub();
    await tree.set(createNode('/bot/y', 'page'));
    assert.equal(events.length, 1);
  });

  it('set with changed field emits computed patch', async () => {
    const tree = withSubscriptions(createMemoryTree());
    const events: NodeEvent[] = [];
    await tree.set({ ...createNode('/x', 'test'), foo: 'old' });
    tree.subscribe('/x', (e) => events.push(e));

    // Client set: no patches → sub.ts computes diff via fast-json-patch
    await tree.set({ ...createNode('/x', 'test'), foo: 'new' });

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'patch');
    if (events[0].type === 'patch') {
      const fooOp = events[0].patches.find(p => p.path === '/foo');
      assert.ok(fooOp);
      assert.equal((fooOp as any).value, 'new');
    }
  });

  it('string $patches are stripped and ignored — injection blocked', async () => {
    const tree = withSubscriptions(createMemoryTree());
    const events: NodeEvent[] = [];
    await tree.set({ ...createNode('/x', 'test'), amount: 100 });
    tree.subscribe('/x', (e) => events.push(e));

    // Simulate client injection: string $patches with fake values
    const node: any = { ...createNode('/x', 'test'), amount: 200 };
    node.$patches = [{ op: 'replace', path: ['amount'], value: 0 }];
    await tree.set(node);

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'patch');
    if (events[0].type === 'patch') {
      const amountOp = events[0].patches.find(p => p.path === '/amount');
      assert.ok(amountOp);
      // Computed diff shows the REAL value (200), not the injected fake (0)
      assert.equal((amountOp as any).value, 200);
    }
  });

  it('string $patches are not persisted to storage', async () => {
    const mem = createMemoryTree();
    const tree = withSubscriptions(mem);

    const node: any = { ...createNode('/x', 'test'), foo: 'bar' };
    node.$patches = [{ op: 'replace', path: ['foo'], value: 'FAKE' }];
    await tree.set(node);

    const stored = await mem.get('/x');
    assert.ok(stored);
    assert.equal('$patches' in stored, false, '$patches should not be stored');
  });
});

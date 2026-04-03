import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createPathLock } from './path-lock';

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('createPathLock', () => {

  it('serializes concurrent ops on same path', async () => {
    const lock = createPathLock();
    const order: string[] = [];

    const a = lock('/x', async () => {
      order.push('a-start');
      await delay(50);
      order.push('a-end');
      return 'a';
    });

    const b = lock('/x', async () => {
      order.push('b-start');
      await delay(10);
      order.push('b-end');
      return 'b';
    });

    const [ra, rb] = await Promise.all([a, b]);
    assert.strictEqual(ra, 'a');
    assert.strictEqual(rb, 'b');
    assert.deepStrictEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('runs different paths in parallel', async () => {
    const lock = createPathLock();
    const order: string[] = [];

    const a = lock('/a', async () => {
      order.push('a-start');
      await delay(50);
      order.push('a-end');
    });

    const b = lock('/b', async () => {
      order.push('b-start');
      await delay(50);
      order.push('b-end');
    });

    await Promise.all([a, b]);
    assert.strictEqual(order[0], 'a-start');
    assert.strictEqual(order[1], 'b-start');
  });

  it('releases lock on error — next op proceeds', async () => {
    const lock = createPathLock();
    const results: string[] = [];

    await lock('/x', async () => { throw new Error('fail'); }).catch(() => {});
    results.push(await lock('/x', async () => 'ok'));

    assert.deepStrictEqual(results, ['ok']);
  });

  it('three ops on same path — strict FIFO', async () => {
    const lock = createPathLock();
    const order: number[] = [];

    const ops = [1, 2, 3].map(i =>
      lock('/x', async () => { order.push(i); await delay(10); }),
    );

    await Promise.all(ops);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  it('independent lock instances dont interfere', async () => {
    const lockA = createPathLock();
    const lockB = createPathLock();
    const order: string[] = [];

    const a = lockA('/x', async () => {
      order.push('a-start');
      await delay(50);
      order.push('a-end');
    });

    const b = lockB('/x', async () => {
      order.push('b-start');
      await delay(10);
      order.push('b-end');
    });

    await Promise.all([a, b]);
    // Different instances → parallel even on same path
    assert.strictEqual(order[0], 'a-start');
    assert.strictEqual(order[1], 'b-start');
  });
});

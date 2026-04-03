// Per-path async mutex factory — serializes concurrent async ops on the same key.
// Each createPathLock() returns an independent lock scope.

export function createPathLock() {
  const locks = new Map<string, Promise<void>>();

  return <T>(path: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(path) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    locks.set(path, gate);

    return prev.then(fn, fn).finally(() => {
      if (locks.get(path) === gate) locks.delete(path);
      release();
    });
  };
}

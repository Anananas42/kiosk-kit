let chain = Promise.resolve();

export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn);
  chain = result.then(
    () => {},
    () => {},
  );
  return result;
}

/** Maps items with a fixed worker pool while preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error('Concurrency must be a positive integer');
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await mapper(items[index]!, index);
      } catch (error) {
        failed = true;
        firstError = error;
      }
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  if (failed) {
    throw firstError;
  }
  return results;
}

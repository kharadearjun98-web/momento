/**
 * Run an async worker over items with a bounded number of concurrent tasks,
 * preserving input order in the returned results array.
 *
 * Used to parallelize slow per-item network calls (TTS narration, image
 * generation) without firing every request at once, which would hit provider
 * rate limits. Results are indexed by the item's original position, so callers
 * can rely on order (e.g. stitching audio segments in sequence).
 *
 * If the worker throws for any item, the returned promise rejects (matching the
 * previous sequential behavior where a failed segment fails the whole job).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}

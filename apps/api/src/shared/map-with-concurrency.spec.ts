import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './map-with-concurrency.js';

describe('mapWithConcurrency', () => {
  it('caps active work and preserves input order', async () => {
    let active = 0;
    let maximumActive = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1, 10], 4, async (delay) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      active--;
      return delay * 2;
    });

    expect(maximumActive).toBe(4);
    expect(results).toEqual([60, 10, 40, 2, 20]);
  });

  it('rejects invalid concurrency', async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(
      'Concurrency must be a positive integer',
    );
  });
});

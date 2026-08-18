import { describe, expect, it } from 'vitest';
import { reconstructChangedRanges } from './local-diff-reconstruction.js';

describe('reconstructChangedRanges', () => {
  it('produces a whole-line range for a pure addition', () => {
    const before = 'a\nb\n';
    const after = 'a\nb\nc\nd\n';

    const ranges = reconstructChangedRanges(before, after);

    expect(ranges).toEqual([{ start: { line: 3, column: 1 }, end: { line: 5, column: 1 } }]);
  });

  it('produces a range covering only the replaced line for a single-line modification', () => {
    const before = 'a\nold\nc\n';
    const after = 'a\nnew\nc\n';

    const ranges = reconstructChangedRanges(before, after);

    expect(ranges).toEqual([{ start: { line: 2, column: 1 }, end: { line: 3, column: 1 } }]);
  });

  it('produces a zero-width anchor for a deletion-only edit', () => {
    const before = 'a\nb\nc\n';
    const after = 'a\nc\n';

    const ranges = reconstructChangedRanges(before, after);

    expect(ranges).toEqual([{ start: { line: 2, column: 1 }, end: { line: 2, column: 1 } }]);
  });

  it('produces no ranges for identical before/after content', () => {
    const content = 'a\nb\nc\n';

    expect(reconstructChangedRanges(content, content)).toEqual([]);
  });

  it('handles multiple separate changed regions', () => {
    const before = 'a\nb\nc\nd\ne\n';
    const after = 'a\nX\nc\nd\nY\n';

    const ranges = reconstructChangedRanges(before, after);

    expect(ranges).toEqual([
      { start: { line: 2, column: 1 }, end: { line: 3, column: 1 } },
      { start: { line: 5, column: 1 }, end: { line: 6, column: 1 } },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { isRangeWithinContent, parsePatch } from './patch-hunk-parser.js';

describe('parsePatch', () => {
  it('is unusable for an undefined patch', () => {
    expect(parsePatch(undefined)).toEqual({ usable: false });
  });

  it('is unusable for an empty patch', () => {
    expect(parsePatch('')).toEqual({ usable: false });
  });

  it('is unusable for text that is not a recognizable unified diff', () => {
    expect(parsePatch('not a patch at all')).toEqual({ usable: false });
  });

  it('produces a whole-line resulting range for a pure addition hunk', () => {
    const patch = ['@@ -0,0 +1,2 @@', '+line1', '+line2'].join('\n');

    const result = parsePatch(patch);

    expect(result).toEqual({
      usable: true,
      changedRanges: [{ start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }],
    });
  });

  it('produces a resulting range covering only the new line of a single-line replacement', () => {
    const patch = ['@@ -1,1 +1,1 @@', '-old', '+new'].join('\n');

    const result = parsePatch(patch);

    expect(result).toEqual({
      usable: true,
      changedRanges: [{ start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }],
    });
  });

  it('produces a zero-width anchor for a deletion-only edit', () => {
    // Original: "a\nb\nc"; "b" removed. Resulting content: "a\nc".
    const patch = ['@@ -1,3 +1,2 @@', ' a', '-b', ' c'].join('\n');

    const result = parsePatch(patch);

    expect(result).toEqual({
      usable: true,
      changedRanges: [{ start: { line: 2, column: 1 }, end: { line: 2, column: 1 } }],
    });
  });

  it('combines ranges from multiple hunks in one patch', () => {
    const patch = [
      '@@ -1,1 +1,1 @@',
      '-old1',
      '+new1',
      '@@ -10,1 +10,1 @@',
      '-old2',
      '+new2',
    ].join('\n');

    const result = parsePatch(patch);

    expect(result).toEqual({
      usable: true,
      changedRanges: [
        { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
        { start: { line: 10, column: 1 }, end: { line: 11, column: 1 } },
      ],
    });
  });

  it('tolerates a trailing "no newline at end of file" marker', () => {
    const patch = ['@@ -1,1 +1,1 @@', '-old', '+new', '\\ No newline at end of file'].join('\n');

    const result = parsePatch(patch);

    expect(result).toEqual({
      usable: true,
      changedRanges: [{ start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }],
    });
  });

  it('is unusable when the hunk body is truncated relative to its declared new-line count', () => {
    // Header claims 2 new lines but only 1 is present in the body.
    const patch = ['@@ -1,1 +1,2 @@', '+new1'].join('\n');

    expect(parsePatch(patch)).toEqual({ usable: false });
  });

  it('is unusable when the hunk body is truncated relative to its declared old-line count', () => {
    const patch = ['@@ -1,2 +1,1 @@', '-old1', '+new1'].join('\n');

    expect(parsePatch(patch)).toEqual({ usable: false });
  });

  it('is unusable for an unrecognized body-line marker', () => {
    const patch = ['@@ -1,1 +1,1 @@', '*old', '+new'].join('\n');

    expect(parsePatch(patch)).toEqual({ usable: false });
  });
});

describe('isRangeWithinContent', () => {
  const oneLineContent = 'export const x = 1;';

  it('rejects a whole-line range that starts beyond the content (e.g. a hunk claiming line 100 in a one-line file)', () => {
    const range = { start: { line: 100, column: 1 }, end: { line: 101, column: 1 } };

    expect(isRangeWithinContent(range, oneLineContent)).toBe(false);
  });

  it('accepts a whole-line range that starts at the first line and stays within the content', () => {
    const range = { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } };

    expect(isRangeWithinContent(range, oneLineContent)).toBe(true);
  });

  it('accepts a whole-line range that reaches exactly one line past the last line (EOF)', () => {
    const twoLineContent = 'line1\nline2';
    const range = { start: { line: 2, column: 1 }, end: { line: 3, column: 1 } };

    expect(isRangeWithinContent(range, twoLineContent)).toBe(true);
  });

  it('rejects a whole-line range that ends more than one line past the last line', () => {
    const twoLineContent = 'line1\nline2';
    const range = { start: { line: 2, column: 1 }, end: { line: 4, column: 1 } };

    expect(isRangeWithinContent(range, twoLineContent)).toBe(false);
  });

  it('accepts a zero-width deletion anchor anywhere from line 1 up to the exclusive EOF position', () => {
    const twoLineContent = 'line1\nline2';

    expect(isRangeWithinContent({ start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, twoLineContent)).toBe(
      true,
    );
    expect(isRangeWithinContent({ start: { line: 3, column: 1 }, end: { line: 3, column: 1 } }, twoLineContent)).toBe(
      true,
    );
  });

  it('rejects a zero-width deletion anchor past the exclusive EOF position', () => {
    const twoLineContent = 'line1\nline2';
    const range = { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } };

    expect(isRangeWithinContent(range, twoLineContent)).toBe(false);
  });
});

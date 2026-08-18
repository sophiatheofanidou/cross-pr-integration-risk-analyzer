import { describe, expect, it } from 'vitest';
import { computeWholeFileRange, isSupportedTypeScriptFile } from './changed-file-support.js';

describe('isSupportedTypeScriptFile', () => {
  it('supports a plain .ts file', () => {
    expect(isSupportedTypeScriptFile('src/payment.service.ts')).toBe(true);
  });

  it('supports a .d.ts declaration file as a .ts file', () => {
    expect(isSupportedTypeScriptFile('src/types/payment.d.ts')).toBe(true);
  });

  it('does not support .tsx', () => {
    expect(isSupportedTypeScriptFile('src/component.tsx')).toBe(false);
  });

  it('does not support unrelated extensions', () => {
    expect(isSupportedTypeScriptFile('README.md')).toBe(false);
    expect(isSupportedTypeScriptFile('src/styles.css')).toBe(false);
  });
});

describe('computeWholeFileRange', () => {
  it('spans the full content from the first to the last character', () => {
    const content = 'line1\nline2\nline3';

    expect(computeWholeFileRange(content)).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 3, column: 6 },
    });
  });

  it('produces a zero-width range for empty content', () => {
    expect(computeWholeFileRange('')).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    });
  });
});

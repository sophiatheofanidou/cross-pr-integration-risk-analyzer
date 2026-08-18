/**
 * Which changed files Candidate Discovery structurally analyzes.
 *
 * See docs/design/07-mvp-specification.md (Supported File Cases): added
 * and modified TypeScript `.ts` files only. `.tsx` is not supported;
 * `.d.ts` is a `.ts` file and is analyzed like any other.
 */

import type { SourceRange } from '../domain/source-location.js';

export function isSupportedTypeScriptFile(path: string): boolean {
  return path.endsWith('.ts');
}

/** The full span of `content` as a changed range, used for added files. */
export function computeWholeFileRange(content: string): SourceRange {
  const lines = content.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return {
    start: { line: 1, column: 1 },
    end: { line: lines.length, column: lastLine.length + 1 },
  };
}

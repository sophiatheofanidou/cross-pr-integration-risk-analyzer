/**
 * Bounded local line-diff reconstruction, used when a modified file's
 * provider patch is missing or insufficient.
 *
 * See docs/design/04-candidate-discovery.md (Resulting-Content Search) and
 * ADR-011. Uses the maintained `diff` package's line-based diff rather than
 * a custom general-purpose diff algorithm.
 */

import { diffLines } from 'diff';
import type { SourceRange } from '../domain/source-location.js';

/**
 * Reconstructs reliable resulting-content changed ranges from a selected
 * file's immutable before/after versions. A contiguous run of added lines
 * becomes a whole-line range. A run of removed lines with no corresponding
 * addition becomes a deterministic zero-width anchor at the resulting
 * position where the deletion occurred, so structural analysis can still
 * associate it with an enclosing resulting-content construct.
 */
export function reconstructChangedRanges(
  beforeContent: string,
  afterContent: string,
): readonly SourceRange[] {
  const parts = diffLines(beforeContent, afterContent);
  const ranges: SourceRange[] = [];
  let newLine = 1;

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;

    if (part.added) {
      ranges.push({
        start: { line: newLine, column: 1 },
        end: { line: newLine + part.count, column: 1 },
      });
      newLine += part.count;
    } else if (part.removed) {
      const nextPart = parts[index + 1];
      if (nextPart?.added !== true) {
        ranges.push({
          start: { line: newLine, column: 1 },
          end: { line: newLine, column: 1 },
        });
      }
      // A removal directly followed by an addition does not advance
      // `newLine`; the addition's own range represents the replaced
      // resulting content.
    } else {
      newLine += part.count;
    }
  }

  return ranges;
}

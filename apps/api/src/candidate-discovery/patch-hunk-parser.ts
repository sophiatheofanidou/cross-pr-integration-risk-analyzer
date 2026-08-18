/**
 * Provider unified-diff patch parsing into reliable resulting-content
 * changed ranges.
 *
 * See docs/design/04-candidate-discovery.md (Resulting-Content Search,
 * Changed-File Support) and ADR-011. A provider patch is usable only when
 * every hunk can be consumed consistently into reliable resulting-content
 * ranges; missing patches, malformed/truncated hunk bodies or inconsistent
 * hunk counts make the whole patch unusable so the caller falls back to
 * bounded local diff reconstruction instead of trusting a partial result.
 */

import type { SourceRange } from '../domain/source-location.js';

const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export type PatchParseResult =
  | { readonly usable: true; readonly changedRanges: readonly SourceRange[] }
  | { readonly usable: false };

interface ParsedHunk {
  readonly newStart: number;
  readonly newLines: number;
  readonly oldLines: number;
  readonly bodyLines: readonly string[];
}

/**
 * Splits a patch into its hunks. Returns `null` when the patch contains
 * anything outside a recognized hunk header followed by a hunk body
 * (e.g. a truncated or non-standard patch format).
 */
function splitHunks(patch: string): ParsedHunk[] | null {
  const lines = patch.split('\n');
  const hunks: ParsedHunk[] = [];
  let index = 0;

  while (index < lines.length) {
    // Ignore a single trailing empty line produced by a final "\n" in the patch text.
    if (lines[index] === '' && index === lines.length - 1) {
      break;
    }

    const header = lines[index]!;
    const match = HUNK_HEADER_PATTERN.exec(header);
    if (!match) {
      return null;
    }
    const newStart = Number(match[3]);
    const newLines = match[4] !== undefined ? Number(match[4]) : 1;
    const oldLines = match[2] !== undefined ? Number(match[2]) : 1;
    index++;

    const bodyLines: string[] = [];
    while (index < lines.length && !HUNK_HEADER_PATTERN.test(lines[index]!)) {
      if (lines[index] === '' && index === lines.length - 1) {
        index++;
        continue;
      }
      bodyLines.push(lines[index]!);
      index++;
    }

    hunks.push({ newStart, newLines, oldLines, bodyLines });
  }

  return hunks;
}

/**
 * Extracts the resulting-content changed ranges for one hunk. Consecutive
 * added/removed lines form one changed run. A run with at least one added
 * line becomes a whole-line range over the added lines. A run with only
 * removed lines becomes a deterministic zero-width anchor at the resulting
 * position where the deletion occurred, so structural analysis can still
 * associate it with an enclosing resulting-content construct.
 *
 * Returns `null` when the hunk body is inconsistent with its declared
 * line counts (a truncated or malformed hunk).
 */
function extractChangedRanges(hunk: ParsedHunk): SourceRange[] | null {
  let newLine = hunk.newStart;
  let contextOrAddedCount = 0;
  let contextOrRemovedCount = 0;

  const ranges: SourceRange[] = [];
  let plusStart: number | null = null;
  let plusEnd: number | null = null;
  let hasMinus = false;
  let anchorLine: number | null = null;

  const flush = (): void => {
    if (plusStart !== null && plusEnd !== null) {
      ranges.push({ start: { line: plusStart, column: 1 }, end: { line: plusEnd, column: 1 } });
    } else if (hasMinus && anchorLine !== null) {
      ranges.push({
        start: { line: anchorLine, column: 1 },
        end: { line: anchorLine, column: 1 },
      });
    }
    plusStart = null;
    plusEnd = null;
    hasMinus = false;
    anchorLine = null;
  };

  for (const bodyLine of hunk.bodyLines) {
    if (bodyLine.startsWith('\\')) {
      // "\ No newline at end of file" — not a content line.
      continue;
    }
    if (bodyLine.length === 0) {
      // A genuine content line always carries a marker character, even a
      // blank context line (" "); a truly empty line is malformed.
      return null;
    }

    const marker = bodyLine.charAt(0);
    if (marker === ' ') {
      flush();
      contextOrAddedCount++;
      contextOrRemovedCount++;
      newLine++;
    } else if (marker === '+') {
      if (plusStart === null) {
        plusStart = newLine;
      }
      plusEnd = newLine + 1;
      contextOrAddedCount++;
      newLine++;
    } else if (marker === '-') {
      if (!hasMinus && plusStart === null) {
        anchorLine = newLine;
      }
      hasMinus = true;
      contextOrRemovedCount++;
    } else {
      return null;
    }
  }
  flush();

  if (contextOrAddedCount !== hunk.newLines || contextOrRemovedCount !== hunk.oldLines) {
    return null;
  }

  return ranges;
}

/**
 * Validates one resulting-content changed range against the actual
 * resulting content, so a syntactically consistent hunk whose declared
 * line numbers are impossible for that content (e.g. a hunk header
 * claiming line 100 in a one-line file) is rejected rather than silently
 * accepted (docs/design/04-candidate-discovery.md, Resulting-Content
 * Search).
 *
 * A whole-line range must start at an existing line and may end at most
 * one line past the last line (representing content up to EOF). A
 * zero-width range (a deletion-only anchor) may sit anywhere from the
 * first line up to and including the exclusive EOF position.
 */
export function isRangeWithinContent(range: SourceRange, content: string): boolean {
  const lineCount = content.split('\n').length;
  const isZeroWidth = range.start.line === range.end.line && range.start.column === range.end.column;

  if (isZeroWidth) {
    return range.start.line >= 1 && range.start.line <= lineCount + 1;
  }

  return (
    range.start.line >= 1 &&
    range.start.line <= lineCount &&
    range.end.line > range.start.line &&
    range.end.line <= lineCount + 1
  );
}

/**
 * Parses a provider-supplied unified-diff patch for one file into reliable
 * resulting-content changed ranges. `undefined`/empty input, an
 * unrecognized format or any hunk that fails validation make the whole
 * patch unusable.
 */
export function parsePatch(patch: string | undefined): PatchParseResult {
  if (patch === undefined || patch.trim().length === 0) {
    return { usable: false };
  }

  const hunks = splitHunks(patch);
  if (hunks === null || hunks.length === 0) {
    return { usable: false };
  }

  const changedRanges: SourceRange[] = [];
  for (const hunk of hunks) {
    const ranges = extractChangedRanges(hunk);
    if (ranges === null) {
      return { usable: false };
    }
    changedRanges.push(...ranges);
  }

  if (changedRanges.length === 0) {
    return { usable: false };
  }

  return { usable: true, changedRanges };
}

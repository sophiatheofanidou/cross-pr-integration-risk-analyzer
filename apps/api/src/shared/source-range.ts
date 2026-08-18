/**
 * Pure position/range comparisons shared by structural analysis and
 * changed-range resolution. Operates on the domain's one-based,
 * start-inclusive/end-exclusive `SourceRange` convention
 * (see ../domain/source-location.ts).
 */

import type { SourcePosition, SourceRange } from '../domain/source-location.js';

/** Negative when `a` is before `b`, positive when after, zero when equal. */
export function comparePositions(a: SourcePosition, b: SourcePosition): number {
  return a.line - b.line || a.column - b.column;
}

/**
 * Whether two ranges share any content, under half-open interval semantics.
 * Two zero-width ranges at the same point are not considered overlapping,
 * since neither spans any content; use `positionWithinRange` for point
 * containment instead.
 */
export function rangesOverlap(a: SourceRange, b: SourceRange): boolean {
  return comparePositions(a.start, b.end) < 0 && comparePositions(b.start, a.end) < 0;
}

/** Whether `position` falls within `range` under start-inclusive/end-exclusive semantics. */
export function positionWithinRange(position: SourcePosition, range: SourceRange): boolean {
  return comparePositions(range.start, position) <= 0 && comparePositions(position, range.end) < 0;
}

/** Whether `outer` fully contains `inner` (inclusive of equal bounds). */
export function rangeContains(outer: SourceRange, inner: SourceRange): boolean {
  return (
    comparePositions(outer.start, inner.start) <= 0 &&
    comparePositions(inner.end, outer.end) <= 0
  );
}

/** Whether two ranges have identical start and end positions. */
export function rangesEqual(a: SourceRange, b: SourceRange): boolean {
  return comparePositions(a.start, b.start) === 0 && comparePositions(a.end, b.end) === 0;
}

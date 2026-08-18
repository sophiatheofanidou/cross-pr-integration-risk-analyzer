/**
 * Provider-neutral source coordinates shared by Candidate Discovery and
 * Context Retrieval.
 *
 * See docs/design/04-candidate-discovery.md (Evidence Model) and
 * docs/design/05-context-retrieval.md.
 *
 * Coordinate convention: one-based lines, one-based columns, a range's
 * start is inclusive and its end is exclusive.
 */

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

/**
 * A location within one pull request's resulting file content.
 */
export interface SourceLocation {
  readonly pullRequestId: string;
  readonly filePath: string;
  readonly range: SourceRange;
}

/**
 * Where a Technical Term Match's technical term was associated with a
 * changed region in one pull request
 * (docs/design/04-candidate-discovery.md, Evidence Model).
 */
export type ChangedRegionLocation = SourceLocation;

/**
 * Where a Technical Term Match found a matching structural occurrence in
 * the resulting content of a file changed by the other pull request. This
 * may be outside that pull request's patch
 * (docs/design/04-candidate-discovery.md, Resulting-Content Search).
 */
export type MatchingOccurrenceLocation = SourceLocation;

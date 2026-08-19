/**
 * Context Retrieval: prepares the focused information AI Risk Assessment
 * needs to evaluate one Candidate Pair, without sending the complete
 * repository.
 *
 * See docs/design/05-context-retrieval.md. This module reuses the content,
 * change representations and structural ranges already obtained during
 * Candidate Discovery (via `CandidateDiscoveryRun`); it never calls the
 * source-control provider or reparses a file.
 *
 * `RetrievedContext` packages the selected values for a Candidate Pair. It
 * is an implementation detail of this module: it is not a domain contract,
 * is not exported through the domain barrel, and does not generalize into
 * a repository-context abstraction.
 */

import type { CandidateDiscoveryRun } from '../candidate-discovery/candidate-discovery.js';
import type { PreparedFileFacts } from '../candidate-discovery/prepare-changed-file.js';
import type { PullRequestStructuralFacts } from '../candidate-discovery/pull-request-structural-facts.js';
import type { AnalysisWarning } from '../domain/analysis-warning.js';
import type { CandidatePair } from '../domain/candidate-pair.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { SourceRange } from '../domain/source-location.js';
import type { TechnicalTermMatch } from '../domain/technical-term-match.js';
import { rangesEqual } from '../shared/source-range.js';
import type { ChangedTermAssociation, StructuralTermOccurrence } from '../structural-analysis/structural-analyzer.js';

/** Simple configurable bounds on selected material (docs/design/05-context-retrieval.md, Selection and Bounds). */
export interface ContextRetrievalBounds {
  readonly maxHunkLength: number;
  readonly maxSnippetLength: number;
  readonly maxTotalContextLength: number;
}

export const DEFAULT_CONTEXT_RETRIEVAL_BOUNDS: ContextRetrievalBounds = {
  maxHunkLength: 2000,
  maxSnippetLength: 1000,
  maxTotalContextLength: 20000,
};

/**
 * Concise pull-request metadata included in the retrieved context. Private
 * to this module — not a domain contract (docs/design/05-context-retrieval.md:
 * "The implementation may package these values in a small internal
 * object. That object is an implementation detail...").
 */
interface ConcisePullRequestMetadata {
  readonly id: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
}

/** The retrieved material for one Technical Term Match that retained sufficient context. Private to this module. */
interface RetrievedMatchContext {
  readonly match: TechnicalTermMatch;
  readonly changeHunk: string;
  readonly changedRegionSnippet: string;
  readonly matchingOccurrenceSnippet: string;
}

/** The packaged selected context for one Candidate Pair. Private to this module. */
interface RetrievedContext {
  readonly pullRequestA: ConcisePullRequestMetadata;
  readonly pullRequestB: ConcisePullRequestMetadata;
  readonly matches: readonly RetrievedMatchContext[];
  readonly warnings: readonly AnalysisWarning[];
}

/**
 * The result of one Context Retrieval call. Private to this module; callers
 * and tests rely on TypeScript's inference of `retrieveContext`'s return
 * type rather than importing this type by name.
 */
type ContextRetrievalOutcome =
  | { readonly sufficientContext: true; readonly context: RetrievedContext }
  | {
      readonly sufficientContext: false;
      readonly warnings: readonly [AnalysisWarning, ...AnalysisWarning[]];
    };

function toConciseMetadata(pullRequest: NormalizedPullRequest): ConcisePullRequestMetadata {
  return {
    id: pullRequest.id,
    sourceBranch: pullRequest.sourceBranch,
    targetBranch: pullRequest.targetBranch,
  };
}

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function findFile(
  facts: PullRequestStructuralFacts | undefined,
  filePath: string,
): PreparedFileFacts | undefined {
  return facts?.files.find((file) => file.filePath === filePath);
}

/**
 * Finds the enclosing snippet range for the matching-occurrence side, by
 * looking up the occurrence's own syntax range (docs/design/05-context-retrieval.md,
 * MVP Context: "the enclosing or bounded snippet around the matching
 * occurrence").
 */
function findOccurrenceEnclosingRange(
  occurrences: readonly StructuralTermOccurrence[],
  technicalTerm: string,
  range: SourceRange,
): SourceRange | undefined {
  return occurrences.find(
    (occurrence) => occurrence.technicalTerm === technicalTerm && rangesEqual(occurrence.range, range),
  )?.enclosingRange;
}

/**
 * Finds the enclosing snippet range for the changed-region side, by
 * looking up the actual changed range that associated the term with the
 * change (`changedRange`), not the term's own syntax range — the two
 * differ when the change is inside an enclosing declaration's body rather
 * than on its name (docs/design/04-candidate-discovery.md, Language-Aware
 * Structural Analysis).
 */
function findChangedRegionEnclosingRange(
  changedTerms: readonly ChangedTermAssociation[],
  technicalTerm: string,
  changedRange: SourceRange,
): SourceRange | undefined {
  return changedTerms.find(
    (term) => term.technicalTerm === technicalTerm && rangesEqual(term.changedRange, changedRange),
  )?.enclosingRange;
}

/** Extracts the whole lines spanned by `range` from `content`, bounded to `maxLength` characters. */
function extractSnippet(content: string, range: SourceRange, maxLength: number): string {
  const lines = content.split('\n');
  const endLineExclusive = range.end.column === 1 ? range.end.line : range.end.line + 1;
  const startLine = Math.max(1, range.start.line);
  const endLine = Math.min(endLineExclusive - 1, lines.length);
  if (endLine < startLine) {
    return '';
  }
  return truncate(lines.slice(startLine - 1, endLine).join('\n'), maxLength);
}

const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Extracts just the hunk covering `line` from a multi-hunk diff
 * representation, so a large file's diff is not truncated from the start
 * (which could discard the evidence that selected the pair). Falls back to
 * the bounded whole text when no hunk's declared range covers the line.
 */
function extractHunkAroundLine(diffText: string, line: number, maxLength: number): string {
  const lines = diffText.split('\n');
  const headers: { readonly index: number; readonly start: number; readonly end: number }[] = [];

  for (let index = 0; index < lines.length; index++) {
    const match = HUNK_HEADER_PATTERN.exec(lines[index]!);
    if (match) {
      const newStart = Number(match[3]);
      const newLines = match[4] !== undefined ? Number(match[4]) : 1;
      headers.push({ index, start: newStart, end: newStart + newLines });
    }
  }

  for (let h = 0; h < headers.length; h++) {
    const header = headers[h]!;
    if (line >= header.start && line < header.end) {
      const sectionEnd = h + 1 < headers.length ? headers[h + 1]!.index : lines.length;
      return truncate(lines.slice(header.index, sectionEnd).join('\n'), maxLength);
    }
  }

  return truncate(diffText, maxLength);
}

/**
 * Builds a Candidate-Pair-scoped `CONTEXT_OMITTED` warning. The warning's
 * primary `pullRequestId` and `filePath` are drawn from the match's own
 * changed-region location — the pull request whose change this omitted
 * match actually concerns — not always PR A, so a reverse-direction match
 * (whose changed region belongs to PR B) is reported against PR B rather
 * than misattributed to PR A.
 */
function omittedWarning(
  pullRequestA: NormalizedPullRequest,
  pullRequestB: NormalizedPullRequest,
  match: TechnicalTermMatch,
  message: string,
): AnalysisWarning {
  const changedPullRequestId = match.changedRegionLocation.pullRequestId;
  const relatedPullRequestId =
    changedPullRequestId === pullRequestA.id ? pullRequestB.id : pullRequestA.id;
  return {
    pullRequestId: changedPullRequestId,
    relatedPullRequestId,
    filePath: match.changedRegionLocation.filePath,
    reason: 'CONTEXT_OMITTED',
    message,
  };
}

/**
 * Retrieves and bounds the focused context for one Candidate Pair. Selects
 * match-centered hunks and snippets before applying `bounds`
 * (docs/design/05-context-retrieval.md, Selection and Bounds). Every
 * match, including the first, must fit within `maxTotalContextLength`; if
 * none fit, the pair is reported as lacking sufficient context rather than
 * silently accepting material that exceeds the configured bound.
 */
export function retrieveContext(
  candidatePair: CandidatePair,
  run: CandidateDiscoveryRun,
  bounds: ContextRetrievalBounds = DEFAULT_CONTEXT_RETRIEVAL_BOUNDS,
): ContextRetrievalOutcome {
  const { pullRequestA, pullRequestB, technicalTermMatches } = candidatePair;
  const factsByPullRequestId = new Map<string, PullRequestStructuralFacts | undefined>([
    [pullRequestA.id, run.pullRequestFacts.get(pullRequestA.id)],
    [pullRequestB.id, run.pullRequestFacts.get(pullRequestB.id)],
  ]);

  const includedMatches: RetrievedMatchContext[] = [];
  const omittedWarnings: AnalysisWarning[] = [];
  let totalLength = 0;

  for (const match of technicalTermMatches) {
    const changedFacts = factsByPullRequestId.get(match.changedRegionLocation.pullRequestId);
    const occurrenceFacts = factsByPullRequestId.get(match.matchingOccurrenceLocation.pullRequestId);
    const changedFile = findFile(changedFacts, match.changedRegionLocation.filePath);
    const occurrenceFile = findFile(occurrenceFacts, match.matchingOccurrenceLocation.filePath);

    const changedEnclosingRange =
      changedFile !== undefined
        ? findChangedRegionEnclosingRange(
            changedFile.changedTerms,
            match.technicalTerm,
            match.changedRegionLocation.range,
          )
        : undefined;
    const occurrenceEnclosingRange =
      occurrenceFile !== undefined
        ? findOccurrenceEnclosingRange(
            occurrenceFile.occurrences,
            match.technicalTerm,
            match.matchingOccurrenceLocation.range,
          )
        : undefined;

    const changedRegionSnippet =
      changedFile !== undefined && changedEnclosingRange !== undefined
        ? extractSnippet(changedFile.content, changedEnclosingRange, bounds.maxSnippetLength)
        : '';
    const matchingOccurrenceSnippet =
      occurrenceFile !== undefined && occurrenceEnclosingRange !== undefined
        ? extractSnippet(occurrenceFile.content, occurrenceEnclosingRange, bounds.maxSnippetLength)
        : '';
    const changeHunk =
      changedFile !== undefined
        ? extractHunkAroundLine(
            changedFile.changeRepresentation,
            match.changedRegionLocation.range.start.line,
            bounds.maxHunkLength,
          )
        : '';

    const isSufficient =
      changeHunk.length > 0 && changedRegionSnippet.length > 0 && matchingOccurrenceSnippet.length > 0;

    if (!isSufficient) {
      omittedWarnings.push(
        omittedWarning(
          pullRequestA,
          pullRequestB,
          match,
          `Technical Term Match for "${match.technicalTerm}" could not be included reliably in the retrieved context`,
        ),
      );
      continue;
    }

    const matchLength = changeHunk.length + changedRegionSnippet.length + matchingOccurrenceSnippet.length;
    if (totalLength + matchLength > bounds.maxTotalContextLength) {
      omittedWarnings.push(
        omittedWarning(
          pullRequestA,
          pullRequestB,
          match,
          `Technical Term Match for "${match.technicalTerm}" was omitted because the pair's total retrieved context bound was reached`,
        ),
      );
      continue;
    }

    includedMatches.push({ match, changeHunk, changedRegionSnippet, matchingOccurrenceSnippet });
    totalLength += matchLength;
  }

  const relevantDiscoveryWarnings = run.result.warnings.filter(
    (warning) => warning.pullRequestId === pullRequestA.id || warning.pullRequestId === pullRequestB.id,
  );

  if (includedMatches.length === 0) {
    return {
      sufficientContext: false,
      warnings: [
        {
          pullRequestId: pullRequestA.id,
          relatedPullRequestId: pullRequestB.id,
          reason: 'ASSESSMENT_NOT_RUN',
          message:
            'No Technical Term Match retained sufficient context; AI assessment was not run for this Candidate Pair',
        },
        ...relevantDiscoveryWarnings,
        ...omittedWarnings,
      ],
    };
  }

  return {
    sufficientContext: true,
    context: {
      pullRequestA: toConciseMetadata(pullRequestA),
      pullRequestB: toConciseMetadata(pullRequestB),
      matches: includedMatches,
      warnings: [...relevantDiscoveryWarnings, ...omittedWarnings],
    },
  };
}

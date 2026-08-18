/**
 * Technical Term Match evaluation between two pull requests' prepared
 * structural facts.
 *
 * See docs/design/04-candidate-discovery.md (Candidate Selection
 * Criterion, Same-File and Cross-File Matching, Resulting-Content Search).
 */

import type { TechnicalTermMatch } from '../domain/technical-term-match.js';
import type { PullRequestStructuralFacts } from './pull-request-structural-facts.js';

function matchDirection(
  changedSide: PullRequestStructuralFacts,
  occurrenceSide: PullRequestStructuralFacts,
): TechnicalTermMatch[] {
  const matches: TechnicalTermMatch[] = [];

  for (const changedFile of changedSide.files) {
    for (const changedTerm of changedFile.changedTerms) {
      for (const occurrenceFile of occurrenceSide.files) {
        for (const occurrence of occurrenceFile.occurrences) {
          if (occurrence.technicalTerm !== changedTerm.technicalTerm) {
            continue;
          }
          matches.push({
            technicalTerm: changedTerm.technicalTerm,
            changedRegionLocation: {
              pullRequestId: changedSide.pullRequest.id,
              filePath: changedFile.filePath,
              // The actual changed range that associated this term with the
              // change, not the term's own (possibly distant) syntax range
              // — see StructuralAnalysisResult.changedTerms.
              range: changedTerm.changedRange,
            },
            matchingOccurrenceLocation: {
              pullRequestId: occurrenceSide.pullRequest.id,
              filePath: occurrenceFile.filePath,
              range: occurrence.range,
            },
          });
        }
      }
    }
  }

  return matches;
}

function matchSortKey(match: TechnicalTermMatch): string {
  const { changedRegionLocation: c, matchingOccurrenceLocation: m } = match;
  // Complete start and end positions are included so that two matches for
  // the same term whose changed regions merely start at the same point
  // (e.g. the same enclosing declaration associated with two distinct
  // changed ranges of different extents) are not collapsed into one.
  return [
    match.technicalTerm,
    c.pullRequestId,
    c.filePath,
    c.range.start.line,
    c.range.start.column,
    c.range.end.line,
    c.range.end.column,
    m.pullRequestId,
    m.filePath,
    m.range.start.line,
    m.range.start.column,
    m.range.end.line,
    m.range.end.column,
  ].join('|');
}

/**
 * Evaluates both matching directions for one possible pair and returns a
 * deterministically ordered, duplicate-free list of Technical Term Matches
 * (docs/design/04-candidate-discovery.md, Candidate Selection Criterion:
 * "PR A changed terms -> PR B resulting changed files" and the reverse).
 */
export function computeTechnicalTermMatches(
  factsA: PullRequestStructuralFacts,
  factsB: PullRequestStructuralFacts,
): readonly TechnicalTermMatch[] {
  const matches = [...matchDirection(factsA, factsB), ...matchDirection(factsB, factsA)];

  const seen = new Set<string>();
  const deduped: TechnicalTermMatch[] = [];
  for (const match of matches) {
    const key = matchSortKey(match);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(match);
    }
  }

  deduped.sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
  return deduped;
}

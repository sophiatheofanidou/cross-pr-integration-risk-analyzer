/**
 * Candidate Pairs and the Candidate Discovery result.
 *
 * See docs/design/04-candidate-discovery.md (Candidate Selection Criterion,
 * Output; ADR-006).
 */

import type { AnalysisWarning } from './analysis-warning.js';
import type { NormalizedPullRequest } from './pull-request.js';
import type { TechnicalTermMatch } from './technical-term-match.js';

/**
 * Two pull requests selected for deeper analysis because their structural
 * changes share at least one Technical Term Match.
 *
 * Selection is derived from the non-empty match collection itself:
 * `isCandidate = technicalTermMatches.length > 0`. The contract therefore
 * stores neither a fixed evidence-rule ID nor a separate candidate boolean
 * (ADR-006).
 */
export interface CandidatePair {
  readonly pullRequestA: NormalizedPullRequest;
  readonly pullRequestB: NormalizedPullRequest;
  readonly technicalTermMatches: readonly [
    TechnicalTermMatch,
    ...TechnicalTermMatch[],
  ];
}

/**
 * The output of Candidate Discovery for one analysis run
 * (docs/design/04-candidate-discovery.md, Output).
 */
export interface CandidateDiscoveryResult {
  readonly candidatePairs: readonly CandidatePair[];
  readonly warnings: readonly AnalysisWarning[];
}

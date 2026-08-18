/**
 * Candidate Discovery orchestration: possible-pair generation, per-pull-
 * request structural facts preparation and Technical Term Match
 * evaluation.
 *
 * See docs/design/04-candidate-discovery.md (Pair Generation, Candidate
 * Selection Criterion, Output).
 */

import type { CandidateDiscoveryResult, CandidatePair } from '../domain/candidate-pair.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { RepositoryRef, SourceControlProvider } from '../source-control/source-control-provider.js';
import type { StructuralAnalyzer } from '../structural-analysis/structural-analyzer.js';
import { generatePossiblePairs } from './pair-generation.js';
import type { PullRequestStructuralFacts } from './pull-request-structural-facts.js';
import { prepareAllStructuralFacts } from './pull-request-structural-facts.js';
import { computeTechnicalTermMatches } from './technical-term-matching.js';

/**
 * The result of one Candidate Discovery run, together with the per-pull-
 * request structural facts prepared along the way. Context Retrieval
 * reuses `pullRequestFacts` — the same content, hunks and structural
 * ranges — rather than calling the source-control provider again or
 * reparsing files (docs/design/05-context-retrieval.md, Inputs).
 */
export interface CandidateDiscoveryRun {
  readonly result: CandidateDiscoveryResult;
  readonly pullRequestFacts: ReadonlyMap<string, PullRequestStructuralFacts>;
}

/**
 * Runs Candidate Discovery for a set of eligible pull requests: generates
 * every unordered same-target-branch pair once, prepares each pull
 * request's structural facts once, and selects a pair as a Candidate Pair
 * when its Technical Term Match collection is non-empty
 * (docs/design/04-candidate-discovery.md: `isCandidate =
 * technicalTermMatches.length > 0`).
 */
export async function discoverCandidates(
  pullRequests: readonly NormalizedPullRequest[],
  repository: RepositoryRef,
  sourceControlProvider: SourceControlProvider,
  analyzer: StructuralAnalyzer,
): Promise<CandidateDiscoveryRun> {
  const possiblePairs = generatePossiblePairs(pullRequests);
  const { factsByPullRequestId, warnings } = await prepareAllStructuralFacts(
    pullRequests,
    repository,
    sourceControlProvider,
    analyzer,
  );

  const candidatePairs: CandidatePair[] = [];
  for (const possiblePair of possiblePairs) {
    const factsA = factsByPullRequestId.get(possiblePair.pullRequestA.id);
    const factsB = factsByPullRequestId.get(possiblePair.pullRequestB.id);
    if (factsA === undefined || factsB === undefined) {
      continue;
    }

    const matches = computeTechnicalTermMatches(factsA, factsB);
    const [firstMatch, ...remainingMatches] = matches;
    if (firstMatch === undefined) {
      continue;
    }

    candidatePairs.push({
      pullRequestA: possiblePair.pullRequestA,
      pullRequestB: possiblePair.pullRequestB,
      technicalTermMatches: [firstMatch, ...remainingMatches],
    });
  }

  return {
    result: { candidatePairs, warnings },
    pullRequestFacts: factsByPullRequestId,
  };
}

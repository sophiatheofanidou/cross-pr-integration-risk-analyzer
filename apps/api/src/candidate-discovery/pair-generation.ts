/**
 * Deterministic possible pull-request pair generation.
 *
 * See docs/design/04-candidate-discovery.md (Pair Generation).
 */

import type { NormalizedPullRequest } from '../domain/pull-request.js';

/**
 * An unordered pair of eligible pull requests targeting the same branch,
 * considered for Candidate Discovery. `{A, B}` is the same pair as
 * `{B, A}`; only one is ever produced.
 */
export interface PossiblePair {
  readonly pullRequestA: NormalizedPullRequest;
  readonly pullRequestB: NormalizedPullRequest;
}

/**
 * Groups eligible pull requests by target branch and generates every
 * unordered pair within each group exactly once
 * (docs/design/04-candidate-discovery.md, Pair Generation:
 * `N x (N - 1) / 2` pairs per group).
 */
export function generatePossiblePairs(
  pullRequests: readonly NormalizedPullRequest[],
): readonly PossiblePair[] {
  const groupsByTargetBranch = new Map<string, NormalizedPullRequest[]>();
  for (const pullRequest of pullRequests) {
    const group = groupsByTargetBranch.get(pullRequest.targetBranch);
    if (group !== undefined) {
      group.push(pullRequest);
    } else {
      groupsByTargetBranch.set(pullRequest.targetBranch, [pullRequest]);
    }
  }

  const pairs: PossiblePair[] = [];
  for (const group of groupsByTargetBranch.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs.push({ pullRequestA: group[i]!, pullRequestB: group[j]! });
      }
    }
  }

  return pairs;
}

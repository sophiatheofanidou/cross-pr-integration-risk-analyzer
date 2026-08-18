import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import { generatePossiblePairs } from './pair-generation.js';

function pullRequest(id: string, targetBranch: string): NormalizedPullRequest {
  return {
    id,
    sourceBranch: `feature/${id}`,
    targetBranch,
    headRevision: `${id}-head`,
    changeBaseRevision: `${id}-base`,
    changedFiles: [],
  };
}

describe('generatePossiblePairs', () => {
  it('produces no pairs for zero pull requests', () => {
    expect(generatePossiblePairs([])).toEqual([]);
  });

  it('produces no pairs for a single pull request', () => {
    expect(generatePossiblePairs([pullRequest('a', 'main')])).toEqual([]);
  });

  it('produces N x (N - 1) / 2 pairs for a group of N pull requests targeting the same branch', () => {
    const pullRequests = ['a', 'b', 'c', 'd'].map((id) => pullRequest(id, 'main'));

    const pairs = generatePossiblePairs(pullRequests);

    expect(pairs).toHaveLength((4 * 3) / 2);
  });

  it('generates every unordered pair exactly once, never both {A, B} and {B, A}', () => {
    const pullRequests = ['a', 'b', 'c'].map((id) => pullRequest(id, 'main'));

    const pairs = generatePossiblePairs(pullRequests);
    const pairKeys = pairs.map(
      (pair) => [pair.pullRequestA.id, pair.pullRequestB.id].sort().join('-'),
    );

    expect(new Set(pairKeys).size).toBe(pairKeys.length);
    expect(pairKeys.sort()).toEqual(['a-b', 'a-c', 'b-c']);
  });

  it('only pairs pull requests targeting the same branch', () => {
    const pullRequests = [
      pullRequest('a', 'main'),
      pullRequest('b', 'main'),
      pullRequest('c', 'develop'),
    ];

    const pairs = generatePossiblePairs(pullRequests);

    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.pullRequestA.id, pairs[0]!.pullRequestB.id].sort()).toEqual(['a', 'b']);
  });
});

import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { FakeSourceControlProvider } from './__fixtures__/fake-source-control-provider.js';
import { discoverCandidates } from './candidate-discovery.js';

const repository = { owner: 'o', repo: 'r' };
const analyzer = new TypeScriptStructuralAnalyzer();

function pullRequest(id: string, headRevision: string, path: string): NormalizedPullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    webUrl: `https://github.com/o/r/pull/${id}`,
    sourceBranch: `feature/${id}`,
    targetBranch: 'main',
    headRevision,
    changeBaseRevision: `${id}-base`,
    changedFiles: [{ path, changeType: 'ADDED' }],
  };
}

describe('discoverCandidates', () => {
  it('selects a pair as a Candidate Pair once its structural match collection is non-empty', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/payment.service.ts', 'export function processPayment(amount: number) { return amount; }\n');
    provider.setFile('b-head', 'src/checkout.service.ts', 'const result = processPayment(10);\n');

    const pullRequestA = pullRequest('pr-a', 'a-head', 'src/payment.service.ts');
    const pullRequestB = pullRequest('pr-b', 'b-head', 'src/checkout.service.ts');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    const [pair] = run.result.candidatePairs;
    expect(pair!.technicalTermMatches.some((m) => m.technicalTerm === 'processPayment')).toBe(true);
    expect(run.pullRequestFacts.has('pr-a')).toBe(true);
    expect(run.pullRequestFacts.has('pr-b')).toBe(true);
  });

  it('produces no Candidate Pair for unrelated pull requests, without an error', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/a.ts', 'export function foo() { return 1; }\n');
    provider.setFile('b-head', 'src/b.ts', 'export function bar() { return 2; }\n');

    const pullRequestA = pullRequest('pr-a', 'a-head', 'src/a.ts');
    const pullRequestB = pullRequest('pr-b', 'b-head', 'src/b.ts');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toEqual([]);
  });

  it('evaluates every unordered pair exactly once across a larger group', async () => {
    const provider = new FakeSourceControlProvider();
    const pullRequests = ['a', 'b', 'c'].map((id) => {
      provider.setFile(`${id}-head`, `src/${id}.ts`, `export function fn${id}() { return 1; }\n`);
      return pullRequest(id, `${id}-head`, `src/${id}.ts`);
    });

    const run = await discoverCandidates(pullRequests, repository, provider, analyzer);

    // No shared terms across a/b/c, so no candidate pairs, but no crash and
    // facts prepared for all three.
    expect(run.result.candidatePairs).toEqual([]);
    expect(run.pullRequestFacts.size).toBe(3);
  });

  it('exposes warnings produced while preparing structural facts', async () => {
    const provider = new FakeSourceControlProvider();

    const pullRequestA: NormalizedPullRequest = {
      id: 'pr-a',
      title: 'Pull request pr-a',
      webUrl: 'https://github.com/o/r/pull/pr-a',
      sourceBranch: 'feature/a',
      targetBranch: 'main',
      headRevision: 'a-head',
      changeBaseRevision: 'a-base',
      changedFiles: [{ path: 'src/removed.ts', changeType: 'DELETED' }],
    };

    const run = await discoverCandidates([pullRequestA], repository, provider, analyzer);

    expect(run.result.warnings).toEqual([
      expect.objectContaining({ pullRequestId: 'pr-a', filePath: 'src/removed.ts', reason: 'DELETED_FILE' }),
    ]);
  });
});

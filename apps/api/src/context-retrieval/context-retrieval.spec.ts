import { describe, expect, it } from 'vitest';
import { discoverCandidates } from '../candidate-discovery/candidate-discovery.js';
import { FakeSourceControlProvider } from '../candidate-discovery/__fixtures__/fake-source-control-provider.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { retrieveContext } from './context-retrieval.js';

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

/**
 * A Candidate Pair with exactly one Technical Term Match (A -> B on
 * `processPayment`). PR B is `MODIFIED` with a patch touching only an
 * unrelated line, so `processPayment` is a plain occurrence for B (not
 * also a changed term) and no reverse-direction match is produced.
 */
async function discoverOneCandidatePair() {
  const provider = new FakeSourceControlProvider();
  provider.setFile(
    'a-head',
    'src/payment.service.ts',
    'export function processPayment(amount: number): number {\n  return amount;\n}\n',
  );
  provider.setFile(
    'b-head',
    'src/checkout.service.ts',
    'const result = processPayment(10);\nconst other = 1;\n',
  );

  const pullRequestA = pullRequest('pr-a', 'a-head', 'src/payment.service.ts');
  const pullRequestB: NormalizedPullRequest = {
    id: 'pr-b',
    title: 'Pull request pr-b',
    webUrl: 'https://github.com/o/r/pull/pr-b',
    sourceBranch: 'feature/pr-b',
    targetBranch: 'main',
    headRevision: 'b-head',
    changeBaseRevision: 'b-base',
    changedFiles: [
      {
        path: 'src/checkout.service.ts',
        changeType: 'MODIFIED',
        patch: '@@ -2,1 +2,1 @@\n-const other = 0;\n+const other = 1;',
      },
    ],
  };

  const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);
  const candidatePair = run.result.candidatePairs[0]!;
  return { run, candidatePair };
}

/**
 * A Candidate Pair with exactly two Technical Term Matches in opposite
 * directions: `alphaTerm`'s changed region belongs to PR A (matching an
 * occurrence in PR B), and `betaTerm`'s changed region belongs to PR B
 * (matching an occurrence in PR A). Each PR's patch touches only its own
 * term's declaration, so no other term becomes a changed term.
 */
async function discoverTwoDirectionMatchCandidatePair() {
  const provider = new FakeSourceControlProvider();
  provider.setFile(
    'a-head',
    'src/payment.service.ts',
    [
      'function alphaTerm() {',
      '  return 1;',
      '}',
      'function useBeta() {',
      '  return betaTerm();',
      '}',
      '',
    ].join('\n'),
  );
  provider.setFile(
    'b-head',
    'src/checkout.service.ts',
    ['function betaTerm() {', '  return 2;', '}', 'const x = alphaTerm();', ''].join('\n'),
  );

  const pullRequestA: NormalizedPullRequest = {
    id: 'pr-a',
    title: 'Pull request pr-a',
    webUrl: 'https://github.com/o/r/pull/pr-a',
    sourceBranch: 'feature/pr-a',
    targetBranch: 'main',
    headRevision: 'a-head',
    changeBaseRevision: 'a-base',
    changedFiles: [
      {
        path: 'src/payment.service.ts',
        changeType: 'MODIFIED',
        patch: '@@ -1,3 +1,3 @@\n function alphaTerm() {\n-  return 0;\n+  return 1;\n }',
      },
    ],
  };
  const pullRequestB: NormalizedPullRequest = {
    id: 'pr-b',
    title: 'Pull request pr-b',
    webUrl: 'https://github.com/o/r/pull/pr-b',
    sourceBranch: 'feature/pr-b',
    targetBranch: 'main',
    headRevision: 'b-head',
    changeBaseRevision: 'b-base',
    changedFiles: [
      {
        path: 'src/checkout.service.ts',
        changeType: 'MODIFIED',
        patch: '@@ -1,3 +1,3 @@\n function betaTerm() {\n-  return 0;\n+  return 2;\n }',
      },
    ],
  };

  const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);
  const candidatePair = run.result.candidatePairs[0]!;
  return { run, candidatePair };
}

describe('retrieveContext', () => {
  it('selects a non-empty change hunk and snippets for a Candidate Pair with a real match', async () => {
    const { run, candidatePair } = await discoverOneCandidatePair();

    const outcome = retrieveContext(candidatePair, run);

    expect(outcome.sufficientContext).toBe(true);
    if (outcome.sufficientContext) {
      expect(outcome.context.matches.length).toBeGreaterThan(0);
      const [matchContext] = outcome.context.matches;
      expect(matchContext!.changeHunk.length).toBeGreaterThan(0);
      expect(matchContext!.changedRegionSnippet).toContain('processPayment');
      expect(matchContext!.matchingOccurrenceSnippet).toContain('processPayment');
    }
  });

  it('includes only warnings relevant to either pull request in the pair', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile(
      'a-head',
      'src/payment.service.ts',
      'export function processPayment(amount: number): number {\n  return amount;\n}\n',
    );
    provider.setFile('b-head', 'src/checkout.service.ts', 'const result = processPayment(10);\n');

    const pullRequestA = pullRequest('pr-a', 'a-head', 'src/payment.service.ts');
    const pullRequestB = pullRequest('pr-b', 'b-head', 'src/checkout.service.ts');
    // A third, unrelated pull request whose warning must not leak into this pair's context.
    const pullRequestC: NormalizedPullRequest = {
      id: 'pr-c',
      title: 'Pull request pr-c',
      webUrl: 'https://github.com/o/r/pull/pr-c',
      sourceBranch: 'feature/c',
      targetBranch: 'main',
      headRevision: 'c-head',
      changeBaseRevision: 'c-base',
      changedFiles: [{ path: 'src/unrelated.ts', changeType: 'DELETED' }],
    };

    const run = await discoverCandidates(
      [pullRequestA, pullRequestB, pullRequestC],
      repository,
      provider,
      analyzer,
    );
    const candidatePair = run.result.candidatePairs.find(
      (pair) =>
        (pair.pullRequestA.id === 'pr-a' && pair.pullRequestB.id === 'pr-b') ||
        (pair.pullRequestA.id === 'pr-b' && pair.pullRequestB.id === 'pr-a'),
    )!;

    const outcome = retrieveContext(candidatePair, run);

    expect(outcome.sufficientContext).toBe(true);
    if (outcome.sufficientContext) {
      expect(outcome.context.warnings.every((warning) => warning.pullRequestId !== 'pr-c')).toBe(true);
    }
  });

  it('omits a match and warns when the configured bounds cannot accommodate it', async () => {
    const { run, candidatePair } = await discoverOneCandidatePair();

    const outcome = retrieveContext(candidatePair, run, {
      maxHunkLength: 0,
      maxSnippetLength: 0,
      maxTotalContextLength: 0,
    });

    expect(outcome.sufficientContext).toBe(false);
    if (!outcome.sufficientContext) {
      const assessmentNotRun = outcome.warnings.find(
        (warning) => warning.reason === 'ASSESSMENT_NOT_RUN',
      );
      expect(assessmentNotRun?.pullRequestId).toBe(candidatePair.pullRequestA.id);
      expect(assessmentNotRun?.relatedPullRequestId).toBe(candidatePair.pullRequestB.id);
      expect(outcome.warnings.some((warning) => warning.reason === 'CONTEXT_OMITTED')).toBe(true);
    }
  });

  describe('total context budget', () => {
    it('does not retain a match, even the first, once it exceeds the total context budget', async () => {
      const { run, candidatePair } = await discoverOneCandidatePair();

      // Measure how large the pair's one available match actually is.
      const generous = retrieveContext(candidatePair, run, {
        maxHunkLength: 10_000,
        maxSnippetLength: 10_000,
        maxTotalContextLength: 10_000,
      });
      expect(generous.sufficientContext).toBe(true);
      const fullLength =
        generous.sufficientContext && generous.context.matches.length > 0
          ? generous.context.matches[0]!.changeHunk.length +
            generous.context.matches[0]!.changedRegionSnippet.length +
            generous.context.matches[0]!.matchingOccurrenceSnippet.length
          : 0;
      expect(fullLength).toBeGreaterThan(0);

      const tooSmall = retrieveContext(candidatePair, run, {
        maxHunkLength: 10_000,
        maxSnippetLength: 10_000,
        maxTotalContextLength: fullLength - 1,
      });

      expect(tooSmall.sufficientContext).toBe(false);
      if (!tooSmall.sufficientContext) {
        expect(tooSmall.warnings.some((warning) => warning.reason === 'ASSESSMENT_NOT_RUN')).toBe(true);
        expect(tooSmall.warnings.some((warning) => warning.reason === 'CONTEXT_OMITTED')).toBe(true);
      }
    });

    it('retains one complete match once the total budget exactly fits it', async () => {
      const { run, candidatePair } = await discoverOneCandidatePair();

      const generous = retrieveContext(candidatePair, run, {
        maxHunkLength: 10_000,
        maxSnippetLength: 10_000,
        maxTotalContextLength: 10_000,
      });
      const fullLength =
        generous.sufficientContext && generous.context.matches.length > 0
          ? generous.context.matches[0]!.changeHunk.length +
            generous.context.matches[0]!.changedRegionSnippet.length +
            generous.context.matches[0]!.matchingOccurrenceSnippet.length
          : 0;

      const exact = retrieveContext(candidatePair, run, {
        maxHunkLength: 10_000,
        maxSnippetLength: 10_000,
        maxTotalContextLength: fullLength,
      });

      expect(exact.sufficientContext).toBe(true);
      if (exact.sufficientContext) {
        expect(exact.context.matches).toHaveLength(1);
      }
    });

    it('omits a later match once the remaining total budget is insufficient, while keeping the earlier one', async () => {
      const { run, candidatePair } = await discoverTwoDirectionMatchCandidatePair();

      const generous = retrieveContext(candidatePair, run, {
        maxHunkLength: 10_000,
        maxSnippetLength: 10_000,
        maxTotalContextLength: 10_000,
      });
      expect(generous.sufficientContext).toBe(true);
      expect(generous.sufficientContext && generous.context.matches).toHaveLength(2);
      const firstMatchLength =
        generous.sufficientContext && generous.context.matches.length > 0
          ? generous.context.matches[0]!.changeHunk.length +
            generous.context.matches[0]!.changedRegionSnippet.length +
            generous.context.matches[0]!.matchingOccurrenceSnippet.length
          : 0;

      // Exactly enough budget for the first match, not the second.
      const outcome = retrieveContext(candidatePair, run, {
        maxHunkLength: 10_000,
        maxSnippetLength: 10_000,
        maxTotalContextLength: firstMatchLength,
      });

      expect(outcome.sufficientContext).toBe(true);
      if (outcome.sufficientContext) {
        expect(outcome.context.matches).toHaveLength(1);
        expect(outcome.context.matches[0]!.match.technicalTerm).toBe('alphaTerm');
        expect(
          outcome.context.warnings.some(
            (warning) => warning.reason === 'CONTEXT_OMITTED' && warning.pullRequestId === 'pr-b',
          ),
        ).toBe(true);
      }
    });
  });

  it('reports an omitted-match warning against the pull request that owns the changed region, not always PR A', async () => {
    const { run, candidatePair } = await discoverTwoDirectionMatchCandidatePair();

    const generous = retrieveContext(candidatePair, run, {
      maxHunkLength: 10_000,
      maxSnippetLength: 10_000,
      maxTotalContextLength: 10_000,
    });
    const firstMatchLength =
      generous.sufficientContext && generous.context.matches.length > 0
        ? generous.context.matches[0]!.changeHunk.length +
          generous.context.matches[0]!.changedRegionSnippet.length +
          generous.context.matches[0]!.matchingOccurrenceSnippet.length
        : 0;

    const outcome = retrieveContext(candidatePair, run, {
      maxHunkLength: 10_000,
      maxSnippetLength: 10_000,
      // Enough for the first (PR A) match only; the second (PR B) match is omitted.
      maxTotalContextLength: firstMatchLength,
    });

    expect(outcome.sufficientContext).toBe(true);
    if (outcome.sufficientContext) {
      const omitted = outcome.context.warnings.find((warning) => warning.reason === 'CONTEXT_OMITTED');
      expect(omitted).toBeDefined();
      // The omitted match (betaTerm) originates from PR B: the warning must
      // be scoped to PR B and its changed file, with PR A only related.
      expect(omitted!.pullRequestId).toBe('pr-b');
      expect(omitted!.filePath).toBe('src/checkout.service.ts');
      expect(omitted!.relatedPullRequestId).toBe('pr-a');
    }
  });
});

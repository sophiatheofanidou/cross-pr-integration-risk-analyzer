import { describe, expect, it } from 'vitest';
import { FakeSourceControlProvider } from '../candidate-discovery/__fixtures__/fake-source-control-provider.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { RiskResult } from '../domain/risk-result.js';
import { FakeRiskAnalysisProvider } from '../risk-analysis/__fixtures__/fake-risk-analysis-provider.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { runAnalysis, type AnalysisDependencies } from './analysis-application-service.js';

const repository = { owner: 'acme', repo: 'payments-platform' };
const analyzer = new TypeScriptStructuralAnalyzer();

function pullRequest(id: string, path: string, changeType: 'ADDED' = 'ADDED'): NormalizedPullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    webUrl: `https://github.com/acme/payments-platform/pull/${id}`,
    sourceBranch: `feature/${id}`,
    targetBranch: 'main',
    headRevision: `${id}-head`,
    changeBaseRevision: `${id}-base`,
    changedFiles: [{ path, changeType }],
  };
}

function dependencies(
  sourceControlProvider: FakeSourceControlProvider,
  riskAnalysisProvider: FakeRiskAnalysisProvider,
  contextRetrievalBounds?: AnalysisDependencies['contextRetrievalBounds'],
): AnalysisDependencies {
  return {
    sourceControlProvider,
    structuralAnalyzer: analyzer,
    riskAnalysisProvider,
    contextRetrievalBounds,
  };
}

const riskIdentified: RiskResult = {
  status: 'RISK_IDENTIFIED',
  potentialIntegrationProblem:
    'PR A changes processPayment in a way PR B still calls without adjustment.',
  reviewerAction: 'Verify the combined callers of processPayment.',
  confidence: 'HIGH',
  severity: 'MEDIUM',
};

const noRiskIdentified: RiskResult = {
  status: 'NO_RISK_IDENTIFIED',
  noRiskExplanation: 'The shared name belongs to unrelated local functions.',
  confidence: 'HIGH',
};

describe('runAnalysis', () => {
  it('returns a successful empty report for an empty eligible scope', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setEligiblePullRequests([]);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([]);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, riskAnalysisProvider),
    );

    expect(report).toEqual({
      repositoryUrl: 'https://github.com/acme/payments-platform',
      targetBranch: 'main',
      status: 'COMPLETED',
      summary: {
        eligiblePullRequestCount: 0,
        possiblePairCount: 0,
        candidatePairCount: 0,
        assessedPairCount: 0,
        riskIdentifiedCount: 0,
        notAssessedCount: 0,
        noRiskIdentifiedCount: 0,
      },
      eligiblePullRequests: [],
      candidatePairs: [],
      warnings: [],
    });
  });

  it('derives eligiblePullRequestCount and possiblePairCount from the eligible scope even with no Candidate Pairs', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile('pr-a-head', 'src/a.ts', 'export function alpha() { return 1; }\n');
    sourceControlProvider.setFile('pr-b-head', 'src/b.ts', 'export function beta() { return 2; }\n');
    sourceControlProvider.setFile('pr-c-head', 'src/c.ts', 'export function gamma() { return 3; }\n');
    sourceControlProvider.setEligiblePullRequests([
      pullRequest('pr-a', 'src/a.ts'),
      pullRequest('pr-b', 'src/b.ts'),
      pullRequest('pr-c', 'src/c.ts'),
    ]);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([]);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, riskAnalysisProvider),
    );

    expect(report.summary.eligiblePullRequestCount).toBe(3);
    expect(report.summary.possiblePairCount).toBe(3); // 3 * 2 / 2
    expect(report.summary.candidatePairCount).toBe(0);
    expect(report.candidatePairs).toEqual([]);
    expect(report.status).toBe('COMPLETED');
    expect(riskAnalysisProvider.calls).toEqual([]);
  });

  it('reports assessed risk and no-risk Candidate Pairs, deriving assessedPairCount from both', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile('pr-a-head', 'src/a.ts', 'export function processPayment() { return 1; }\n');
    sourceControlProvider.setFile('pr-b-head', 'src/b.ts', 'const paymentResult = processPayment();\n');
    sourceControlProvider.setFile('pr-c-head', 'src/c.ts', 'export function handler() { return 2; }\n');
    sourceControlProvider.setFile('pr-d-head', 'src/d.ts', 'const handlerResult = handler();\n');
    sourceControlProvider.setEligiblePullRequests([
      pullRequest('pr-a', 'src/a.ts'),
      pullRequest('pr-b', 'src/b.ts'),
      pullRequest('pr-c', 'src/c.ts'),
      pullRequest('pr-d', 'src/d.ts'),
    ]);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([riskIdentified, noRiskIdentified]);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, riskAnalysisProvider),
    );

    expect(report.summary.eligiblePullRequestCount).toBe(4);
    expect(report.summary.possiblePairCount).toBe(6); // 4 * 3 / 2
    expect(report.summary.candidatePairCount).toBe(2);
    expect(report.summary.assessedPairCount).toBe(2);
    expect(report.summary.riskIdentifiedCount).toBe(1);
    expect(report.summary.noRiskIdentifiedCount).toBe(1);
    expect(report.summary.notAssessedCount).toBe(0);
    expect(report.candidatePairs).toHaveLength(2);
    expect(report.candidatePairs[0]!.assessment).toEqual({ state: 'COMPLETED', result: riskIdentified });
    expect(report.candidatePairs[1]!.assessment).toEqual({ state: 'COMPLETED', result: noRiskIdentified });
    // Compact PR display metadata only, not the full normalized pull request.
    expect(report.candidatePairs[0]!.pullRequestA).toEqual({
      id: 'pr-a',
      title: 'Pull request pr-a',
      webUrl: 'https://github.com/acme/payments-platform/pull/pr-a',
    });
    expect(report.candidatePairs[0]!.technicalTermMatches.length).toBeGreaterThan(0);
  });

  it('reports a Candidate Pair without sufficient context as NOT_RUN/INSUFFICIENT_CONTEXT', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile('pr-a-head', 'src/a.ts', 'export function processPayment() { return 1; }\n');
    sourceControlProvider.setFile('pr-b-head', 'src/b.ts', 'const result = processPayment();\n');
    sourceControlProvider.setEligiblePullRequests([
      pullRequest('pr-a', 'src/a.ts'),
      pullRequest('pr-b', 'src/b.ts'),
    ]);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([]);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, riskAnalysisProvider, {
        maxHunkLength: 0,
        maxSnippetLength: 0,
        maxTotalContextLength: 0,
      }),
    );

    expect(report.summary.candidatePairCount).toBe(1);
    expect(report.summary.notAssessedCount).toBe(1);
    expect(report.summary.assessedPairCount).toBe(0);
    expect(report.candidatePairs[0]!.assessment).toEqual({
      state: 'NOT_RUN',
      reason: 'INSUFFICIENT_CONTEXT',
      message: expect.any(String),
    });
    expect(report.status).toBe('COMPLETED_WITH_WARNINGS');
    expect(report.warnings.some((warning) => warning.reason === 'ASSESSMENT_NOT_RUN')).toBe(true);
    expect(riskAnalysisProvider.calls).toEqual([]);
  });

  it('preserves other assessed pairs when one pair fails at the provider, reporting it as NOT_RUN/PROVIDER_FAILURE', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile('pr-a-head', 'src/a.ts', 'export function processPayment() { return 1; }\n');
    sourceControlProvider.setFile('pr-b-head', 'src/b.ts', 'const paymentResult = processPayment();\n');
    sourceControlProvider.setFile('pr-c-head', 'src/c.ts', 'export function handler() { return 2; }\n');
    sourceControlProvider.setFile('pr-d-head', 'src/d.ts', 'const handlerResult = handler();\n');
    sourceControlProvider.setEligiblePullRequests([
      pullRequest('pr-a', 'src/a.ts'),
      pullRequest('pr-b', 'src/b.ts'),
      pullRequest('pr-c', 'src/c.ts'),
      pullRequest('pr-d', 'src/d.ts'),
    ]);
    const providerFailure = new Error('provider unavailable');
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([riskIdentified, providerFailure]);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, riskAnalysisProvider),
    );

    expect(report.candidatePairs).toHaveLength(2);
    expect(report.candidatePairs[0]!.assessment).toEqual({ state: 'COMPLETED', result: riskIdentified });
    expect(report.candidatePairs[1]!.assessment).toEqual({
      state: 'NOT_RUN',
      reason: 'PROVIDER_FAILURE',
      message: expect.any(String),
    });
    // The sanitized message must never leak the raw provider error.
    expect(
      (report.candidatePairs[1]!.assessment as { message: string }).message,
    ).not.toContain('provider unavailable');
    expect(report.summary.riskIdentifiedCount).toBe(1);
    expect(report.summary.notAssessedCount).toBe(1);
    expect(report.summary.assessedPairCount).toBe(1);
    expect(report.warnings.some((warning) => warning.reason === 'ASSESSMENT_NOT_RUN')).toBe(true);
    expect(
      report.warnings.every((warning) => !JSON.stringify(warning).includes('provider unavailable')),
    ).toBe(true);
    expect(report.status).toBe('COMPLETED_WITH_WARNINGS');
  });

  it('deterministically deduplicates a warning shared by multiple Candidate Pairs and the top-level discovery result', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile(
      'pr-a-head',
      'src/a.ts',
      'export function alpha() { return 1; }\nexport function beta() { return 2; }\n',
    );
    sourceControlProvider.setFile('pr-b-head', 'src/b.ts', 'const x = alpha();\n');
    sourceControlProvider.setFile('pr-c-head', 'src/c.ts', 'const y = beta();\n');
    const pullRequestA: NormalizedPullRequest = {
      ...pullRequest('pr-a', 'src/a.ts'),
      changedFiles: [
        { path: 'src/a.ts', changeType: 'ADDED' },
        { path: 'src/unused.tsx', changeType: 'ADDED' },
      ],
    };
    sourceControlProvider.setEligiblePullRequests([
      pullRequestA,
      pullRequest('pr-b', 'src/b.ts'),
      pullRequest('pr-c', 'src/c.ts'),
    ]);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([noRiskIdentified, noRiskIdentified]);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, riskAnalysisProvider),
    );

    expect(report.summary.candidatePairCount).toBe(2);
    const unsupportedExtensionWarnings = report.warnings.filter(
      (warning) => warning.reason === 'UNSUPPORTED_FILE_EXTENSION' && warning.pullRequestId === 'pr-a',
    );
    expect(unsupportedExtensionWarnings).toHaveLength(1);
  });

  it('never exposes revisions, patches, source content or changed-file lists in the report', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile('pr-a-head', 'src/a.ts', 'export function processPayment() { return 1; }\n');
    sourceControlProvider.setFile('pr-b-head', 'src/b.ts', 'const result = processPayment();\n');
    sourceControlProvider.setEligiblePullRequests([
      { ...pullRequest('pr-a', 'src/a.ts'), changedFiles: [{ path: 'src/a.ts', changeType: 'ADDED', patch: '@@ secret-patch-marker @@' }] },
      pullRequest('pr-b', 'src/b.ts'),
    ]);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([noRiskIdentified]);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, riskAnalysisProvider),
    );

    expect(report.eligiblePullRequests[0]).not.toHaveProperty('changedFiles');
    expect(report.eligiblePullRequests[0]).not.toHaveProperty('headRevision');
    expect(report.eligiblePullRequests[0]).not.toHaveProperty('changeBaseRevision');
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('secret-patch-marker');
    expect(serialized).not.toContain('a-head');
    expect(serialized).not.toContain('a-base');
  });

  it('propagates a failure retrieving eligible pull requests rather than returning a partial report', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    const retrievalFailure = new Error('GitHub retrieval failed');
    sourceControlProvider.setEligiblePullRequests(retrievalFailure);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([]);

    await expect(
      runAnalysis(
        { repository, targetBranch: 'main' },
        dependencies(sourceControlProvider, riskAnalysisProvider),
      ),
    ).rejects.toBe(retrievalFailure);
  });
});

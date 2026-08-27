import { describe, expect, it } from 'vitest';
import { FakeSourceControlProvider } from '../candidate-discovery/__fixtures__/fake-source-control-provider.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { RiskResult } from '../domain/risk-result.js';
import { FakeRiskAnalysisProvider } from '../risk-analysis/__fixtures__/fake-risk-analysis-provider.js';
import type { RiskAnalysisProvider } from '../risk-analysis/risk-analysis-provider.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import {
  runAnalysis,
  type AnalysisDependencies,
  type ProviderFailureDiagnostic,
} from './analysis-application-service.js';

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
  riskAnalysisProvider: RiskAnalysisProvider,
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
  likelyOutcome: 'Payment processing may fail.',
  pullRequestAContribution: 'PR A changes the processPayment contract.',
  pullRequestBContribution: 'PR B continues to use the previous contract.',
  combinedEffect: 'The combined caller may no longer satisfy the updated contract.',
  relevantCode: {
    pullRequestA: [{ pullRequestId: '1', technicalTerm: 'processPayment', filePath: 'src/a.ts', startLine: 1 }],
    pullRequestB: [{ pullRequestId: '2', technicalTerm: 'processPayment', filePath: 'src/b.ts', startLine: 1 }],
  },
  reviewerAction: 'Verify the combined callers of processPayment.',
  confidence: 'HIGH',
  severity: 'MEDIUM',
};

const noRiskIdentified: RiskResult = {
  status: 'NO_RISK_IDENTIFIED',
  relationshipSummary: 'The shared name appears in both pull requests.',
  independenceReason: 'The supplied functions are local to separate modules.',
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

  it('reports sanitized stage timings and final counts for a completed run', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setEligiblePullRequests([]);
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([]);
    const metrics: unknown[] = [];
    const baseDependencies = dependencies(sourceControlProvider, riskAnalysisProvider);

    await runAnalysis(
      { repository, targetBranch: 'main' },
      { ...baseDependencies, reportOperationalMetric: (metric) => metrics.push(metric) },
    );

    expect(metrics).toEqual([expect.objectContaining({
      event: 'analysis_run',
      outcome: 'COMPLETED',
      durationMs: expect.any(Number),
      eligiblePullRequestRetrievalMs: expect.any(Number),
      candidateDiscoveryMs: expect.any(Number),
      assessmentWallMs: expect.any(Number),
      eligiblePullRequestCount: 0,
      possiblePairCount: 0,
      candidatePairCount: 0,
      assessedPairCount: 0,
      notAssessedCount: 0,
      warningCount: 0,
    })]);
    expect(JSON.stringify(metrics)).not.toContain(repository.owner);
    expect(JSON.stringify(metrics)).not.toContain(repository.repo);
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

  it('assesses at most four Candidate Pairs concurrently while preserving discovery order', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    const pairInputs = [
      ['pr-a', 'src/a.ts', 'export function alpha() { return 1; }\n'],
      ['pr-b', 'src/b.ts', 'const alphaResult = alpha();\n'],
      ['pr-c', 'src/c.ts', 'export function beta() { return 2; }\n'],
      ['pr-d', 'src/d.ts', 'const betaResult = beta();\n'],
      ['pr-e', 'src/e.ts', 'export function gamma() { return 3; }\n'],
      ['pr-f', 'src/f.ts', 'const gammaResult = gamma();\n'],
      ['pr-g', 'src/g.ts', 'export function delta() { return 4; }\n'],
      ['pr-h', 'src/h.ts', 'const deltaResult = delta();\n'],
      ['pr-i', 'src/i.ts', 'export function epsilon() { return 5; }\n'],
      ['pr-j', 'src/j.ts', 'const epsilonResult = epsilon();\n'],
    ] as const;
    for (const [id, path, content] of pairInputs) {
      sourceControlProvider.setFile(`${id}-head`, path, content);
    }
    sourceControlProvider.setEligiblePullRequests(
      pairInputs.map(([id, path]) => pullRequest(id, path)),
    );

    let active = 0;
    let maxActive = 0;
    let started = 0;
    const releases: (() => void)[] = [];
    const provider: RiskAnalysisProvider = {
      async assess(): Promise<RiskResult> {
        active++;
        started++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
        return noRiskIdentified;
      },
    };

    const waitFor = async (condition: () => boolean): Promise<void> => {
      for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      expect(condition()).toBe(true);
    };

    const reportPromise = runAnalysis(
      { repository, targetBranch: 'main' },
      dependencies(sourceControlProvider, provider),
    );

    await waitFor(() => started === 4);
    expect(maxActive).toBe(4);
    releases.splice(0).forEach((release) => release());

    await waitFor(() => started === 5);
    expect(maxActive).toBe(4);
    releases.splice(0).forEach((release) => release());

    const report = await reportPromise;
    expect(report.candidatePairs.map((pair) => `${pair.pullRequestA.id}-${pair.pullRequestB.id}`))
      .toEqual(['pr-a-pr-b', 'pr-c-pr-d', 'pr-e-pr-f', 'pr-g-pr-h', 'pr-i-pr-j']);
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
    const providerFailure = Object.assign(new Error('provider unavailable'), {
      reason: 'INVALID_OUTPUT',
      requestID: 'req_test_provider_failure',
      status: 400,
      type: 'invalid_request_error',
      error: {
        error: {
          type: 'invalid_request_error',
          message: 'Schema is too complex for compilation.\nReduce union complexity.',
        },
      },
    });
    const riskAnalysisProvider = new FakeRiskAnalysisProvider([riskIdentified, providerFailure]);
    const diagnostics: ProviderFailureDiagnostic[] = [];
    const baseDependencies = dependencies(sourceControlProvider, riskAnalysisProvider);

    const report = await runAnalysis(
      { repository, targetBranch: 'main' },
      {
        ...baseDependencies,
        reportProviderFailure: (diagnostic) => diagnostics.push(diagnostic),
      },
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
    expect(diagnostics).toEqual([{
      pullRequestAId: 'pr-c',
      pullRequestBId: 'pr-d',
      errorName: 'Error',
      failureReason: 'INVALID_OUTPUT',
      requestId: 'req_test_provider_failure',
      httpStatus: 400,
      providerErrorType: 'invalid_request_error',
      providerMessage: 'Schema is too complex for compilation. Reduce union complexity.',
    }]);
    expect(JSON.stringify(diagnostics)).not.toContain('provider unavailable');
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

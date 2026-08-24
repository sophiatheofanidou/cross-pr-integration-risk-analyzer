import { describe, expect, it } from 'vitest';
import { FakeSourceControlProvider } from '../candidate-discovery/__fixtures__/fake-source-control-provider.js';
import { discoverCandidates } from '../candidate-discovery/candidate-discovery.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { RiskResult } from '../domain/risk-result.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { FakeRiskAnalysisProvider } from './__fixtures__/fake-risk-analysis-provider.js';
import {
  assessCandidatePair,
  assessCandidatePairs,
  RiskAnalysisProviderInvocationError,
} from './risk-assessment.js';

const repository = { owner: 'owner', repo: 'repository' };
const analyzer = new TypeScriptStructuralAnalyzer();

const riskIdentified: RiskResult = {
  status: 'RISK_IDENTIFIED',
  likelyOutcome: 'Payment processing may fail.',
  pullRequestAContribution: 'PR A requires a currency argument.',
  pullRequestBContribution: 'PR B still calls the previous signature.',
  combinedEffect: 'The combined caller may not satisfy the updated processPayment contract.',
  relevantCode: {
    pullRequestA: [{ pullRequestId: '1', technicalTerm: 'processPayment', filePath: 'src/a.ts', startLine: 1 }],
    pullRequestB: [{ pullRequestId: '2', technicalTerm: 'processPayment', filePath: 'src/b.ts', startLine: 1 }],
  },
  reviewerAction: 'Verify every combined call supplies a supported currency.',
  confidence: 'HIGH',
  severity: 'MEDIUM',
};

const noRiskIdentified: RiskResult = {
  status: 'NO_RISK_IDENTIFIED',
  relationshipSummary: 'The same name appears in both pull requests.',
  independenceReason: 'The supplied functions are local to separate modules.',
  confidence: 'HIGH',
};

function addedPullRequest(id: string, path: string): NormalizedPullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    webUrl: `https://github.com/o/r/pull/${id}`,
    sourceBranch: `feature/${id}`,
    targetBranch: 'main',
    headRevision: `${id}-head`,
    changeBaseRevision: `${id}-base`,
    changedFiles: [{ path, changeType: 'ADDED' }],
  };
}

async function discoverSignatureCandidatePair() {
  const sourceControlProvider = new FakeSourceControlProvider();
  sourceControlProvider.setFile(
    'pr-a-head',
    'src/payment.ts',
    'export function processPayment(amount: number, currency: string) { return amount; }\n',
  );
  sourceControlProvider.setFile(
    'pr-b-head',
    'src/checkout.ts',
    'const result = processPayment(total);\n',
  );

  return discoverCandidates(
    [
      addedPullRequest('pr-a', 'src/payment.ts'),
      addedPullRequest('pr-b', 'src/checkout.ts'),
    ],
    repository,
    sourceControlProvider,
    analyzer,
  );
}

describe('assessCandidatePairs', () => {
  it('returns a validated provider result and preserves the Candidate Pair evidence', async () => {
    const run = await discoverSignatureCandidatePair();
    const provider = new FakeRiskAnalysisProvider([riskIdentified]);

    const assessments = await assessCandidatePairs(run, provider);

    expect(assessments).toHaveLength(1);
    expect(assessments[0]).toEqual({
      kind: 'ASSESSED',
      candidatePair: run.result.candidatePairs[0],
      riskResult: riskIdentified,
      warnings: [],
    });
    expect(provider.calls).toHaveLength(1);
    expect(run.result.candidatePairs[0]!.technicalTermMatches).not.toHaveLength(0);
  });

  it('allows a coincidental same-name Candidate Pair to receive NO_RISK_IDENTIFIED', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile(
      'pr-a-head',
      'src/upload.ts',
      'export function handler(file: Buffer) { return file.length; }\n',
    );
    sourceControlProvider.setFile(
      'pr-b-head',
      'src/webhook.ts',
      'export function handler(event: string) { return event.length; }\n',
    );
    const run = await discoverCandidates(
      [
        addedPullRequest('pr-a', 'src/upload.ts'),
        addedPullRequest('pr-b', 'src/webhook.ts'),
      ],
      repository,
      sourceControlProvider,
      analyzer,
    );
    const provider = new FakeRiskAnalysisProvider([noRiskIdentified]);

    const assessments = await assessCandidatePairs(run, provider);

    expect(assessments[0]?.kind).toBe('ASSESSED');
    expect(assessments[0]?.kind === 'ASSESSED' && assessments[0].riskResult).toEqual(
      noRiskIdentified,
    );
    expect(provider.calls).toHaveLength(1);
  });

  it('does not call the provider when no Technical Term Match retains sufficient context', async () => {
    const run = await discoverSignatureCandidatePair();
    const provider = new FakeRiskAnalysisProvider([]);

    const assessments = await assessCandidatePairs(run, provider, {
      maxHunkLength: 0,
      maxSnippetLength: 0,
      maxTotalContextLength: 0,
    });

    expect(assessments).toHaveLength(1);
    expect(assessments[0]?.kind).toBe('NOT_ASSESSED');
    expect(
      assessments[0]?.warnings.some((warning) => warning.reason === 'ASSESSMENT_NOT_RUN'),
    ).toBe(true);
    expect(
      assessments[0]?.warnings.some((warning) => warning.reason === 'CONTEXT_OMITTED'),
    ).toBe(true);
    expect(provider.calls).toEqual([]);
  });

  it('calls the provider exactly once for every assessable Candidate Pair in the run', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    for (const id of ['pr-a', 'pr-b', 'pr-c']) {
      sourceControlProvider.setFile(
        `${id}-head`,
        `src/${id}.ts`,
        `export function sharedHandler(value: string) { return value; }\n`,
      );
    }
    const run = await discoverCandidates(
      ['pr-a', 'pr-b', 'pr-c'].map((id) => addedPullRequest(id, `src/${id}.ts`)),
      repository,
      sourceControlProvider,
      analyzer,
    );
    expect(run.result.candidatePairs).toHaveLength(3);
    const provider = new FakeRiskAnalysisProvider([
      noRiskIdentified,
      noRiskIdentified,
      noRiskIdentified,
    ]);

    const assessments = await assessCandidatePairs(run, provider);

    expect(assessments).toHaveLength(3);
    expect(provider.calls).toHaveLength(3);
    expect(assessments.every((assessment) => assessment.kind === 'ASSESSED')).toBe(true);
  });

  it('preserves non-critical discovery warnings in the assessed result and provider prompt', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile(
      'pr-a-head',
      'src/payment.ts',
      'export function processPayment() { return 1; }\n',
    );
    sourceControlProvider.setFile(
      'pr-b-head',
      'src/checkout.ts',
      'const result = processPayment();\n',
    );
    const pullRequestA: NormalizedPullRequest = {
      ...addedPullRequest('pr-a', 'src/payment.ts'),
      changedFiles: [
        { path: 'src/payment.ts', changeType: 'ADDED' },
        { path: 'src/view.tsx', changeType: 'ADDED' },
      ],
    };
    const run = await discoverCandidates(
      [pullRequestA, addedPullRequest('pr-b', 'src/checkout.ts')],
      repository,
      sourceControlProvider,
      analyzer,
    );
    expect(run.result.warnings).toEqual([
      expect.objectContaining({ reason: 'UNSUPPORTED_FILE_EXTENSION', pullRequestId: 'pr-a' }),
    ]);
    const provider = new FakeRiskAnalysisProvider([noRiskIdentified]);

    const assessments = await assessCandidatePairs(run, provider);

    expect(assessments[0]?.warnings).toEqual(run.result.warnings);
    expect(provider.calls[0]?.userMessage).toContain('UNSUPPORTED_FILE_EXTENSION');
  });

  it('fails fast on a provider error instead of returning a partial run or fabricating no risk', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    for (const id of ['pr-a', 'pr-b', 'pr-c']) {
      sourceControlProvider.setFile(
        `${id}-head`,
        `src/${id}.ts`,
        'export function sharedHandler(value: string) { return value; }\n',
      );
    }
    const run = await discoverCandidates(
      ['pr-a', 'pr-b', 'pr-c'].map((id) => addedPullRequest(id, `src/${id}.ts`)),
      repository,
      sourceControlProvider,
      analyzer,
    );
    const providerFailure = new Error('provider unavailable');
    const provider = new FakeRiskAnalysisProvider([
      noRiskIdentified,
      providerFailure,
      noRiskIdentified,
    ]);

    await expect(assessCandidatePairs(run, provider)).rejects.toMatchObject({
      name: 'RiskAnalysisProviderInvocationError',
      cause: providerFailure,
    } satisfies Partial<RiskAnalysisProviderInvocationError>);
    expect(provider.calls).toHaveLength(2);
  });

  it('carries pair-relevant context warnings when the provider invocation fails', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile(
      'pr-a-head',
      'src/payment.ts',
      'export function processPayment() { return 1; }\n',
    );
    sourceControlProvider.setFile(
      'pr-b-head',
      'src/checkout.ts',
      'const result = processPayment();\n',
    );
    const pullRequestA: NormalizedPullRequest = {
      ...addedPullRequest('pr-a', 'src/payment.ts'),
      changedFiles: [
        { path: 'src/payment.ts', changeType: 'ADDED' },
        { path: 'src/view.tsx', changeType: 'ADDED' },
      ],
    };
    const run = await discoverCandidates(
      [pullRequestA, addedPullRequest('pr-b', 'src/checkout.ts')],
      repository,
      sourceControlProvider,
      analyzer,
    );
    const providerFailure = new Error('provider unavailable');
    const provider = new FakeRiskAnalysisProvider([providerFailure]);

    await expect(assessCandidatePair(run.result.candidatePairs[0]!, run, provider)).rejects.toMatchObject({
      name: 'RiskAnalysisProviderInvocationError',
      cause: providerFailure,
      warnings: [expect.objectContaining({
        reason: 'UNSUPPORTED_FILE_EXTENSION',
        pullRequestId: 'pr-a',
      })],
    });
  });
});

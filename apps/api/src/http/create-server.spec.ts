import { describe, expect, it } from 'vitest';
import { FakeSourceControlProvider } from '../candidate-discovery/__fixtures__/fake-source-control-provider.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { RiskResult } from '../domain/risk-result.js';
import { FakeRiskAnalysisProvider } from '../risk-analysis/__fixtures__/fake-risk-analysis-provider.js';
import { GitHubHttpError } from '../source-control/github/github-client.js';
import type { FileContentResult, SourceControlProvider } from '../source-control/source-control-provider.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { createServer, type ServerDependencies } from './create-server.js';

const analyzer = new TypeScriptStructuralAnalyzer();

function pullRequest(id: string, path: string): NormalizedPullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    webUrl: `https://github.com/acme/payments-platform/pull/${id}`,
    sourceBranch: `feature/${id}`,
    targetBranch: 'main',
    headRevision: `${id}-head`,
    changeBaseRevision: `${id}-base`,
    changedFiles: [{ path, changeType: 'ADDED' }],
  };
}

const noRiskIdentified: RiskResult = {
  status: 'NO_RISK_IDENTIFIED',
  relationshipSummary: 'The shared name appears in both pull requests.',
  independenceReason: 'The supplied functions are local to separate modules.',
  confidence: 'HIGH',
};

/** A provider whose `getEligiblePullRequests` always rejects with the supplied error. */
class ThrowingSourceControlProvider implements SourceControlProvider {
  constructor(private readonly error: unknown) {}

  getEligiblePullRequests(): Promise<readonly NormalizedPullRequest[]> {
    return Promise.reject(this.error as Error);
  }

  getFileContent(): Promise<FileContentResult> {
    return Promise.reject(new Error('not used'));
  }
}

function baseDependencies(sourceControlProvider: SourceControlProvider): ServerDependencies {
  return {
    sourceControlProvider,
    structuralAnalyzer: analyzer,
    riskAnalysisProvider: new FakeRiskAnalysisProvider([noRiskIdentified]),
  };
}

describe('POST /api/analysis', () => {
  it('returns a validated 200 report for a valid request', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setFile('pr-a-head', 'src/a.ts', 'export function processPayment() { return 1; }\n');
    sourceControlProvider.setFile('pr-b-head', 'src/b.ts', 'const result = processPayment();\n');
    sourceControlProvider.setEligiblePullRequests([
      pullRequest('pr-a', 'src/a.ts'),
      pullRequest('pr-b', 'src/b.ts'),
    ]);
    const app = createServer(baseDependencies(sourceControlProvider));

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: {
        repositoryUrl: 'https://github.com/acme/payments-platform',
        targetBranch: 'main',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.repositoryUrl).toBe('https://github.com/acme/payments-platform');
    expect(body.summary.candidatePairCount).toBe(1);
    expect(body.candidatePairs[0].assessment).toEqual({ state: 'COMPLETED', result: noRiskIdentified });
  });

  it('returns 400 with a sanitized error body for an invalid repository URL', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    const app = createServer(baseDependencies(sourceControlProvider));

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: {
        repositoryUrl: 'https://gitlab.com/acme/payments-platform',
        targetBranch: 'main',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.message).toContain('repositoryUrl');
    expect(body).not.toHaveProperty('stack');
  });

  it('returns 400 for an empty target branch', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    const app = createServer(baseDependencies(sourceControlProvider));

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: {
        repositoryUrl: 'https://github.com/acme/payments-platform',
        targetBranch: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 502 with a sanitized body when the source-control provider fails', async () => {
    const githubFailure = new GitHubHttpError('listPullRequests', 503, 'https://api.github.com/repos/acme/payments-platform/pulls');
    const sourceControlProvider = new ThrowingSourceControlProvider(githubFailure);
    const app = createServer(baseDependencies(sourceControlProvider));

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: {
        repositoryUrl: 'https://github.com/acme/payments-platform',
        targetBranch: 'main',
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error.message).not.toContain('503');
    expect(body.error.message).not.toContain('api.github.com');
    expect(JSON.stringify(body)).not.toContain('GitHubHttpError');
  });

  it('returns 500 with a sanitized body for an unexpected internal failure', async () => {
    const sourceControlProvider = new ThrowingSourceControlProvider(new Error('unexpected bug: token=abc123'));
    const app = createServer(baseDependencies(sourceControlProvider));

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: {
        repositoryUrl: 'https://github.com/acme/payments-platform',
        targetBranch: 'main',
      },
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(JSON.stringify(body)).not.toContain('token=abc123');
    expect(JSON.stringify(body)).not.toContain('unexpected bug');
  });

  it('returns a successful report with no Candidate Pairs for an empty eligible scope', async () => {
    const sourceControlProvider = new FakeSourceControlProvider();
    sourceControlProvider.setEligiblePullRequests([]);
    const app = createServer(baseDependencies(sourceControlProvider));

    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: {
        repositoryUrl: 'https://github.com/acme/payments-platform',
        targetBranch: 'main',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.candidatePairs).toEqual([]);
    expect(body.status).toBe('COMPLETED');
  });
});

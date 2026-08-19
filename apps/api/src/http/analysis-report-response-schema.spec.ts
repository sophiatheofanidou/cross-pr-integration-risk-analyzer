import { describe, expect, it } from 'vitest';
import { POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH } from '../domain/risk-result.js';
import { analysisReportDtoSchema } from './analysis-report-response-schema.js';

function validReport() {
  const location = {
    pullRequestId: '184',
    filePath: 'src/payment.ts',
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
  };
  return {
    repositoryUrl: 'https://github.com/acme/payments-platform',
    targetBranch: 'development',
    status: 'COMPLETED',
    summary: {
      eligiblePullRequestCount: 2,
      possiblePairCount: 1,
      candidatePairCount: 1,
      assessedPairCount: 1,
      riskIdentifiedCount: 1,
      notAssessedCount: 0,
      noRiskIdentifiedCount: 0,
    },
    eligiblePullRequests: [{
      id: '184', title: 'Require currency', webUrl: 'https://github.com/acme/payments-platform/pull/184',
      sourceBranch: 'currency', targetBranch: 'development', changedFileCount: 1,
    }],
    candidatePairs: [{
      pullRequestA: { id: '184', title: 'Require currency', webUrl: 'https://github.com/acme/payments-platform/pull/184' },
      pullRequestB: { id: '191', title: 'Settlement handler', webUrl: 'https://github.com/acme/payments-platform/pull/191' },
      technicalTermMatches: [{
        technicalTerm: 'processPayment',
        changedRegionLocation: location,
        matchingOccurrenceLocation: { ...location, pullRequestId: '191' },
      }],
      assessment: {
        state: 'COMPLETED',
        result: {
          status: 'RISK_IDENTIFIED',
          potentialIntegrationProblem: 'The combined changes may pass currency inconsistently.',
          reviewerAction: 'Verify the currency flow through processPayment.',
          confidence: 'HIGH', severity: 'HIGH',
        },
      },
    }],
    warnings: [],
  };
}

describe('analysisReportDtoSchema', () => {
  it('accepts a complete valid report', () => {
    expect(analysisReportDtoSchema.safeParse(validReport()).success).toBe(true);
  });

  it.each([
    ['a non-URL repositoryUrl', (report: ReturnType<typeof validReport>) => { report.repositoryUrl = 'not a url'; }],
    ['an empty target branch', (report: ReturnType<typeof validReport>) => { report.targetBranch = ' '; }],
    ['a fractional count', (report: ReturnType<typeof validReport>) => { report.summary.candidatePairCount = 1.5; }],
    ['a negative count', (report: ReturnType<typeof validReport>) => { report.summary.notAssessedCount = -1; }],
    ['a zero source coordinate', (report: ReturnType<typeof validReport>) => { report.candidatePairs[0]!.technicalTermMatches[0]!.changedRegionLocation.range.start.line = 0; }],
    ['an oversized risk explanation', (report: ReturnType<typeof validReport>) => { report.candidatePairs[0]!.assessment.result.potentialIntegrationProblem = 'x'.repeat(POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH + 1); }],
    ['an unexpected nested property', (report: ReturnType<typeof validReport>) => { Object.assign(report.candidatePairs[0]!.assessment.result, { changedAssumption: 'legacy' }); }],
  ])('rejects %s', (_description, mutate) => {
    const report = validReport();
    mutate(report);
    expect(analysisReportDtoSchema.safeParse(report).success).toBe(false);
  });
});

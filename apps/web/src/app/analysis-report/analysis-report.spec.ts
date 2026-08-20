import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { AnalysisReport as AnalysisReportDto, CandidatePairReport } from '../analysis-report.dto';
import { AnalysisReport } from './analysis-report';

function pullRequest(id: string, title: string) {
  return { id, title, webUrl: `https://github.com/acme/payments-platform/pull/${id}` };
}

function riskPair(id: string): CandidatePairReport {
  return {
    pullRequestA: pullRequest('184', 'Require currency in processPayment'),
    pullRequestB: pullRequest(id, `Pair with ${id}`),
    technicalTermMatches: [],
    assessment: {
      state: 'COMPLETED',
      result: {
        status: 'RISK_IDENTIFIED',
        potentialIntegrationProblem: 'problem',
        reviewerAction: 'action',
        confidence: 'HIGH',
        severity: 'HIGH',
      },
    },
  };
}

function notRunPair(id: string): CandidatePairReport {
  return {
    pullRequestA: pullRequest('191', 'Add invoice settlement handler'),
    pullRequestB: pullRequest(id, `Pair with ${id}`),
    technicalTermMatches: [],
    assessment: { state: 'NOT_RUN', reason: 'INSUFFICIENT_CONTEXT', message: 'not enough context' },
  };
}

function noRiskPair(id: string): CandidatePairReport {
  return {
    pullRequestA: pullRequest('197', 'Add upload handler'),
    pullRequestB: pullRequest(id, `Pair with ${id}`),
    technicalTermMatches: [],
    assessment: {
      state: 'COMPLETED',
      result: { status: 'NO_RISK_IDENTIFIED', noRiskExplanation: 'coincidental', confidence: 'MEDIUM' },
    },
  };
}

function baseReport(overrides: Partial<AnalysisReportDto> = {}): AnalysisReportDto {
  return {
    repositoryUrl: 'https://github.com/acme/payments-platform',
    targetBranch: 'development',
    status: 'COMPLETED',
    summary: {
      eligiblePullRequestCount: 4,
      possiblePairCount: 6,
      candidatePairCount: 0,
      assessedPairCount: 0,
      riskIdentifiedCount: 0,
      notAssessedCount: 0,
      noRiskIdentifiedCount: 0,
    },
    eligiblePullRequests: [],
    candidatePairs: [],
    warnings: [],
    ...overrides,
  };
}

function render(report: AnalysisReportDto) {
  const fixture = TestBed.createComponent(AnalysisReport);
  fixture.componentRef.setInput('report', report);
  fixture.detectChanges();
  return fixture;
}

describe('AnalysisReport', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AnalysisReport] });
  });

  it('shows the summary counts in the required order', () => {
    const fixture = render(
      baseReport({
        summary: {
          eligiblePullRequestCount: 4,
          possiblePairCount: 6,
          candidatePairCount: 4,
          assessedPairCount: 3,
          riskIdentifiedCount: 2,
          notAssessedCount: 1,
          noRiskIdentifiedCount: 1,
        },
      }),
    );

    const labels = fixture.debugElement.queryAll(By.css('.metric-label')).map((el) => el.nativeElement.textContent.trim());
    expect(labels).toEqual(['Eligible PRs', 'Possible pairs', 'Candidate Pairs', 'Risks identified', 'Not assessed', 'No risk identified']);

    const numbers = fixture.debugElement.queryAll(By.css('.number')).map((el) => el.nativeElement.textContent.trim());
    expect(numbers).toEqual(['4', '6', '4', '2', '1', '1']);

    const possiblePairsNote = fixture.debugElement.queryAll(By.css('.metric'))[1].query(By.css('.note'));
    expect(possiblePairsNote.nativeElement.textContent.trim()).toBe('All unique combinations');
  });

  it('does not repeat request inputs in the results heading', () => {
    const fixture = render(baseReport());

    expect(fixture.debugElement.query(By.css('.runline strong')).nativeElement.textContent.trim()).toBe('Analysis results');
    expect(fixture.debugElement.query(By.css('.request-details'))).toBeNull();
  });

  it('shows the warning count and each warning scope and message', () => {
    const fixture = render(
      baseReport({
        status: 'COMPLETED_WITH_WARNINGS',
        warnings: [
          {
            pullRequestId: '184',
            filePath: 'src/legacy/refund.js',
            reason: 'UNSUPPORTED_FILE_EXTENSION',
            message: 'This JavaScript file was skipped.',
          },
          {
            pullRequestId: '191',
            relatedPullRequestId: '203',
            reason: 'ASSESSMENT_NOT_RUN',
            message: 'No assessment conclusion was produced.',
          },
        ],
      }),
    );

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('2 coverage warnings');
    expect(text).toContain('PR #184');
    expect(text).toContain('src/legacy/refund.js');
    expect(text).toContain('This JavaScript file was skipped.');
    expect(text).toContain('PR #191');
    expect(text).toContain('related PR #203');
    expect(text).toContain('No assessment conclusion was produced.');
    expect(text).toContain('Completed with warnings');
  });

  it('orders results as risk identified, then not run, then no risk identified, preserving backend order within each group', () => {
    const fixture = render(
      baseReport({
        candidatePairs: [noRiskPair('a'), riskPair('b'), notRunPair('c'), riskPair('d'), noRiskPair('e')],
      }),
    );

    const headings = fixture.debugElement.queryAll(By.css('app-candidate-pair-result h3')).map((el) => el.nativeElement.textContent);
    expect(headings.length).toBe(5);
    expect(headings[0]).toContain('Pair with b');
    expect(headings[1]).toContain('Pair with d');
    expect(headings[2]).toContain('Pair with c');
    expect(headings[3]).toContain('Pair with a');
    expect(headings[4]).toContain('Pair with e');
  });

  it('shows the empty-result explanation and inventory when there are no Candidate Pairs', () => {
    const fixture = render(
      baseReport({
        eligiblePullRequests: [
          {
            id: '184',
            title: 'Require currency in processPayment',
            webUrl: 'https://github.com/acme/payments-platform/pull/184',
            sourceBranch: 'feat/payment-currency',
            targetBranch: 'development',
            changedFileCount: 3,
          },
        ],
      }),
    );

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Analysis completed');
    expect(text).toContain('No Candidate Pairs found');
    expect(text).toContain('4 eligible pull requests produced 6 possible pairs');
    expect(text).toContain('Candidate Pairs (0)');
    expect(text).toContain('Eligible Pull Requests (1)');
  });
});

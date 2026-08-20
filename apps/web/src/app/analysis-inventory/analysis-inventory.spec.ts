import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CandidatePairReport, EligiblePullRequest } from '../analysis-report.dto';
import { AnalysisInventory } from './analysis-inventory';

const eligiblePullRequests: readonly EligiblePullRequest[] = [
  {
    id: '184',
    title: 'Require currency in processPayment',
    webUrl: 'https://github.com/acme/payments-platform/pull/184',
    sourceBranch: 'feat/payment-currency',
    targetBranch: 'development',
    changedFileCount: 3,
  },
];

const candidatePairs: readonly CandidatePairReport[] = [
  {
    pullRequestA: { id: '184', title: 'Require currency in processPayment', webUrl: 'https://github.com/acme/payments-platform/pull/184' },
    pullRequestB: { id: '191', title: 'Add invoice settlement handler', webUrl: 'https://github.com/acme/payments-platform/pull/191' },
    technicalTermMatches: [
      {
        technicalTerm: 'processPayment',
        changedRegionLocation: {
          pullRequestId: '184',
          filePath: 'src/payment.service.ts',
          range: { start: { line: 18, column: 1 }, end: { line: 18, column: 20 } },
        },
        matchingOccurrenceLocation: {
          pullRequestId: '191',
          filePath: 'src/settlement.ts',
          range: { start: { line: 42, column: 1 }, end: { line: 42, column: 20 } },
        },
      },
    ],
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
  },
];

function render() {
  const fixture = TestBed.createComponent(AnalysisInventory);
  fixture.componentRef.setInput('candidatePairs', candidatePairs);
  fixture.componentRef.setInput('eligiblePullRequests', eligiblePullRequests);
  fixture.componentRef.setInput('warnings', []);
  fixture.detectChanges();
  return fixture;
}

describe('AnalysisInventory', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AnalysisInventory] });
  });

  it('shows the Candidate Pairs tab by default with the correct counts', () => {
    const fixture = render();
    const tabs = fixture.debugElement.queryAll(By.css('[role="tab"]'));
    expect(tabs[0].nativeElement.textContent.trim()).toBe('Candidate Pairs (1)');
    expect(tabs[1].nativeElement.textContent.trim()).toBe('Eligible Pull Requests (1)');
    expect(tabs[0].attributes['aria-selected']).toBe('true');
    expect(tabs[1].attributes['aria-selected']).toBe('false');

    const pairsPanel = fixture.debugElement.query(By.css('[role="tabpanel"]'));
    expect(pairsPanel.nativeElement.hidden).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('processPayment');
    expect(fixture.nativeElement.textContent).toContain('Risk identified');
  });

  it('switches tabs on click and shows eligible pull requests', () => {
    const fixture = render();
    const tabs = fixture.debugElement.queryAll(By.css('[role="tab"]'));
    tabs[1].nativeElement.click();
    fixture.detectChanges();

    expect(tabs[1].attributes['aria-selected']).toBe('true');
    const panels = fixture.debugElement.queryAll(By.css('[role="tabpanel"]'));
    expect(panels[1].nativeElement.hidden).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('feat/payment-currency');
    expect(fixture.nativeElement.textContent).toContain('Require currency in processPayment');
  });

  it('shows every distinct technical term without duplicates, while the match count stays the total', () => {
    const pairWithMultipleMatches: CandidatePairReport = {
      pullRequestA: { id: '197', title: 'Add upload handler', webUrl: 'https://github.com/acme/payments-platform/pull/197' },
      pullRequestB: { id: '203', title: 'Add webhook handler', webUrl: 'https://github.com/acme/payments-platform/pull/203' },
      technicalTermMatches: [
        {
          technicalTerm: 'handler',
          changedRegionLocation: {
            pullRequestId: '197',
            filePath: 'src/upload.ts',
            range: { start: { line: 7, column: 1 }, end: { line: 7, column: 10 } },
          },
          matchingOccurrenceLocation: {
            pullRequestId: '203',
            filePath: 'src/webhook.ts',
            range: { start: { line: 11, column: 1 }, end: { line: 11, column: 10 } },
          },
        },
        {
          technicalTerm: 'PaymentEvent',
          changedRegionLocation: {
            pullRequestId: '197',
            filePath: 'src/events.ts',
            range: { start: { line: 14, column: 1 }, end: { line: 14, column: 10 } },
          },
          matchingOccurrenceLocation: {
            pullRequestId: '203',
            filePath: 'src/webhook.ts',
            range: { start: { line: 28, column: 1 }, end: { line: 28, column: 10 } },
          },
        },
        {
          technicalTerm: 'handler',
          changedRegionLocation: {
            pullRequestId: '197',
            filePath: 'src/upload.ts',
            range: { start: { line: 20, column: 1 }, end: { line: 20, column: 10 } },
          },
          matchingOccurrenceLocation: {
            pullRequestId: '203',
            filePath: 'src/webhook.ts',
            range: { start: { line: 40, column: 1 }, end: { line: 40, column: 10 } },
          },
        },
      ],
      assessment: {
        state: 'COMPLETED',
        result: { status: 'NO_RISK_IDENTIFIED', noRiskExplanation: 'unrelated', confidence: 'MEDIUM' },
      },
    };

    const fixture = TestBed.createComponent(AnalysisInventory);
    fixture.componentRef.setInput('candidatePairs', [pairWithMultipleMatches]);
    fixture.componentRef.setInput('eligiblePullRequests', []);
    fixture.componentRef.setInput('warnings', []);
    fixture.detectChanges();

    const terms = fixture.debugElement.queryAll(By.css('.evidence-terms code')).map((el) => el.nativeElement.textContent.trim());
    expect(terms).toEqual(['handler', 'PaymentEvent']);
    expect(fixture.nativeElement.textContent).toContain('3 Technical Term Matches');
  });

  it('applies a row-state class matching risk, not-run and no-risk assessments', () => {
    const riskPair: CandidatePairReport = {
      ...candidatePairs[0],
    };
    const notRunPair: CandidatePairReport = {
      pullRequestA: { id: '191', title: 'Add invoice settlement handler', webUrl: 'https://github.com/acme/payments-platform/pull/191' },
      pullRequestB: { id: '203', title: 'Add webhook handler', webUrl: 'https://github.com/acme/payments-platform/pull/203' },
      technicalTermMatches: [],
      assessment: { state: 'NOT_RUN', reason: 'INSUFFICIENT_CONTEXT', message: 'not enough context' },
    };
    const safePair: CandidatePairReport = {
      pullRequestA: { id: '197', title: 'Add upload handler', webUrl: 'https://github.com/acme/payments-platform/pull/197' },
      pullRequestB: { id: '203', title: 'Add webhook handler', webUrl: 'https://github.com/acme/payments-platform/pull/203' },
      technicalTermMatches: [],
      assessment: {
        state: 'COMPLETED',
        result: { status: 'NO_RISK_IDENTIFIED', noRiskExplanation: 'unrelated', confidence: 'MEDIUM' },
      },
    };

    const fixture = TestBed.createComponent(AnalysisInventory);
    fixture.componentRef.setInput('candidatePairs', [riskPair, notRunPair, safePair]);
    fixture.componentRef.setInput('eligiblePullRequests', []);
    fixture.componentRef.setInput('warnings', []);
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('.overview tbody tr'));
    expect(rows[0].nativeElement.classList).toContain('row-risk');
    expect(rows[1].nativeElement.classList).toContain('row-pending');
    expect(rows[2].nativeElement.classList).toContain('row-safe');
  });

  it('supports Left/Right and Home/End keyboard navigation with roving tabindex', () => {
    const fixture = render();
    const tabs = fixture.debugElement.queryAll(By.css('[role="tab"]'));

    expect(tabs[0].attributes['tabindex']).toBe('0');
    expect(tabs[1].attributes['tabindex']).toBe('-1');

    tabs[0].triggerEventHandler('keydown', { key: 'ArrowRight', preventDefault: () => undefined });
    fixture.detectChanges();
    expect(tabs[1].attributes['aria-selected']).toBe('true');
    expect(tabs[1].attributes['tabindex']).toBe('0');
    expect(tabs[0].attributes['tabindex']).toBe('-1');

    tabs[1].triggerEventHandler('keydown', { key: 'Home', preventDefault: () => undefined });
    fixture.detectChanges();
    expect(tabs[0].attributes['aria-selected']).toBe('true');

    tabs[0].triggerEventHandler('keydown', { key: 'End', preventDefault: () => undefined });
    fixture.detectChanges();
    expect(tabs[1].attributes['aria-selected']).toBe('true');
  });
});

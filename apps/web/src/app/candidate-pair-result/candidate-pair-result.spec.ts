import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CandidatePairReport, CompactPullRequest, TechnicalTermMatch } from '../analysis-report.dto';
import { CandidatePairResult } from './candidate-pair-result';

const pullRequestA: CompactPullRequest = {
  id: '184',
  title: 'Require currency in processPayment',
  webUrl: 'https://github.com/acme/payments-platform/pull/184',
};

const pullRequestB: CompactPullRequest = {
  id: '191',
  title: 'Add invoice settlement handler',
  webUrl: 'https://github.com/acme/payments-platform/pull/191',
};

const technicalTermMatches: readonly TechnicalTermMatch[] = [
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
];

function createPair(overrides: Partial<CandidatePairReport> = {}): CandidatePairReport {
  return {
    pullRequestA,
    pullRequestB,
    technicalTermMatches,
    assessment: {
      state: 'COMPLETED',
      result: {
        status: 'RISK_IDENTIFIED',
        potentialIntegrationProblem: 'PR #184 changes processPayment so that currency is required.',
        reviewerAction: 'Check src/settlement.ts and ensure invoice.currency is passed to processPayment.',
        confidence: 'HIGH',
        severity: 'HIGH',
      },
    },
    ...overrides,
  };
}

function renderPair(pair: CandidatePairReport) {
  const fixture = TestBed.createComponent(CandidatePairResult);
  fixture.componentRef.setInput('pair', pair);
  fixture.detectChanges();
  return fixture;
}

describe('CandidatePairResult', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CandidatePairResult] });
  });

  it('shows the risk explanation, reviewer action, severity, confidence and evidence', () => {
    const fixture = renderPair(createPair());
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Risk identified');
    expect(text).toContain('PR #184 changes processPayment so that currency is required.');
    expect(text).toContain('Check src/settlement.ts');
    expect(text).toContain('High');
    expect(text).toContain('processPayment');
    expect(text).toContain('src/payment.service.ts:18');
    expect(text).toContain('src/settlement.ts:42');

    const links = fixture.debugElement.queryAll(By.css('a.pr-link'));
    expect(links.length).toBe(2);
    expect(links[0].nativeElement.getAttribute('target')).toBe('_blank');
    expect(links[0].nativeElement.getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].nativeElement.getAttribute('href')).toBe(pullRequestA.webUrl);
  });

  it('does not render an expansion control when the explanation is 500 characters or fewer', () => {
    const fixture = renderPair(createPair());
    const button = fixture.debugElement.query(By.css('.link-button'));
    expect(button).toBeNull();
  });

  it('collapses a long explanation and expands it accessibly on toggle', () => {
    const longExplanation = 'x'.repeat(501);
    const fixture = renderPair(
      createPair({
        assessment: {
          state: 'COMPLETED',
          result: {
            status: 'RISK_IDENTIFIED',
            potentialIntegrationProblem: longExplanation,
            reviewerAction: 'Check the affected file.',
            confidence: 'MEDIUM',
            severity: 'MEDIUM',
          },
        },
      }),
    );

    const paragraph = fixture.debugElement.query(By.css('.copy'));
    expect(paragraph.classes['clamped']).toBe(true);

    const button = fixture.debugElement.query(By.css('.link-button'));
    expect(button.nativeElement.textContent.trim()).toBe('Show full analysis');
    expect(button.attributes['aria-expanded']).toBe('false');
    const controlsId = button.attributes['aria-controls'];
    expect(controlsId).toBeTruthy();
    expect(paragraph.nativeElement.id).toBe(controlsId);

    button.nativeElement.click();
    fixture.detectChanges();

    expect(button.nativeElement.textContent.trim()).toBe('Show less');
    expect(button.attributes['aria-expanded']).toBe('true');
    expect(paragraph.classes['clamped']).toBeFalsy();
  });

  it('renders an assessment-not-run card with deterministic evidence and distinct reason wording', () => {
    const insufficientContext = renderPair(
      createPair({
        assessment: {
          state: 'NOT_RUN',
          reason: 'INSUFFICIENT_CONTEXT',
          message: 'A Technical Term Match was found, but the matching source context could not be retained.',
        },
      }),
    );
    const insufficientText = insufficientContext.nativeElement.textContent as string;
    expect(insufficientText).toContain('Assessment not run');
    expect(insufficientText).toContain('Insufficient context for an assessment');
    expect(insufficientText).toContain('matching source context could not be retained');
    expect(insufficientText).toContain('processPayment');
    expect(insufficientText).not.toContain('No risk identified');
    expect(insufficientText).not.toContain('Severity');
    const evidenceHeadings = insufficientContext.debugElement.queryAll(By.css('.evidence-label'));
    expect(evidenceHeadings.length).toBe(1);
    expect(evidenceHeadings[0].nativeElement.textContent.trim()).toBe('Deterministic evidence remains visible');

    const providerFailure = renderPair(
      createPair({
        assessment: {
          state: 'NOT_RUN',
          reason: 'PROVIDER_FAILURE',
          message: 'The assessment provider request failed.',
        },
      }),
    );
    const providerFailureText = providerFailure.nativeElement.textContent as string;
    expect(providerFailureText).toContain('The assessment provider could not complete');
  });

  it('renders a no-risk row collapsed by default and expands details accessibly', () => {
    const fixture = renderPair(
      createPair({
        assessment: {
          state: 'COMPLETED',
          result: {
            status: 'NO_RISK_IDENTIFIED',
            noRiskExplanation: 'The shared term handler refers to unrelated local functions.',
            confidence: 'MEDIUM',
          },
        },
      }),
    );

    expect((fixture.nativeElement.textContent as string)).toContain('No risk identified');
    const details = fixture.debugElement.query(By.css('.safe-details'));
    expect(details.attributes['hidden']).toBe('');
    expect(details.nativeElement.hidden).toBe(true);
    expect(getComputedStyle(details.nativeElement).display).toBe('none');

    const toggle = fixture.debugElement.query(By.css('.safe-toggle'));
    expect(toggle.nativeElement.textContent.trim()).toBe('View details');
    expect(toggle.attributes['aria-expanded']).toBe('false');
    expect(toggle.attributes['aria-controls']).toBe(details.nativeElement.id);

    toggle.nativeElement.click();
    fixture.detectChanges();

    expect(toggle.nativeElement.textContent.trim()).toBe('Hide details');
    expect(toggle.attributes['aria-expanded']).toBe('true');
    expect(details.attributes['hidden']).toBeFalsy();
    expect(getComputedStyle(details.nativeElement).display).not.toBe('none');
    expect((fixture.nativeElement.textContent as string)).toContain('unrelated local functions');
  });
});

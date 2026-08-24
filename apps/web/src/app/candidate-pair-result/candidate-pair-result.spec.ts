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
      pullRequestId: '184', filePath: 'src/payment.service.ts',
      range: { start: { line: 18, column: 1 }, end: { line: 18, column: 20 } },
    },
    matchingOccurrenceLocation: {
      pullRequestId: '191', filePath: 'src/settlement.ts',
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
        likelyOutcome: 'Invoice settlement may fail.',
        pullRequestAContribution: 'PR #184 requires every payment to include a currency.',
        pullRequestBContribution: 'PR #191 adds settlement using only an amount.',
        combinedEffect: 'The settlement caller may not satisfy the updated payment contract.',
        relevantCode: {
          pullRequestA: [{ pullRequestId: '184', technicalTerm: 'processPayment', filePath: 'src/payment.service.ts', startLine: 18 }],
          pullRequestB: [{ pullRequestId: '191', technicalTerm: 'processPayment', filePath: 'src/settlement.ts', startLine: 42 }],
        },
        reviewerAction: 'Check src/settlement.ts and pass the invoice currency.',
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

  it('shows the structured risk explanation, reviewer action and validated relevant locations', () => {
    const fixture = renderPair(createPair());
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Likely outcome');
    expect(text).toContain('Invoice settlement may fail.');
    expect(text).toContain('How the PRs interact');
    expect(text).toContain('PR #184 requires every payment to include a currency.');
    expect(text).toContain('PR #191 adds settlement using only an amount.');
    expect(text).toContain('If both PRs are merged');
    expect(text).toContain('The settlement caller may not satisfy the updated payment contract.');
    const marker = fixture.debugElement.query(By.css('.risk-term-marker')).nativeElement as HTMLButtonElement;
    const tooltip = fixture.debugElement.query(By.css('[role="tooltip"]')).nativeElement as HTMLElement;
    expect(marker.querySelector('svg')).not.toBeNull();
    expect(marker.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(tooltip.textContent?.trim()).toBe('Linked to the reported risk locations');
    expect(text).toContain('src/payment.service.ts');
    expect(text).toContain('Line 18');
    expect(text).toContain('src/settlement.ts');
    expect(text).toContain('Line 42');
    expect(text).toContain('Check src/settlement.ts');

    const links = fixture.debugElement.queryAll(By.css('a.pr-link'));
    expect(links.length).toBe(2);
    expect(links[0].nativeElement.getAttribute('target')).toBe('_blank');
    expect(links[0].nativeElement.getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].nativeElement.getAttribute('href')).toBe(pullRequestA.webUrl);
  });

  it('groups all technical occurrences by term and pull request behind one collapsed control', () => {
    const repeatedTermMatches: readonly TechnicalTermMatch[] = [
      technicalTermMatches[0]!,
      {
        ...technicalTermMatches[0]!,
        changedRegionLocation: {
          pullRequestId: '184', filePath: 'src/payment.types.ts',
          range: { start: { line: 9, column: 1 }, end: { line: 9, column: 20 } },
        },
        matchingOccurrenceLocation: {
          pullRequestId: '191', filePath: 'src/settlement.ts',
          range: { start: { line: 57, column: 1 }, end: { line: 57, column: 20 } },
        },
      },
    ];
    const fixture = renderPair(createPair({ technicalTermMatches: repeatedTermMatches }));

    expect(fixture.debugElement.queryAll(By.css('.shared-term-list code'))).toHaveLength(1);
    const details = fixture.debugElement.query(By.css('.technical-details'));
    expect(details.nativeElement.open).toBe(false);
    const detailsText = details.nativeElement.textContent as string;
    expect(detailsText).toContain('Occurrences in PR #184');
    expect(detailsText).toContain('src/payment.service.ts');
    expect(detailsText).toContain('src/payment.types.ts');
    expect(detailsText).toContain('Occurrences in PR #191');
    expect(detailsText).toContain('Lines 42, 57');
    expect(detailsText).not.toContain('supporting relationships');
    expect(detailsText).not.toContain('Changed locations');
    expect(detailsText).not.toContain('Matching locations');
  });

  it('marks only the exact shared term linked to the reported risk when locations overlap', () => {
    const sameLocationsForAnotherTerm: TechnicalTermMatch = {
      ...technicalTermMatches[0]!,
      technicalTerm: 'theme',
    };
    const fixture = renderPair(createPair({
      technicalTermMatches: [...technicalTermMatches, sameLocationsForAnotherTerm],
    }));

    const sharedTerms = fixture.debugElement.queryAll(By.css('.shared-term-list .term-item'));
    const markedTerms = sharedTerms.filter(
      (term) => term.query(By.css('.risk-term-marker')) !== null,
    );

    expect(sharedTerms).toHaveLength(2);
    expect(markedTerms).toHaveLength(1);
    expect(markedTerms[0]!.nativeElement.textContent).toContain('processPayment');
    expect(markedTerms[0]!.nativeElement.textContent).not.toContain('theme');
  });

  it('renders an assessment-not-run card with shared terms but no inferred relevant locations', () => {
    const fixture = renderPair(createPair({
      assessment: {
        state: 'NOT_RUN',
        reason: 'INSUFFICIENT_CONTEXT',
        message: 'Matching source context could not be retained.',
      },
    }));
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Assessment not run');
    expect(text).toContain('Insufficient context for an assessment');
    expect(text).toContain('processPayment');
    expect(text).not.toContain('Locations supporting this risk');
    expect(fixture.debugElement.query(By.css('.evidence-label')).nativeElement.textContent.trim())
      .toBe('Shared technical terms');
  });

  it('renders a no-risk row collapsed by default and expands details accessibly', () => {
    const fixture = renderPair(createPair({
      assessment: {
        state: 'COMPLETED',
        result: {
          status: 'NO_RISK_IDENTIFIED',
          relationshipSummary: 'The same helper name appears in both pull requests.',
          independenceReason: 'The supplied functions are local to separate modules.',
          coverageLimitation: 'One unsupported file was outside the bounded analysis.',
          confidence: 'MEDIUM',
        },
      },
    }));

    const details = fixture.debugElement.query(By.css('.safe-details'));
    expect(details.nativeElement.hidden).toBe(true);
    const toggle = fixture.debugElement.query(By.css('.safe-toggle'));
    expect(toggle.nativeElement.textContent.trim()).toBe('View details');
    expect(toggle.attributes['aria-expanded']).toBe('false');

    toggle.nativeElement.click();
    fixture.detectChanges();

    expect(toggle.nativeElement.textContent.trim()).toBe('Hide details');
    expect(toggle.attributes['aria-expanded']).toBe('true');
    expect(details.nativeElement.hidden).toBe(false);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Why these PRs were compared');
    expect(text).toContain('The same helper name appears in both pull requests.');
    expect(text).toContain('Why the changes appear independent');
    expect(text).toContain('The supplied functions are local to separate modules.');
    expect(text).toContain('Coverage limitation');
  });
});

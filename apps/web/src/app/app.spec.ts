import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { App } from './app';
import { AnalysisApiService } from './analysis-api.service';
import type { AnalysisReport, AnalysisRequest } from './analysis-report.dto';

class FakeAnalysisApiService {
  readonly calls: AnalysisRequest[] = [];
  private subject = new Subject<AnalysisReport>();

  analyze(request: AnalysisRequest) {
    this.calls.push(request);
    this.subject = new Subject<AnalysisReport>();
    return this.subject.asObservable();
  }

  emitSuccess(report: AnalysisReport): void {
    this.subject.next(report);
    this.subject.complete();
  }

  emitError(error: unknown): void {
    this.subject.error(error);
  }
}

function completedReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    repositoryUrl: 'https://github.com/acme/payments-platform',
    targetBranch: 'development',
    status: 'COMPLETED',
    summary: {
      eligiblePullRequestCount: 1,
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
    ...overrides,
  };
}

function submitViaForm(fixture: ReturnType<typeof TestBed.createComponent<App>>) {
  const repositoryInput: HTMLInputElement = fixture.debugElement.query(By.css('input[formControlName="repositoryUrl"]')).nativeElement;
  const branchInput: HTMLInputElement = fixture.debugElement.query(By.css('input[formControlName="targetBranch"]')).nativeElement;
  repositoryInput.value = 'https://github.com/acme/payments-platform';
  repositoryInput.dispatchEvent(new Event('input'));
  branchInput.value = 'development';
  branchInput.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  fixture.debugElement.query(By.css('form')).triggerEventHandler('submit', new Event('submit'));
  fixture.detectChanges();
}

describe('App', () => {
  let fakeApi: FakeAnalysisApiService;

  beforeEach(async () => {
    fakeApi = new FakeAnalysisApiService();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: AnalysisApiService, useValue: fakeApi }],
    }).compileComponents();
  });

  it('shows a loading state while the request is in flight', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    submitViaForm(fixture);

    expect(fakeApi.calls).toEqual([{ repositoryUrl: 'https://github.com/acme/payments-platform', targetBranch: 'development' }]);
    const status = fixture.debugElement.query(By.css('[role="status"]'));
    expect(status).not.toBeNull();
    expect(status.nativeElement.textContent).toContain('Integration risk analysis in progress');
    expect(status.nativeElement.textContent).toContain('Analyzing approved pull requests');
    expect(status.nativeElement.textContent).toContain('assessing how their changes may interact');
    expect(status.nativeElement.textContent).not.toContain('Candidate Discovery in progress');

    const progress = fixture.debugElement.query(By.css('[role="progressbar"]'));
    expect(progress).not.toBeNull();
    expect(progress.attributes['aria-label']).toBe('Analysis progress');
    expect(progress.attributes['aria-valuenow']).toBeUndefined();
  });

  it('prevents duplicate submissions while a request is loading', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    submitViaForm(fixture);
    submitViaForm(fixture);

    expect(fakeApi.calls.length).toBe(1);
  });

  it('renders the completed report once the request resolves', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    submitViaForm(fixture);
    fakeApi.emitSuccess(completedReport());
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Analysis completed');
    expect(fixture.debugElement.query(By.css('[role="status"]'))).toBeNull();
  });

  it('clears a stale report when a new submission is invalid', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    submitViaForm(fixture);
    fakeApi.emitSuccess(completedReport());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Analysis completed');

    const repositoryInput: HTMLInputElement = fixture.debugElement.query(
      By.css('input[formControlName="repositoryUrl"]'),
    ).nativeElement;
    repositoryInput.value = 'github.com/acme';
    repositoryInput.dispatchEvent(new Event('input'));
    fixture.debugElement.query(By.css('form')).triggerEventHandler('submit', new Event('submit'));
    fixture.detectChanges();

    expect(fakeApi.calls.length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Analysis completed');
    expect(fixture.nativeElement.textContent).toContain('Enter one complete HTTPS GitHub repository URL');
  });

  it('shows a sanitized error message with Try again and retries with the same request, clearing stale results', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    submitViaForm(fixture);
    const httpError = new HttpErrorResponse({ status: 502, error: { error: { message: 'Failed to retrieve pull request data.' } } });
    fakeApi.emitError(httpError);
    fixture.detectChanges();

    const alert = fixture.debugElement.query(By.css('[role="alert"]'));
    expect(alert.nativeElement.textContent).toContain('Failed to retrieve pull request data.');
    expect(fixture.nativeElement.textContent).not.toContain('Analysis completed');

    const retryButton = fixture.debugElement.query(By.css('.retry'));
    retryButton.nativeElement.click();
    fixture.detectChanges();

    expect(fakeApi.calls.length).toBe(2);
    expect(fakeApi.calls[1]).toEqual({ repositoryUrl: 'https://github.com/acme/payments-platform', targetBranch: 'development' });

    fakeApi.emitSuccess(completedReport());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Analysis completed');
  });

  it('falls back to a generic message for an unknown client failure', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    submitViaForm(fixture);
    fakeApi.emitError(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }));
    fixture.detectChanges();

    const alert = fixture.debugElement.query(By.css('[role="alert"]'));
    expect(alert.nativeElement.textContent).toContain('Something went wrong while analyzing the repository.');
  });

  it('never uses the term "AI" in visible copy', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    submitViaForm(fixture);
    fakeApi.emitSuccess(
      completedReport({
        status: 'COMPLETED_WITH_WARNINGS',
        candidatePairs: [
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
                likelyOutcome: 'Payment processing may fail.',
                pullRequestAContribution: 'PR #184 changes processPayment.',
                pullRequestBContribution: 'PR #191 uses the previous contract.',
                combinedEffect: 'The combined call may be incompatible.',
                relevantCode: {
                  pullRequestA: [{ pullRequestId: '184', technicalTerm: 'processPayment', filePath: 'src/payment.service.ts', startLine: 18 }],
                  pullRequestB: [{ pullRequestId: '191', technicalTerm: 'processPayment', filePath: 'src/settlement.ts', startLine: 42 }],
                },
                reviewerAction: 'Check src/settlement.ts.',
                confidence: 'HIGH',
                severity: 'HIGH',
              },
            },
          },
        ],
        warnings: [{ pullRequestId: '184', filePath: 'src/legacy/refund.js', reason: 'UNSUPPORTED_FILE_EXTENSION', message: 'Skipped file.' }],
      }),
    );
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(/\bAI\b/.test(text)).toBe(false);
  });
});

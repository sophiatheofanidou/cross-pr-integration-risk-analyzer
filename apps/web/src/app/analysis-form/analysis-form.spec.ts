import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { AnalysisRequest } from '../analysis-report.dto';
import { AnalysisForm } from './analysis-form';

function fillAndSubmit(fixture: ReturnType<typeof TestBed.createComponent<AnalysisForm>>, repositoryUrl: string, targetBranch: string) {
  const repositoryInput: HTMLInputElement = fixture.debugElement.query(By.css('input[formControlName="repositoryUrl"]')).nativeElement;
  const branchInput: HTMLInputElement = fixture.debugElement.query(By.css('input[formControlName="targetBranch"]')).nativeElement;
  repositoryInput.value = repositoryUrl;
  repositoryInput.dispatchEvent(new Event('input'));
  branchInput.value = targetBranch;
  branchInput.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  fixture.debugElement.query(By.css('form')).triggerEventHandler('submit', new Event('submit'));
  fixture.detectChanges();
}

describe('AnalysisForm', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AnalysisForm] });
  });

  it('emits the exact request DTO on a valid submission', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.detectChanges();

    let emitted: AnalysisRequest | undefined;
    fixture.componentInstance.submitRequest.subscribe((value) => (emitted = value));

    fillAndSubmit(fixture, 'https://github.com/acme/payments-platform', 'development');

    expect(emitted).toEqual({
      repositoryUrl: 'https://github.com/acme/payments-platform',
      targetBranch: 'development',
    });
  });

  it('does not emit when the target branch is empty', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.detectChanges();

    let emitted: AnalysisRequest | undefined;
    fixture.componentInstance.submitRequest.subscribe((value) => (emitted = value));

    fillAndSubmit(fixture, 'https://github.com/acme/payments-platform', '');

    expect(emitted).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Enter a target branch.');
  });

  it('reports an invalid submission so the page can clear stale results', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.detectChanges();

    let invalidSubmissions = 0;
    fixture.componentInstance.invalidSubmit.subscribe(() => invalidSubmissions++);

    fillAndSubmit(fixture, 'github.com/acme', 'development');

    expect(invalidSubmissions).toBe(1);
  });

  it('disables the submit button and prevents duplicate submission while loading', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.debugElement.query(By.css('.run-button')).nativeElement;
    expect(button.disabled).toBe(true);

    let emitted: AnalysisRequest | undefined;
    fixture.componentInstance.submitRequest.subscribe((value) => (emitted = value));

    fillAndSubmit(fixture, 'https://github.com/acme/payments-platform', 'development');

    expect(emitted).toBeUndefined();
  });

  it('accepts a mixed-case GitHub hostname, matching the backend contract', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.detectChanges();

    let emitted: AnalysisRequest | undefined;
    fixture.componentInstance.submitRequest.subscribe((value) => (emitted = value));

    fillAndSubmit(fixture, 'https://GitHub.com/acme/payments-platform', 'development');

    expect(emitted).toEqual({
      repositoryUrl: 'https://GitHub.com/acme/payments-platform',
      targetBranch: 'development',
    });
  });

  it('rejects a non-GitHub host such as GitLab', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.detectChanges();

    let emitted: AnalysisRequest | undefined;
    fixture.componentInstance.submitRequest.subscribe((value) => (emitted = value));

    fillAndSubmit(fixture, 'https://gitlab.com/acme/payments-platform', 'development');

    expect(emitted).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Enter one complete HTTPS GitHub repository URL');
  });

  it('rejects a URL with an extra path segment', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.detectChanges();

    let emitted: AnalysisRequest | undefined;
    fixture.componentInstance.submitRequest.subscribe((value) => (emitted = value));

    fillAndSubmit(fixture, 'https://github.com/acme/payments-platform/tree/main', 'development');

    expect(emitted).toBeUndefined();
  });

  it('rejects a URL with a query string or fragment', () => {
    const fixture = TestBed.createComponent(AnalysisForm);
    fixture.detectChanges();

    let emitted: AnalysisRequest | undefined;
    fixture.componentInstance.submitRequest.subscribe((value) => (emitted = value));

    fillAndSubmit(fixture, 'https://github.com/acme/payments-platform?tab=readme', 'development');
    expect(emitted).toBeUndefined();

    fillAndSubmit(fixture, 'https://github.com/acme/payments-platform#readme', 'development');
    expect(emitted).toBeUndefined();
  });
});

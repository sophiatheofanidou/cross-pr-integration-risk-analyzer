import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AnalysisApiService } from './analysis-api.service';
import { AnalysisForm } from './analysis-form/analysis-form';
import type { AnalysisErrorResponse, AnalysisReport as AnalysisReportDto, AnalysisRequest } from './analysis-report.dto';
import { AnalysisReport } from './analysis-report/analysis-report';

type OperationState = 'idle' | 'loading' | 'success' | 'error';

const GENERIC_ERROR_MESSAGE =
  'Something went wrong while analyzing the repository. Check your connection and try again.';

function extractErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as AnalysisErrorResponse | undefined;
    if (body && typeof body === 'object' && typeof body.error?.message === 'string' && body.error.message.trim().length > 0) {
      return body.error.message;
    }
  }
  return GENERIC_ERROR_MESSAGE;
}

@Component({
  selector: 'app-root',
  imports: [AnalysisForm, AnalysisReport],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(AnalysisApiService);

  protected readonly state = signal<OperationState>('idle');
  protected readonly report = signal<AnalysisReportDto | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  private lastRequest: AnalysisRequest | null = null;

  protected onSubmit(request: AnalysisRequest): void {
    if (this.state() === 'loading') {
      return;
    }
    this.lastRequest = request;
    this.runAnalysis(request);
  }

  protected onInvalidSubmit(): void {
    if (this.state() === 'loading') {
      return;
    }
    this.lastRequest = null;
    this.report.set(null);
    this.errorMessage.set(null);
    this.state.set('idle');
  }

  protected retry(): void {
    if (this.lastRequest === null || this.state() === 'loading') {
      return;
    }
    this.runAnalysis(this.lastRequest);
  }

  private runAnalysis(request: AnalysisRequest): void {
    this.state.set('loading');
    this.errorMessage.set(null);
    this.report.set(null);

    this.api.analyze(request).subscribe({
      next: (report) => {
        this.report.set(report);
        this.state.set('success');
      },
      error: (error: unknown) => {
        this.report.set(null);
        this.errorMessage.set(extractErrorMessage(error));
        this.state.set('error');
      },
    });
  }
}

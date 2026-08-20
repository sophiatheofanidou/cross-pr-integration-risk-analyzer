import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { AnalysisReport, AnalysisRequest } from './analysis-report.dto';

const ANALYSIS_ENDPOINT = '/api/analysis';

@Injectable({ providedIn: 'root' })
export class AnalysisApiService {
  private readonly http = inject(HttpClient);

  analyze(request: AnalysisRequest): Observable<AnalysisReport> {
    return this.http.post<AnalysisReport>(ANALYSIS_ENDPOINT, request);
  }
}

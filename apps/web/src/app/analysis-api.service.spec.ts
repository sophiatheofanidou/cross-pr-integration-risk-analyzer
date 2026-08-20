import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AnalysisApiService } from './analysis-api.service';
import type { AnalysisReport, AnalysisRequest } from './analysis-report.dto';

describe('AnalysisApiService', () => {
  let service: AnalysisApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalysisApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts the request DTO to the relative /api/analysis endpoint and returns the typed report', () => {
    const request: AnalysisRequest = {
      repositoryUrl: 'https://github.com/acme/payments-platform',
      targetBranch: 'development',
    };
    const report: AnalysisReport = {
      repositoryUrl: request.repositoryUrl,
      targetBranch: request.targetBranch,
      status: 'COMPLETED',
      summary: {
        eligiblePullRequestCount: 0,
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
    };

    let received: AnalysisReport | undefined;
    service.analyze(request).subscribe((value) => {
      received = value;
    });

    const httpRequest = httpMock.expectOne('/api/analysis');
    expect(httpRequest.request.method).toBe('POST');
    expect(httpRequest.request.body).toEqual(request);

    httpRequest.flush(report);

    expect(received).toEqual(report);
  });
});

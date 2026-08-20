/**
 * Frontend DTO module matching the M5A backend contract exactly.
 *
 * Mirrors apps/api/src/application/analysis-report-dto.ts and the domain
 * types it reuses (RiskResult, TechnicalTermMatch, AnalysisWarning,
 * SourceLocation). Kept local to apps/web rather than shared with the
 * backend package (no shared-contract package, no runtime response
 * validation in the browser).
 */

export interface AnalysisRequest {
  readonly repositoryUrl: string;
  readonly targetBranch: string;
}

export type RiskConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskResult =
  | {
      readonly status: 'RISK_IDENTIFIED';
      readonly potentialIntegrationProblem: string;
      readonly reviewerAction: string;
      readonly confidence: RiskConfidence;
      readonly severity: RiskSeverity;
    }
  | {
      readonly status: 'NO_RISK_IDENTIFIED';
      readonly noRiskExplanation: string;
      readonly confidence: RiskConfidence;
    };

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface SourceLocation {
  readonly pullRequestId: string;
  readonly filePath: string;
  readonly range: SourceRange;
}

export interface TechnicalTermMatch {
  readonly technicalTerm: string;
  readonly changedRegionLocation: SourceLocation;
  readonly matchingOccurrenceLocation: SourceLocation;
}

export type AnalysisWarningReason =
  | 'UNSUPPORTED_FILE_EXTENSION'
  | 'DELETED_FILE'
  | 'RENAMED_FILE'
  | 'FILE_UNAVAILABLE'
  | 'FILE_OVERSIZED'
  | 'UNSUPPORTED_CONTENT'
  | 'UNRECONSTRUCTABLE_CHANGED_RANGES'
  | 'MALFORMED_SOURCE'
  | 'CONTEXT_OMITTED'
  | 'ASSESSMENT_NOT_RUN';

export interface AnalysisWarning {
  readonly pullRequestId: string;
  readonly relatedPullRequestId?: string;
  readonly filePath?: string;
  readonly reason: AnalysisWarningReason;
  readonly message: string;
}

export interface CompactPullRequest {
  readonly id: string;
  readonly title: string;
  readonly webUrl: string;
}

export interface EligiblePullRequest {
  readonly id: string;
  readonly title: string;
  readonly webUrl: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly changedFileCount: number;
}

export type PairAssessment =
  | {
      readonly state: 'COMPLETED';
      readonly result: RiskResult;
    }
  | {
      readonly state: 'NOT_RUN';
      readonly reason: 'INSUFFICIENT_CONTEXT' | 'PROVIDER_FAILURE';
      readonly message: string;
    };

export interface CandidatePairReport {
  readonly pullRequestA: CompactPullRequest;
  readonly pullRequestB: CompactPullRequest;
  readonly technicalTermMatches: readonly TechnicalTermMatch[];
  readonly assessment: PairAssessment;
}

export interface AnalysisReportSummary {
  readonly eligiblePullRequestCount: number;
  readonly possiblePairCount: number;
  readonly candidatePairCount: number;
  readonly assessedPairCount: number;
  readonly riskIdentifiedCount: number;
  readonly notAssessedCount: number;
  readonly noRiskIdentifiedCount: number;
}

export interface AnalysisReport {
  readonly repositoryUrl: string;
  readonly targetBranch: string;
  readonly status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS';
  readonly summary: AnalysisReportSummary;
  readonly eligiblePullRequests: readonly EligiblePullRequest[];
  readonly candidatePairs: readonly CandidatePairReport[];
  readonly warnings: readonly AnalysisWarning[];
}

/** Sanitized error body returned by the backend (never a raw exception message). */
export interface AnalysisErrorResponse {
  readonly error: {
    readonly message: string;
  };
}

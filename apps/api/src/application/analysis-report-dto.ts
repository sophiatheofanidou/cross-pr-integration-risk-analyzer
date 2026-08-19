/**
 * Application-level analysis report DTO: the HTTP-facing shape returned by
 * the M5 synchronous analysis operation.
 *
 * Distinct from the provider-neutral domain contracts: this module defines
 * what the reviewer-facing report exposes, which is a compact projection of
 * eligible pull requests and Candidate Pairs, never internal revisions,
 * patches or source content (see docs/design/07-mvp-specification.md, API
 * and UI Scope). Where a domain type is already appropriately shaped and
 * safe to expose (`RiskResult`, `TechnicalTermMatch`, `AnalysisWarning`), it
 * is reused directly rather than duplicated.
 */

import type { AnalysisWarning } from '../domain/analysis-warning.js';
import type { RiskResult } from '../domain/risk-result.js';
import type { TechnicalTermMatch } from '../domain/technical-term-match.js';

/** Compact, reviewer-facing pull-request display metadata. */
export interface CompactPullRequestDto {
  readonly id: string;
  readonly title: string;
  readonly webUrl: string;
}

export interface EligiblePullRequestDto {
  readonly id: string;
  readonly title: string;
  readonly webUrl: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly changedFileCount: number;
}

export type PairAssessmentDto =
  | {
      readonly state: 'COMPLETED';
      readonly result: RiskResult;
    }
  | {
      readonly state: 'NOT_RUN';
      readonly reason: 'INSUFFICIENT_CONTEXT' | 'PROVIDER_FAILURE';
      readonly message: string;
    };

export interface CandidatePairReportDto {
  readonly pullRequestA: CompactPullRequestDto;
  readonly pullRequestB: CompactPullRequestDto;
  readonly technicalTermMatches: readonly TechnicalTermMatch[];
  readonly assessment: PairAssessmentDto;
}

/** A reviewer-facing warning; sanitized by construction (never a raw exception message). */
export type AnalysisWarningDto = AnalysisWarning;

export interface AnalysisReportSummaryDto {
  readonly eligiblePullRequestCount: number;
  readonly possiblePairCount: number;
  readonly candidatePairCount: number;
  readonly assessedPairCount: number;
  readonly riskIdentifiedCount: number;
  readonly notAssessedCount: number;
  readonly noRiskIdentifiedCount: number;
}

export interface AnalysisReportDto {
  readonly repositoryUrl: string;
  readonly targetBranch: string;
  readonly status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS';
  readonly summary: AnalysisReportSummaryDto;
  readonly eligiblePullRequests: readonly EligiblePullRequestDto[];
  readonly candidatePairs: readonly CandidatePairReportDto[];
  readonly warnings: readonly AnalysisWarningDto[];
}

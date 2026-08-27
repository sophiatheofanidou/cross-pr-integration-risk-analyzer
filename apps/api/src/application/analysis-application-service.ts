/**
 * M5 application orchestration: composes eligible pull-request retrieval,
 * Candidate Discovery, one assessment attempt per Candidate Pair with
 * sufficient context, and mapping to the public `AnalysisReportDto`.
 *
 * Provider-neutral: depends only on `SourceControlProvider`,
 * `StructuralAnalyzer` and `RiskAnalysisProvider`. It never imports a
 * concrete adapter, so it can be exercised with fakes and composed with any
 * concrete provider by the backend entry point.
 *
 * A failure retrieving eligible pull requests or discovering candidates (no
 * valid eligible/candidate scope yet) propagates to the caller unmodified;
 * mapping that into an HTTP status is the caller's (HTTP layer's)
 * responsibility (docs/design/07-mvp-specification.md; M5 orchestration
 * scope). A per-pair provider failure, in contrast, is caught here so it
 * never discards already-completed assessments or prevents remaining
 * Candidate Pairs from being attempted.
 */

import type { CandidateDiscoveryRun } from '../candidate-discovery/candidate-discovery.js';
import { discoverCandidates } from '../candidate-discovery/candidate-discovery.js';
import type { ContextRetrievalBounds } from '../context-retrieval/context-retrieval.js';
import type { AnalysisWarning } from '../domain/analysis-warning.js';
import type { CandidatePair } from '../domain/candidate-pair.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import {
  assessCandidatePair,
  RiskAnalysisProviderInvocationError,
} from '../risk-analysis/risk-assessment.js';
import type { RiskAnalysisProvider } from '../risk-analysis/risk-analysis-provider.js';
import {
  elapsedMilliseconds,
  emitOperationalMetric,
  withOperationalMetricContext,
  type OperationalMetricReporter,
} from '../shared/operational-metrics.js';
import { mapWithConcurrency } from '../shared/map-with-concurrency.js';
import type { RepositoryRef, SourceControlProvider } from '../source-control/source-control-provider.js';
import type { StructuralAnalyzer } from '../structural-analysis/structural-analyzer.js';
import type {
  AnalysisReportDto,
  CandidatePairReportDto,
  CompactPullRequestDto,
  PairAssessmentDto,
} from './analysis-report-dto.js';

export interface AnalysisRequest {
  readonly repository: RepositoryRef;
  readonly targetBranch: string;
}

export interface ProviderFailureDiagnostic {
  readonly pullRequestAId: string;
  readonly pullRequestBId: string;
  readonly errorName: string;
  readonly failureReason?: string;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly providerErrorType?: string;
  readonly providerMessage?: string;
}

export interface AnalysisDependencies {
  readonly sourceControlProvider: SourceControlProvider;
  readonly structuralAnalyzer: StructuralAnalyzer;
  readonly riskAnalysisProvider: RiskAnalysisProvider;
  readonly contextRetrievalBounds?: ContextRetrievalBounds;
  readonly reportProviderFailure?: (diagnostic: ProviderFailureDiagnostic) => void;
  readonly reportOperationalMetric?: OperationalMetricReporter;
}

function optionalProperty(error: unknown, property: string): unknown {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[property]
    : undefined;
}

function providerFailureDiagnostic(
  error: RiskAnalysisProviderInvocationError,
  candidatePair: CandidatePair,
): ProviderFailureDiagnostic {
  const providerError = error.cause;
  const failureReason = optionalProperty(providerError, 'reason');
  const requestId =
    optionalProperty(providerError, 'requestId') ??
    optionalProperty(providerError, 'requestID') ??
    optionalProperty(providerError, 'request_id') ??
    optionalProperty(providerError, '_request_id');
  const httpStatus = optionalProperty(providerError, 'status');
  const responseBody = optionalProperty(providerError, 'error');
  const responseError = optionalProperty(responseBody, 'error');
  const providerErrorType =
    optionalProperty(responseError, 'type') ?? optionalProperty(providerError, 'type');
  const rawProviderMessage = optionalProperty(responseError, 'message');
  // Anthropic validation messages describe the rejected request/schema and do
  // not contain the prompt or API key. Keep them bounded and single-line so
  // operational diagnostics remain useful without dumping request content.
  const providerMessage =
    typeof rawProviderMessage === 'string'
      ? rawProviderMessage.replace(/\s+/g, ' ').trim().slice(0, 600)
      : undefined;

  return {
    pullRequestAId: candidatePair.pullRequestA.id,
    pullRequestBId: candidatePair.pullRequestB.id,
    errorName: providerError instanceof Error ? providerError.name : 'UnknownProviderError',
    ...(typeof failureReason === 'string' ? { failureReason } : {}),
    ...(typeof requestId === 'string' ? { requestId } : {}),
    ...(typeof httpStatus === 'number' ? { httpStatus } : {}),
    ...(typeof providerErrorType === 'string' ? { providerErrorType } : {}),
    ...(providerMessage !== undefined && providerMessage.length > 0
      ? { providerMessage }
      : {}),
  };
}

function toCompactPullRequest(pullRequest: NormalizedPullRequest): CompactPullRequestDto {
  return { id: pullRequest.id, title: pullRequest.title, webUrl: pullRequest.webUrl };
}

/** Deterministic identity key for warning deduplication: field order matches `AnalysisWarning`. */
function warningKey(warning: AnalysisWarning): string {
  return JSON.stringify([
    warning.pullRequestId,
    warning.relatedPullRequestId ?? '',
    warning.filePath ?? '',
    warning.reason,
    warning.message,
  ]);
}

/** Deterministically removes duplicate warnings, keeping each warning's first occurrence. */
function deduplicateWarnings(warnings: readonly AnalysisWarning[]): AnalysisWarning[] {
  const seen = new Set<string>();
  const deduplicated: AnalysisWarning[] = [];
  for (const warning of warnings) {
    const key = warningKey(warning);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduplicated.push(warning);
  }
  return deduplicated;
}

const INSUFFICIENT_CONTEXT_MESSAGE =
  'Risk assessment was not run for this Candidate Pair because no Technical Term Match retained sufficient context.';
const PROVIDER_FAILURE_MESSAGE = 'Risk assessment failed for this Candidate Pair and was not completed.';
const ASSESSMENT_CONCURRENCY = 4;

/**
 * Builds the report entry for one Candidate Pair. A provider failure is
 * caught here (never propagated) and mapped to `NOT_RUN`/`PROVIDER_FAILURE`
 * with a sanitized, pair-scoped `ASSESSMENT_NOT_RUN` warning, so it never
 * discards other pairs' completed assessments (M5 backend prompt, section
 * 5).
 */
async function buildCandidatePairReport(
  candidatePair: CandidatePair,
  run: CandidateDiscoveryRun,
  riskAnalysisProvider: RiskAnalysisProvider,
  bounds: ContextRetrievalBounds | undefined,
  reportProviderFailure: AnalysisDependencies['reportProviderFailure'],
): Promise<{ readonly report: CandidatePairReportDto; readonly warnings: readonly AnalysisWarning[] }> {
  let assessment: PairAssessmentDto;
  let warnings: readonly AnalysisWarning[];

  try {
    const outcome = await assessCandidatePair(candidatePair, run, riskAnalysisProvider, bounds);
    if (outcome.kind === 'ASSESSED') {
      assessment = { state: 'COMPLETED', result: outcome.riskResult };
      warnings = outcome.warnings;
    } else {
      assessment = {
        state: 'NOT_RUN',
        reason: 'INSUFFICIENT_CONTEXT',
        message: INSUFFICIENT_CONTEXT_MESSAGE,
      };
      warnings = outcome.warnings;
    }
  } catch (error) {
    if (!(error instanceof RiskAnalysisProviderInvocationError)) {
      throw error;
    }
    reportProviderFailure?.(providerFailureDiagnostic(error, candidatePair));
    assessment = { state: 'NOT_RUN', reason: 'PROVIDER_FAILURE', message: PROVIDER_FAILURE_MESSAGE };
    warnings = [
      ...error.warnings,
      {
        pullRequestId: candidatePair.pullRequestA.id,
        relatedPullRequestId: candidatePair.pullRequestB.id,
        reason: 'ASSESSMENT_NOT_RUN',
        message: PROVIDER_FAILURE_MESSAGE,
      },
    ];
  }

  return {
    report: {
      pullRequestA: toCompactPullRequest(candidatePair.pullRequestA),
      pullRequestB: toCompactPullRequest(candidatePair.pullRequestB),
      technicalTermMatches: candidatePair.technicalTermMatches,
      assessment,
    },
    warnings,
  };
}

/**
 * Runs one complete synchronous analysis: eligible pull-request retrieval,
 * Candidate Discovery, one assessment attempt per assessable Candidate Pair,
 * and mapping into `AnalysisReportDto`. All summary counts are derived from
 * the same eligible-PR, Candidate-Pair and assessment collections the report
 * returns.
 */
async function executeAnalysis(
  request: AnalysisRequest,
  dependencies: AnalysisDependencies,
  runStartedAt: number,
): Promise<AnalysisReportDto> {
  const {
    sourceControlProvider,
    structuralAnalyzer,
    riskAnalysisProvider,
    contextRetrievalBounds,
    reportProviderFailure,
    reportOperationalMetric,
  } = dependencies;

  const eligibleRetrievalStartedAt = performance.now();
  const eligiblePullRequests = await sourceControlProvider.getEligiblePullRequests(
    request.repository,
    request.targetBranch,
  );
  const eligiblePullRequestRetrievalMs = elapsedMilliseconds(eligibleRetrievalStartedAt);
  const candidateDiscoveryStartedAt = performance.now();
  const run = await discoverCandidates(
    eligiblePullRequests,
    request.repository,
    sourceControlProvider,
    structuralAnalyzer,
  );
  const candidateDiscoveryMs = elapsedMilliseconds(candidateDiscoveryStartedAt);

  const candidatePairReports: CandidatePairReportDto[] = [];
  const allWarnings: AnalysisWarning[] = [...run.result.warnings];

  let riskIdentifiedCount = 0;
  let noRiskIdentifiedCount = 0;
  let notAssessedCount = 0;

  const assessmentStartedAt = performance.now();
  const assessmentResults = await mapWithConcurrency(
    run.result.candidatePairs,
    ASSESSMENT_CONCURRENCY,
    (candidatePair) => buildCandidatePairReport(
      candidatePair,
      run,
      riskAnalysisProvider,
      contextRetrievalBounds,
      reportProviderFailure,
    ),
  );

  for (const { report, warnings } of assessmentResults) {
    candidatePairReports.push(report);
    allWarnings.push(...warnings);

    if (report.assessment.state === 'COMPLETED') {
      if (report.assessment.result.status === 'RISK_IDENTIFIED') {
        riskIdentifiedCount++;
      } else {
        noRiskIdentifiedCount++;
      }
    } else {
      notAssessedCount++;
    }
  }
  const assessmentWallMs = elapsedMilliseconds(assessmentStartedAt);

  const warnings = deduplicateWarnings(allWarnings);
  const eligiblePullRequestCount = eligiblePullRequests.length;
  const possiblePairCount =
    eligiblePullRequestCount < 2 ? 0 : (eligiblePullRequestCount * (eligiblePullRequestCount - 1)) / 2;

  const report: AnalysisReportDto = {
    repositoryUrl: `https://github.com/${request.repository.owner}/${request.repository.repo}`,
    targetBranch: request.targetBranch,
    status: warnings.length > 0 ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED',
    summary: {
      eligiblePullRequestCount,
      possiblePairCount,
      candidatePairCount: run.result.candidatePairs.length,
      assessedPairCount: riskIdentifiedCount + noRiskIdentifiedCount,
      riskIdentifiedCount,
      notAssessedCount,
      noRiskIdentifiedCount,
    },
    eligiblePullRequests: eligiblePullRequests.map((pullRequest) => ({
      id: pullRequest.id,
      title: pullRequest.title,
      webUrl: pullRequest.webUrl,
      sourceBranch: pullRequest.sourceBranch,
      targetBranch: pullRequest.targetBranch,
      changedFileCount: pullRequest.changedFiles.length,
    })),
    candidatePairs: candidatePairReports,
    warnings,
  };

  emitOperationalMetric(reportOperationalMetric, {
    event: 'analysis_run',
    outcome: 'COMPLETED',
    durationMs: elapsedMilliseconds(runStartedAt),
    eligiblePullRequestRetrievalMs,
    candidateDiscoveryMs,
    assessmentWallMs,
    eligiblePullRequestCount,
    possiblePairCount,
    candidatePairCount: run.result.candidatePairs.length,
    assessedPairCount: riskIdentifiedCount + noRiskIdentifiedCount,
    riskIdentifiedCount,
    noRiskIdentifiedCount,
    notAssessedCount,
    warningCount: warnings.length,
  });

  return report;
}

export async function runAnalysis(
  request: AnalysisRequest,
  dependencies: AnalysisDependencies,
): Promise<AnalysisReportDto> {
  return withOperationalMetricContext(async () => {
    const runStartedAt = performance.now();
    try {
      return await executeAnalysis(request, dependencies, runStartedAt);
    } catch (error) {
      emitOperationalMetric(dependencies.reportOperationalMetric, {
        event: 'analysis_run',
        outcome: 'FAILED',
        durationMs: elapsedMilliseconds(runStartedAt),
        errorName: error instanceof Error ? error.name : 'UnknownAnalysisError',
      });
      throw error;
    }
  });
}

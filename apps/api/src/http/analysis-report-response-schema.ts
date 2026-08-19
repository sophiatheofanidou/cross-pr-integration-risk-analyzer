/** Strict validation for the reviewer-facing `POST /api/analysis` response. */

import { z } from 'zod';
import type { AnalysisReportDto } from '../application/analysis-report-dto.js';
import {
  NO_RISK_EXPLANATION_MAX_LENGTH,
  POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH,
  REVIEWER_ACTION_MAX_LENGTH,
} from '../domain/risk-result.js';

const requiredText = (maxLength?: number) => {
  const schema = z.string().trim().min(1);
  return maxLength === undefined ? schema : schema.max(maxLength);
};
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
const httpsUrl = requiredText().url().refine((value) => parseUrl(value)?.protocol === 'https:', {
  message: 'URL must use HTTPS',
});
const githubUrl = httpsUrl.refine((value) => parseUrl(value)?.hostname.toLowerCase() === 'github.com', {
  message: 'URL must use github.com',
});
const githubRepositoryUrl = githubUrl.refine((value) => {
  const url = parseUrl(value);
  if (url === undefined || url.search.length > 0 || url.hash.length > 0 || url.port.length > 0) {
    return false;
  }
  return url.pathname.split('/').filter((segment) => segment.length > 0).length === 2;
}, { message: 'URL must identify exactly one GitHub repository' });

const confidence = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const severity = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const riskResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('RISK_IDENTIFIED'),
    potentialIntegrationProblem: requiredText(POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH),
    reviewerAction: requiredText(REVIEWER_ACTION_MAX_LENGTH),
    confidence,
    severity,
  }).strict(),
  z.object({
    status: z.literal('NO_RISK_IDENTIFIED'),
    noRiskExplanation: requiredText(NO_RISK_EXPLANATION_MAX_LENGTH),
    confidence,
  }).strict(),
]);

const sourcePosition = z.object({ line: positiveInteger, column: positiveInteger }).strict();
const sourceRange = z.object({ start: sourcePosition, end: sourcePosition }).strict();
const sourceLocation = z.object({
  pullRequestId: requiredText(),
  filePath: requiredText(),
  range: sourceRange,
}).strict();
const technicalTermMatch = z.object({
  technicalTerm: requiredText(),
  changedRegionLocation: sourceLocation,
  matchingOccurrenceLocation: sourceLocation,
}).strict();

const pairAssessment = z.discriminatedUnion('state', [
  z.object({ state: z.literal('COMPLETED'), result: riskResult }).strict(),
  z.object({
    state: z.literal('NOT_RUN'),
    reason: z.enum(['INSUFFICIENT_CONTEXT', 'PROVIDER_FAILURE']),
    message: requiredText(),
  }).strict(),
]);
const compactPullRequest = z.object({
  id: requiredText(),
  title: requiredText(),
  webUrl: githubUrl,
}).strict();
const candidatePairReport = z.object({
  pullRequestA: compactPullRequest,
  pullRequestB: compactPullRequest,
  technicalTermMatches: z.array(technicalTermMatch),
  assessment: pairAssessment,
}).strict();
const eligiblePullRequest = z.object({
  id: requiredText(),
  title: requiredText(),
  webUrl: githubUrl,
  sourceBranch: requiredText(),
  targetBranch: requiredText(),
  changedFileCount: nonNegativeInteger,
}).strict();
const warningReason = z.enum([
  'UNSUPPORTED_FILE_EXTENSION',
  'DELETED_FILE',
  'RENAMED_FILE',
  'FILE_UNAVAILABLE',
  'FILE_OVERSIZED',
  'UNSUPPORTED_CONTENT',
  'UNRECONSTRUCTABLE_CHANGED_RANGES',
  'MALFORMED_SOURCE',
  'CONTEXT_OMITTED',
  'ASSESSMENT_NOT_RUN',
]);
const warning = z.object({
  pullRequestId: requiredText(),
  relatedPullRequestId: requiredText().optional(),
  filePath: requiredText().optional(),
  reason: warningReason,
  message: requiredText(),
}).strict();

export const analysisReportDtoSchema: z.ZodType<AnalysisReportDto> = z.object({
  repositoryUrl: githubRepositoryUrl,
  targetBranch: requiredText(),
  status: z.enum(['COMPLETED', 'COMPLETED_WITH_WARNINGS']),
  summary: z.object({
    eligiblePullRequestCount: nonNegativeInteger,
    possiblePairCount: nonNegativeInteger,
    candidatePairCount: nonNegativeInteger,
    assessedPairCount: nonNegativeInteger,
    riskIdentifiedCount: nonNegativeInteger,
    notAssessedCount: nonNegativeInteger,
    noRiskIdentifiedCount: nonNegativeInteger,
  }).strict(),
  eligiblePullRequests: z.array(eligiblePullRequest),
  candidatePairs: z.array(candidatePairReport),
  warnings: z.array(warning),
}).strict();

/**
 * Diagnostic Candidate Discovery / Context Retrieval warnings.
 *
 * See docs/design/04-candidate-discovery.md (Analysis Warnings) and
 * docs/design/05-context-retrieval.md. Warnings distinguish "analysis
 * completed and no match was found" from "the relevant analysis could not
 * be completed" (ADR-012). They are diagnostic metadata, not Candidate
 * Pair evidence.
 */

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

/**
 * A single analysis warning. `pullRequestId` and, where applicable,
 * `filePath` identify what the warning is about.
 *
 * `relatedPullRequestId` is present only for a warning scoped to a specific
 * Candidate Pair (e.g. an assessment-not-run or omitted-context warning
 * produced by Context Retrieval), so the warning can be correlated to both
 * pull requests in that pair.
 */
export interface AnalysisWarning {
  readonly pullRequestId: string;
  readonly relatedPullRequestId?: string;
  readonly filePath?: string;
  readonly reason: AnalysisWarningReason;
  readonly message: string;
}

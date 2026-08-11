/**
 * Focused Context Bundle contracts produced by Repository Context
 * Retrieval.
 *
 * See docs/design/05-context-retrieval.md (Context Construction, Output).
 */

import type { CandidateEvidence } from './candidate-evidence.js';
import type { NormalizedPullRequest } from './pull-request.js';

/**
 * A relevant excerpt of a pull request's diff for one file, as selected by
 * Repository Context Retrieval (which prefers relevant hunks over sending
 * every changed line).
 */
export interface RelevantDiffHunk {
  readonly filePath: string;
  readonly diffHunk: string;
}

/**
 * An additional repository snippet included in a Context Bundle, together
 * with the reason it was retrieved
 * (docs/design/05-context-retrieval.md, Retrieval Reasons).
 */
export interface ContextSnippet {
  readonly filePath: string;
  /** The enclosing definition, call or reference this snippet represents, when known. */
  readonly symbol?: string;
  readonly codeSnippet: string;
  readonly retrievalReason: string;
}

/**
 * Content that was relevant but could not be included, e.g. because it was
 * binary, oversized, unavailable or otherwise unsupported
 * (docs/design/04-candidate-discovery.md, Patch and Source-Content
 * Availability; docs/design/05-context-retrieval.md, Source-Content
 * Acquisition Boundary).
 */
export interface CoverageLimitation {
  /** Absent when the limitation is not specific to a single file. */
  readonly filePath?: string;
  readonly reason: string;
}

/**
 * The focused input to AI Risk Analysis
 * (docs/design/05-context-retrieval.md, Output).
 */
export interface ContextBundle {
  readonly pullRequestA: NormalizedPullRequest;
  readonly pullRequestARelevantDiffHunks: readonly RelevantDiffHunk[];
  readonly pullRequestB: NormalizedPullRequest;
  readonly pullRequestBRelevantDiffHunks: readonly RelevantDiffHunk[];
  readonly evidence: readonly CandidateEvidence[];
  readonly repositoryContext: readonly ContextSnippet[];
  readonly coverageLimitations: readonly CoverageLimitation[];
}

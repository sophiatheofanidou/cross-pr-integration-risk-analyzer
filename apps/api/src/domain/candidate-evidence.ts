/**
 * Deterministic Candidate Discovery evidence and Candidate Pairs.
 *
 * See docs/design/04-candidate-discovery.md (Discovery Strategy, Evidence
 * Model, Output). This evidence is factual and deterministic; it is
 * distinct from the AI reasoning represented in risk-analysis.ts.
 */

import type { NormalizedPullRequest } from './pull-request.js';

/**
 * The five approved MVP Candidate Discovery evidence rules
 * (docs/design/07-mvp-specification.md, Required MVP Evidence Rules).
 * No additional evidence rule ID may be introduced without an approved design
 * change.
 */
export type CandidateEvidenceRuleId =
  | 'SAME_CHANGED_FILE'
  | 'SHARED_IDENTIFIER'
  | 'CHANGED_IDENTIFIER_IN_OTHER_CHANGED_FILE'
  | 'SHARED_CHANGED_SYMBOL'
  | 'MODIFIED_DEFINITION_REFERENCED_BY_OTHER_PR';

/**
 * Where a piece of evidence was observed within one of the two pull
 * requests ("PR A Location" / "PR B Location" in the Evidence Model).
 */
export interface EvidenceLocation {
  readonly filePath: string;
}

/**
 * A single factual observation connecting two pull requests
 * (docs/design/04-candidate-discovery.md, Evidence Model).
 */
export interface CandidateEvidence {
  readonly ruleId: CandidateEvidenceRuleId;
  /**
   * The technical resource or symbol the evidence is about ("Technical
   * Resource" in the Evidence Model). Some evidence rules (e.g.
   * `SAME_CHANGED_FILE`) concern a file path rather than a structural
   * symbol, so this is intentionally not named `symbol`.
   */
  readonly technicalResource: string;
  readonly pullRequestALocation: EvidenceLocation;
  readonly pullRequestBLocation: EvidenceLocation;
}

/**
 * Two pull requests selected for deeper analysis because at least one
 * evidence rule matched (docs/design/04-candidate-discovery.md, Candidate
 * Selection and Output).
 */
export interface CandidatePair {
  readonly pullRequestA: NormalizedPullRequest;
  readonly pullRequestB: NormalizedPullRequest;
  readonly evidence: readonly CandidateEvidence[];
}

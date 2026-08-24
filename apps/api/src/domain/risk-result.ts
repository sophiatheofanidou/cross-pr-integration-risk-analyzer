/**
 * Provider-neutral result of one completed AI Risk Assessment.
 *
 * Deterministic Technical Term Matches remain on the Candidate Pair as
 * factual evidence. A Risk Result contains the provider's validated semantic
 * interpretation of that evidence (docs/design/06-ai-risk-analysis.md, MVP
 * Output).
 */

export type RiskConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export const LIKELY_OUTCOME_MAX_LENGTH = 160;
export const PULL_REQUEST_CONTRIBUTION_MAX_LENGTH = 400;
export const COMBINED_EFFECT_MAX_LENGTH = 800;
export const REVIEWER_ACTION_MAX_LENGTH = 600;
export const NO_RISK_SECTION_MAX_LENGTH = 600;

export interface RelevantCodeLocation {
  readonly pullRequestId: string;
  readonly technicalTerm: string;
  readonly filePath: string;
  readonly startLine: number;
}

export type RiskResult =
  | {
      readonly status: 'RISK_IDENTIFIED';
      /** Short, plain-language, reviewer-visible outcome if both pull requests are merged. */
      readonly likelyOutcome: string;
      /** What pull request A changes or assumes in the risky interaction. */
      readonly pullRequestAContribution: string;
      /** What pull request B changes or assumes in the risky interaction. */
      readonly pullRequestBContribution: string;
      /** Why the two individually plausible changes may become incompatible when combined. */
      readonly combinedEffect: string;
      /** Provider-selected locations, resolved and validated against deterministic evidence. */
      readonly relevantCode: {
        readonly pullRequestA: readonly RelevantCodeLocation[];
        readonly pullRequestB: readonly RelevantCodeLocation[];
      };
      /**
       * One concrete imperative review step (maximum 600 characters),
       * naming the relevant supplied file, symbol or data flow when the
       * evidence supports it.
       */
      readonly reviewerAction: string;
      readonly confidence: RiskConfidence;
      readonly severity: RiskSeverity;
    }
  | {
      readonly status: 'NO_RISK_IDENTIFIED';
      /** Why the deterministic matcher selected this pair. */
      readonly relationshipSummary: string;
      /** Why the supplied evidence indicates independence or compatibility. */
      readonly independenceReason: string;
      /** Material limitation on the bounded conclusion, when one exists. */
      readonly coverageLimitation?: string;
      readonly confidence: RiskConfidence;
    };

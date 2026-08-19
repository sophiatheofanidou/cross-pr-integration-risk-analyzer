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

export const POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH = 2000;
export const REVIEWER_ACTION_MAX_LENGTH = 600;
export const NO_RISK_EXPLANATION_MAX_LENGTH = 1200;

export type RiskResult =
  | {
      readonly status: 'RISK_IDENTIFIED';
      /**
       * A short, self-contained reviewer-facing analysis (preferably 2-5
       * sentences, maximum 2,000 characters) that explains how the two pull
       * requests are technically connected, the incompatibility or risky
       * interaction that may arise when combined, and the behavior or flow
       * that may be affected if both are merged (docs/design/06-ai-risk-analysis.md,
       * MVP Output).
       */
      readonly potentialIntegrationProblem: string;
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
      /**
       * Why the deterministic relationship appears compatible or
       * coincidental (maximum 1,200 characters).
       */
      readonly noRiskExplanation: string;
      readonly confidence: RiskConfidence;
    };

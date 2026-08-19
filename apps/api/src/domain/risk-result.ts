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

export type RiskResult =
  | {
      readonly status: 'RISK_IDENTIFIED';
      readonly explanation: string;
      readonly changedAssumption: string;
      readonly confidence: RiskConfidence;
      readonly severity: RiskSeverity;
      readonly reviewerCheck: string;
    }
  | {
      readonly status: 'NO_RISK_IDENTIFIED';
      readonly explanation: string;
      readonly confidence: RiskConfidence;
    };

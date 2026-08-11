/**
 * Tiered AI Risk Analysis contracts: screening results and Detailed Analysis
 * Results.
 *
 * See docs/design/06-ai-risk-analysis.md (Screening Analysis, Detailed Risk
 * Analysis, Output). These types represent AI-generated reasoning, kept
 * distinct from the deterministic evidence in candidate-evidence.ts.
 */

import type { CandidateEvidence } from './candidate-evidence.js';
import type { CoverageLimitation } from './context-bundle.js';
import type { NormalizedPullRequest } from './pull-request.js';

/**
 * The two-decision screening model
 * (docs/design/06-ai-risk-analysis.md, Screening Output).
 */
export type ScreeningDecision = 'DISMISS' | 'ESCALATE';

/**
 * The outcome of the cheap screening tier for a Candidate Pair.
 */
export interface ScreeningResult {
  readonly decision: ScreeningDecision;
  readonly rationale: string;
}

/**
 * Whether Detailed Analysis concluded a plausible integration risk exists
 * for the pair (docs/design/06-ai-risk-analysis.md, No Risk Identified: "Not
 * every Candidate Pair should produce a risk finding").
 */
export type RiskStatus = 'RISK_IDENTIFIED' | 'NO_RISK_IDENTIFIED';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Fields common to a Detailed Analysis result regardless of outcome
 * (docs/design/06-ai-risk-analysis.md, Output).
 */
interface DetailedAnalysisResultBase {
  readonly pullRequestA: NormalizedPullRequest;
  readonly pullRequestB: NormalizedPullRequest;
  readonly coverageLimitations: readonly CoverageLimitation[];
}

/**
 * The finding payload produced only when Detailed Analysis identifies a
 * plausible integration risk.
 */
export interface RiskFinding {
  readonly explanation: string;
  readonly supportingEvidence: readonly CandidateEvidence[];
  readonly inferredAssumption: string;
  readonly confidence: ConfidenceLevel;
  readonly severity: SeverityLevel;
  readonly recommendedReviewerCheck: string;
}

/**
 * The RISK_IDENTIFIED state of a Detailed Analysis Result. The Risk Finding
 * contains the details of what was identified.
 */
export interface RiskIdentifiedResult extends DetailedAnalysisResultBase {
  readonly riskStatus: 'RISK_IDENTIFIED';
  readonly finding: RiskFinding;
}

/**
 * The NO_RISK_IDENTIFIED state of a Detailed Analysis Result
 * (docs/design/06-ai-risk-analysis.md, No Risk Identified).
 */
export interface NoRiskIdentifiedResult extends DetailedAnalysisResultBase {
  readonly riskStatus: 'NO_RISK_IDENTIFIED';
  readonly explanation: string;
  readonly supportingEvidence: readonly CandidateEvidence[];
}

/**
 * The structured output of Detailed Analysis for an escalated Candidate
 * Pair. Both branches are result states; only RISK_IDENTIFIED contains a
 * Risk Finding.
 */
export type DetailedAnalysisResult =
  | RiskIdentifiedResult
  | NoRiskIdentifiedResult;

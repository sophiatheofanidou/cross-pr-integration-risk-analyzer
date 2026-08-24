/**
 * Provider-neutral boundary for one completed AI Risk Assessment.
 *
 * Trusted system instructions are deliberately separate from the user
 * message that contains untrusted repository-provided data. Provider-specific
 * request and response shapes remain inside the concrete adapter.
 */

import type { RiskResult } from '../domain/risk-result.js';
import type { SourceLocation } from '../domain/source-location.js';

export interface RiskEvidenceReference {
  readonly id: string;
  readonly technicalTerm: string;
  readonly location: SourceLocation;
}

export interface RiskAssessmentPrompt {
  readonly systemInstructions: string;
  readonly userMessage: string;
  /** Deterministic allow-list used to resolve provider-selected evidence IDs. */
  readonly evidenceReferences: readonly RiskEvidenceReference[];
  readonly pullRequestAId: string;
  readonly pullRequestBId: string;
}

export interface RiskAnalysisProvider {
  assess(prompt: RiskAssessmentPrompt): Promise<RiskResult>;
}

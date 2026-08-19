/**
 * Provider-neutral boundary for one completed AI Risk Assessment.
 *
 * Trusted system instructions are deliberately separate from the user
 * message that contains untrusted repository-provided data. Provider-specific
 * request and response shapes remain inside the concrete adapter.
 */

import type { RiskResult } from '../domain/risk-result.js';

export interface RiskAssessmentPrompt {
  readonly systemInstructions: string;
  readonly userMessage: string;
}

export interface RiskAnalysisProvider {
  assess(prompt: RiskAssessmentPrompt): Promise<RiskResult>;
}

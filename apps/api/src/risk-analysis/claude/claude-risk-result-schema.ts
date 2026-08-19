/** Adapter-local validation for Claude structured output. */

import { z } from 'zod';
import type { RiskResult } from '../../domain/risk-result.js';
import {
  NO_RISK_EXPLANATION_MAX_LENGTH,
  POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH,
  REVIEWER_ACTION_MAX_LENGTH,
} from '../../domain/risk-result.js';

export {
  NO_RISK_EXPLANATION_MAX_LENGTH,
  POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH,
  REVIEWER_ACTION_MAX_LENGTH,
} from '../../domain/risk-result.js';

const requiredText = (maxLength: number) => z.string().trim().min(1).max(maxLength);
const confidenceSchema = z
  .enum(['LOW', 'MEDIUM', 'HIGH'])
  .describe('Evidential support for the assessment, not potential impact');
const severitySchema = z
  .enum(['LOW', 'MEDIUM', 'HIGH'])
  .describe('Potential impact if the identified risk is real');

export const claudeRiskResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('RISK_IDENTIFIED'),
      potentialIntegrationProblem: requiredText(POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH).describe(
        'A short, self-contained reviewer-facing analysis explaining how the two pull requests are technically connected, the incompatibility or risky interaction that may arise when combined, and the behavior or flow that may be affected if both are merged',
      ),
      reviewerAction: requiredText(REVIEWER_ACTION_MAX_LENGTH).describe(
        'One concrete imperative review step, naming the relevant supplied file, symbol or data flow when the evidence supports it',
      ),
      confidence: confidenceSchema,
      severity: severitySchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('NO_RISK_IDENTIFIED'),
      noRiskExplanation: requiredText(NO_RISK_EXPLANATION_MAX_LENGTH).describe(
        'Why the supplied deterministic relationship appears compatible or coincidental',
      ),
      confidence: confidenceSchema,
    })
    .strict(),
]);

export function normalizeClaudeRiskResult(
  output: z.infer<typeof claudeRiskResultSchema>,
): RiskResult {
  if (output.status === 'RISK_IDENTIFIED') {
    return {
      status: output.status,
      potentialIntegrationProblem: output.potentialIntegrationProblem,
      reviewerAction: output.reviewerAction,
      confidence: output.confidence,
      severity: output.severity,
    };
  }

  return {
    status: output.status,
    noRiskExplanation: output.noRiskExplanation,
    confidence: output.confidence,
  };
}

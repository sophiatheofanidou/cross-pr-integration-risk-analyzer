/** Adapter-local validation for Claude structured output. */

import { z } from 'zod';
import type { RiskResult } from '../../domain/risk-result.js';

const requiredText = z.string().trim().min(1);
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
      explanation: requiredText.describe(
        'Evidence-based explanation that distinguishes supplied facts from semantic inference',
      ),
      changedAssumption: requiredText.describe(
        'The assumption changed by one pull request that the other may still rely on',
      ),
      confidence: confidenceSchema,
      severity: severitySchema,
      reviewerCheck: requiredText.describe('One targeted check for a human reviewer'),
    })
    .strict(),
  z
    .object({
      status: z.literal('NO_RISK_IDENTIFIED'),
      explanation: requiredText.describe(
        'Why the supplied structural relationship appears compatible or coincidental',
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
      explanation: output.explanation,
      changedAssumption: output.changedAssumption,
      confidence: output.confidence,
      severity: output.severity,
      reviewerCheck: output.reviewerCheck,
    };
  }

  return {
    status: output.status,
    explanation: output.explanation,
    confidence: output.confidence,
  };
}

import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import {
  claudeRiskResultSchema,
  NO_RISK_EXPLANATION_MAX_LENGTH,
  normalizeClaudeRiskResult,
  POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH,
  REVIEWER_ACTION_MAX_LENGTH,
} from './claude-risk-result-schema.js';

describe('claudeRiskResultSchema', () => {
  it('generates an Anthropic-compatible union schema without reusable definitions', () => {
    const generatedSchema = zodOutputFormat(claudeRiskResultSchema).schema;
    const serializedSchema = JSON.stringify(generatedSchema);

    expect(generatedSchema).toHaveProperty('anyOf');
    expect(serializedSchema).not.toContain('"$defs"');
    expect(serializedSchema).not.toContain('"$ref"');
  });

  it('validates and trims a complete identified-risk result', () => {
    const parsed = claudeRiskResultSchema.parse({
      status: 'RISK_IDENTIFIED',
      potentialIntegrationProblem: '  PR A changes the processPayment contract that PR B still calls.  ',
      reviewerAction: '  Verify every combined caller of processPayment.  ',
      confidence: 'HIGH',
      severity: 'MEDIUM',
    });

    expect(normalizeClaudeRiskResult(parsed)).toEqual({
      status: 'RISK_IDENTIFIED',
      potentialIntegrationProblem: 'PR A changes the processPayment contract that PR B still calls.',
      reviewerAction: 'Verify every combined caller of processPayment.',
      confidence: 'HIGH',
      severity: 'MEDIUM',
    });
  });

  it('validates a no-risk result without risk-only fields', () => {
    const parsed = claudeRiskResultSchema.parse({
      status: 'NO_RISK_IDENTIFIED',
      noRiskExplanation: 'The names refer to unrelated local functions.',
      confidence: 'MEDIUM',
    });

    expect(normalizeClaudeRiskResult(parsed)).toEqual({
      status: 'NO_RISK_IDENTIFIED',
      noRiskExplanation: 'The names refer to unrelated local functions.',
      confidence: 'MEDIUM',
    });
  });

  it('accepts potentialIntegrationProblem and reviewerAction exactly at their maximum length', () => {
    const parsed = claudeRiskResultSchema.safeParse({
      status: 'RISK_IDENTIFIED',
      potentialIntegrationProblem: 'x'.repeat(POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH),
      reviewerAction: 'y'.repeat(REVIEWER_ACTION_MAX_LENGTH),
      confidence: 'LOW',
      severity: 'LOW',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects potentialIntegrationProblem exceeding its maximum length', () => {
    const parsed = claudeRiskResultSchema.safeParse({
      status: 'RISK_IDENTIFIED',
      potentialIntegrationProblem: 'x'.repeat(POTENTIAL_INTEGRATION_PROBLEM_MAX_LENGTH + 1),
      reviewerAction: 'Verify the combined callers.',
      confidence: 'LOW',
      severity: 'LOW',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects reviewerAction exceeding its maximum length', () => {
    const parsed = claudeRiskResultSchema.safeParse({
      status: 'RISK_IDENTIFIED',
      potentialIntegrationProblem: 'PR A changes a contract that PR B still relies on.',
      reviewerAction: 'y'.repeat(REVIEWER_ACTION_MAX_LENGTH + 1),
      confidence: 'LOW',
      severity: 'LOW',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts noRiskExplanation exactly at its maximum length', () => {
    const parsed = claudeRiskResultSchema.safeParse({
      status: 'NO_RISK_IDENTIFIED',
      noRiskExplanation: 'z'.repeat(NO_RISK_EXPLANATION_MAX_LENGTH),
      confidence: 'LOW',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects noRiskExplanation exceeding its maximum length', () => {
    const parsed = claudeRiskResultSchema.safeParse({
      status: 'NO_RISK_IDENTIFIED',
      noRiskExplanation: 'z'.repeat(NO_RISK_EXPLANATION_MAX_LENGTH + 1),
      confidence: 'LOW',
    });

    expect(parsed.success).toBe(false);
  });

  it.each([
    {
      status: 'RISK_IDENTIFIED',
      potentialIntegrationProblem: 'Missing conditional fields.',
      confidence: 'LOW',
    },
    {
      status: 'NO_RISK_IDENTIFIED',
      noRiskExplanation: 'Extra risk fields are not allowed.',
      confidence: 'LOW',
      severity: 'LOW',
    },
    {
      status: 'NO_RISK_IDENTIFIED',
      noRiskExplanation: '   ',
      confidence: 'LOW',
    },
    {
      status: 'NO_RISK_IDENTIFIED',
      noRiskExplanation: 'Invalid confidence.',
      confidence: 'CERTAIN',
    },
    {
      status: 'UNKNOWN',
      noRiskExplanation: 'Invalid status.',
      confidence: 'LOW',
    },
    // The superseded field names must no longer validate.
    {
      status: 'RISK_IDENTIFIED',
      explanation: 'Old field name.',
      changedAssumption: 'Old field name.',
      reviewerCheck: 'Old field name.',
      confidence: 'LOW',
      severity: 'LOW',
    },
  ])('rejects malformed provider output %#', (output) => {
    expect(claudeRiskResultSchema.safeParse(output).success).toBe(false);
  });
});

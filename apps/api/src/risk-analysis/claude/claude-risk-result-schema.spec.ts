import { describe, expect, it } from 'vitest';
import {
  claudeRiskResultSchema,
  normalizeClaudeRiskResult,
} from './claude-risk-result-schema.js';

describe('claudeRiskResultSchema', () => {
  it('validates and trims a complete identified-risk result', () => {
    const parsed = claudeRiskResultSchema.parse({
      status: 'RISK_IDENTIFIED',
      explanation: '  The caller may rely on the previous contract.  ',
      changedAssumption: '  The function now requires a currency.  ',
      confidence: 'HIGH',
      severity: 'MEDIUM',
      reviewerCheck: '  Verify combined callers.  ',
    });

    expect(normalizeClaudeRiskResult(parsed)).toEqual({
      status: 'RISK_IDENTIFIED',
      explanation: 'The caller may rely on the previous contract.',
      changedAssumption: 'The function now requires a currency.',
      confidence: 'HIGH',
      severity: 'MEDIUM',
      reviewerCheck: 'Verify combined callers.',
    });
  });

  it('validates a no-risk result without risk-only fields', () => {
    const parsed = claudeRiskResultSchema.parse({
      status: 'NO_RISK_IDENTIFIED',
      explanation: 'The names refer to unrelated local functions.',
      confidence: 'MEDIUM',
    });

    expect(normalizeClaudeRiskResult(parsed)).toEqual({
      status: 'NO_RISK_IDENTIFIED',
      explanation: 'The names refer to unrelated local functions.',
      confidence: 'MEDIUM',
    });
  });

  it.each([
    {
      status: 'RISK_IDENTIFIED',
      explanation: 'Missing conditional fields.',
      confidence: 'LOW',
    },
    {
      status: 'NO_RISK_IDENTIFIED',
      explanation: 'Extra risk fields are not allowed.',
      confidence: 'LOW',
      severity: 'LOW',
    },
    {
      status: 'NO_RISK_IDENTIFIED',
      explanation: '   ',
      confidence: 'LOW',
    },
    {
      status: 'NO_RISK_IDENTIFIED',
      explanation: 'Invalid confidence.',
      confidence: 'CERTAIN',
    },
    {
      status: 'UNKNOWN',
      explanation: 'Invalid status.',
      confidence: 'LOW',
    },
  ])('rejects malformed provider output %#', (output) => {
    expect(claudeRiskResultSchema.safeParse(output).success).toBe(false);
  });
});

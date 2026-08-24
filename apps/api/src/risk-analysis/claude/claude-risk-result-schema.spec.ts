import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import type { RiskEvidenceReference } from '../risk-analysis-provider.js';
import {
  claudeRiskResultSchema,
  COMBINED_EFFECT_MAX_LENGTH,
  LIKELY_OUTCOME_MAX_LENGTH,
  NO_RISK_SECTION_MAX_LENGTH,
  normalizeClaudeRiskResult,
  PULL_REQUEST_CONTRIBUTION_MAX_LENGTH,
  REVIEWER_ACTION_MAX_LENGTH,
} from './claude-risk-result-schema.js';

const evidenceReferences: readonly RiskEvidenceReference[] = [
  {
    id: 'E1',
    technicalTerm: 'processPayment',
    location: {
      pullRequestId: '1', filePath: 'src/a.ts',
      range: { start: { line: 2, column: 1 }, end: { line: 2, column: 5 } },
    },
  },
  {
    id: 'E2',
    technicalTerm: 'processPayment',
    location: {
      pullRequestId: '2', filePath: 'src/b.ts',
      range: { start: { line: 8, column: 1 }, end: { line: 8, column: 5 } },
    },
  },
];

function validRiskOutput() {
  return {
    status: 'RISK_IDENTIFIED' as const,
    likelyOutcome: '  The build may fail.  ',
    pullRequestAId: '1',
    pullRequestAContribution: '  PR #1 changes the shared contract.  ',
    pullRequestARelevantEvidenceId: 'E1',
    pullRequestBId: '2',
    pullRequestBContribution: '  PR #2 uses the previous contract.  ',
    pullRequestBRelevantEvidenceId: 'E2',
    combinedEffect: '  The combined call may not satisfy the updated contract.  ',
    reviewerAction: '  Verify the combined caller.  ',
    confidence: 'HIGH' as const,
    severity: 'MEDIUM' as const,
    couldBlockBuildTypeCheckOrDeployment: false,
    couldCauseSevereFinancialSecurityOrDataImpact: false,
    relationshipSummary: '',
    independenceReason: '',
    coverageLimitation: '',
  };
}

function validNoRiskOutput() {
  return {
    status: 'NO_RISK_IDENTIFIED' as const,
    likelyOutcome: '',
    pullRequestAId: '',
    pullRequestAContribution: '',
    pullRequestARelevantEvidenceId: '',
    pullRequestBId: '',
    pullRequestBContribution: '',
    pullRequestBRelevantEvidenceId: '',
    combinedEffect: '',
    reviewerAction: '',
    confidence: 'MEDIUM' as const,
    severity: 'LOW' as const,
    couldBlockBuildTypeCheckOrDeployment: false,
    couldCauseSevereFinancialSecurityOrDataImpact: false,
    relationshipSummary: 'The same helper name appears in both pull requests.',
    independenceReason: 'The supplied functions are local to separate modules.',
    coverageLimitation: '',
  };
}

describe('claudeRiskResultSchema', () => {
  it('generates an Anthropic-compatible union schema without reusable definitions', () => {
    const generatedSchema = zodOutputFormat(claudeRiskResultSchema).schema;
    const serializedSchema = JSON.stringify(generatedSchema);

    expect(generatedSchema).toHaveProperty('type', 'object');
    expect(serializedSchema).not.toContain('"anyOf"');
    expect(serializedSchema).not.toContain('"$defs"');
    expect(serializedSchema).not.toContain('"$ref"');
  });

  it('validates, trims and resolves a complete identified-risk result', () => {
    const parsed = claudeRiskResultSchema.parse(validRiskOutput());

    expect(normalizeClaudeRiskResult(parsed, evidenceReferences, '1', '2')).toEqual({
      status: 'RISK_IDENTIFIED',
      likelyOutcome: 'The build may fail.',
      pullRequestAContribution: 'PR #1 changes the shared contract.',
      pullRequestBContribution: 'PR #2 uses the previous contract.',
      combinedEffect: 'The combined call may not satisfy the updated contract.',
      relevantCode: {
        pullRequestA: [{ pullRequestId: '1', technicalTerm: 'processPayment', filePath: 'src/a.ts', startLine: 2 }],
        pullRequestB: [{ pullRequestId: '2', technicalTerm: 'processPayment', filePath: 'src/b.ts', startLine: 8 }],
      },
      reviewerAction: 'Verify the combined caller.',
      confidence: 'HIGH',
      severity: 'MEDIUM',
    });
  });

  it('repairs an evidence ID assigned to the wrong pull request using the same term', () => {
    const parsed = claudeRiskResultSchema.parse({
      ...validRiskOutput(),
      pullRequestARelevantEvidenceId: 'E2',
    });

    const result = normalizeClaudeRiskResult(parsed, evidenceReferences, '1', '2');
    expect(result.status).toBe('RISK_IDENTIFIED');
    if (result.status === 'RISK_IDENTIFIED') {
      expect(result.relevantCode.pullRequestA).toEqual([
        { pullRequestId: '1', technicalTerm: 'processPayment', filePath: 'src/a.ts', startLine: 2 },
      ]);
    }
  });

  it('falls back deterministically when Claude invents an evidence ID', () => {
    const parsed = claudeRiskResultSchema.parse({
      ...validRiskOutput(),
      pullRequestARelevantEvidenceId: 'INVENTED',
    });

    const result = normalizeClaudeRiskResult(parsed, evidenceReferences, '1', '2');
    expect(result.status).toBe('RISK_IDENTIFIED');
    if (result.status === 'RISK_IDENTIFIED') {
      expect(result.relevantCode.pullRequestA[0]?.technicalTerm).toBe('processPayment');
      expect(result.relevantCode.pullRequestA[0]?.pullRequestId).toBe('1');
    }
  });

  it('validates a no-risk result with empty risk-only fields', () => {
    const parsed = claudeRiskResultSchema.parse(validNoRiskOutput());

    expect(normalizeClaudeRiskResult(parsed, evidenceReferences, '1', '2')).toEqual({
      status: 'NO_RISK_IDENTIFIED',
      relationshipSummary: 'The same helper name appears in both pull requests.',
      independenceReason: 'The supplied functions are local to separate modules.',
      confidence: 'MEDIUM',
    });
  });

  it('orders contributions by their validated pull-request IDs rather than provider array position', () => {
    const output = validRiskOutput();
    const parsed = claudeRiskResultSchema.parse({
      ...output,
      pullRequestAId: output.pullRequestBId,
      pullRequestAContribution: output.pullRequestBContribution,
      pullRequestARelevantEvidenceId: output.pullRequestBRelevantEvidenceId,
      pullRequestBId: output.pullRequestAId,
      pullRequestBContribution: output.pullRequestAContribution,
      pullRequestBRelevantEvidenceId: output.pullRequestARelevantEvidenceId,
    });

    const result = normalizeClaudeRiskResult(parsed, evidenceReferences, '1', '2');

    expect(result.status).toBe('RISK_IDENTIFIED');
    if (result.status === 'RISK_IDENTIFIED') {
      expect(result.pullRequestAContribution).toBe('PR #1 changes the shared contract.');
      expect(result.pullRequestBContribution).toBe('PR #2 uses the previous contract.');
    }
  });

  it('promotes general build or severe-impact gates to high severity', () => {
    const parsed = claudeRiskResultSchema.parse({
      ...validRiskOutput(),
      couldBlockBuildTypeCheckOrDeployment: true,
    });

    const result = normalizeClaudeRiskResult(parsed, evidenceReferences, '1', '2');

    expect(result.status === 'RISK_IDENTIFIED' ? result.severity : undefined).toBe('HIGH');
  });

  it.each([
    ['likelyOutcome', LIKELY_OUTCOME_MAX_LENGTH],
    ['combinedEffect', COMBINED_EFFECT_MAX_LENGTH],
    ['reviewerAction', REVIEWER_ACTION_MAX_LENGTH],
  ] as const)('rejects %s when it exceeds its maximum length', (field, maxLength) => {
    const parsed = claudeRiskResultSchema.safeParse({
      ...validRiskOutput(),
      [field]: 'x'.repeat(maxLength + 1),
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects an oversized pull-request contribution', () => {
    const parsed = claudeRiskResultSchema.safeParse({
      ...validRiskOutput(),
      pullRequestAContribution: 'x'.repeat(PULL_REQUEST_CONTRIBUTION_MAX_LENGTH + 1),
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a no-risk section exceeding its maximum length', () => {
    const parsed = claudeRiskResultSchema.safeParse({
      ...validNoRiskOutput(),
      relationshipSummary: 'z'.repeat(NO_RISK_SECTION_MAX_LENGTH + 1),
    });

    expect(parsed.success).toBe(false);
  });

  it.each([
    { ...validRiskOutput(), reviewerAction: undefined },
    { ...validRiskOutput(), pullRequestBRelevantEvidenceId: 'x'.repeat(41) },
    { ...validNoRiskOutput(), status: 'UNKNOWN' },
  ])('rejects structurally malformed provider output %#', (output) => {
    expect(claudeRiskResultSchema.safeParse(output).success).toBe(false);
  });

  it.each([
    { ...validRiskOutput(), pullRequestARelevantEvidenceId: ' ' },
    { ...validNoRiskOutput(), reviewerAction: 'risk-only content' },
    { ...validNoRiskOutput(), relationshipSummary: '   ' },
    { ...validNoRiskOutput(), severity: 'HIGH' },
  ])('rejects status-inconsistent provider content %#', (output) => {
    const parsed = claudeRiskResultSchema.parse(output);
    expect(() => normalizeClaudeRiskResult(parsed, evidenceReferences, '1', '2')).toThrow();
  });
});

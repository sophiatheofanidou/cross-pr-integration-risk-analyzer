/**
 * Opt-in real-provider smoke test. Normal test runs exclude this file.
 *
 * Run only with explicit configuration and project-owner approval:
 * RUN_CLAUDE_SMOKE_TEST=1, ANTHROPIC_API_KEY and ANTHROPIC_MODEL.
 */

import { describe, expect, it } from 'vitest';
import { ClaudeRiskAnalysisProvider } from './claude-risk-analysis-provider.js';

const smokeEnabled = process.env['RUN_CLAUDE_SMOKE_TEST'] === '1';
const SMOKE_TEST_TIMEOUT_MS = 60_000;

describe.runIf(smokeEnabled)('ClaudeRiskAnalysisProvider real-provider smoke test', () => {
  it('returns one schema-validated synthetic Risk Result', async () => {
    const model = process.env['ANTHROPIC_MODEL'];
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (model === undefined || apiKey === undefined) {
      throw new Error(
        'ANTHROPIC_MODEL and ANTHROPIC_API_KEY are required for the opt-in Claude smoke test',
      );
    }

    const provider = new ClaudeRiskAnalysisProvider({ model, apiKey });
    const result = await provider.assess({
      systemInstructions:
        'Return an advisory structured Risk Result for only the supplied synthetic data.',
      userMessage:
        '{"repositoryData":{"pullRequestA":{"id":"1","change":"renames a local variable","evidenceId":"E1"},"pullRequestB":{"id":"2","change":"changes an unrelated comment","evidenceId":"E2"}}}',
      evidenceReferences: [
        {
          id: 'E1',
          technicalTerm: 'syntheticTerm',
          location: {
            pullRequestId: '1', filePath: 'src/a.ts',
            range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          },
        },
        {
          id: 'E2',
          technicalTerm: 'syntheticTerm',
          location: {
            pullRequestId: '2', filePath: 'src/b.ts',
            range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          },
        },
      ],
      pullRequestAId: '1',
      pullRequestBId: '2',
    });

    expect(['RISK_IDENTIFIED', 'NO_RISK_IDENTIFIED']).toContain(result.status);
    const explanationLength =
      result.status === 'RISK_IDENTIFIED'
        ? result.likelyOutcome.length
        : result.relationshipSummary.length + result.independenceReason.length +
          (result.coverageLimitation?.length ?? 0);
    expect(explanationLength).toBeGreaterThan(0);
  }, SMOKE_TEST_TIMEOUT_MS);
});

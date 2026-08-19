/**
 * Opt-in real-provider smoke test. Normal test runs exclude this file.
 *
 * Run only with explicit configuration and project-owner approval:
 * RUN_CLAUDE_SMOKE_TEST=1, ANTHROPIC_API_KEY and ANTHROPIC_MODEL.
 */

import { describe, expect, it } from 'vitest';
import { ClaudeRiskAnalysisProvider } from './claude-risk-analysis-provider.js';

const smokeEnabled = process.env['RUN_CLAUDE_SMOKE_TEST'] === '1';

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
        '{"repositoryData":{"pullRequestA":"renames a local variable","pullRequestB":"changes an unrelated comment"}}',
    });

    expect(['RISK_IDENTIFIED', 'NO_RISK_IDENTIFIED']).toContain(result.status);
    expect(result.explanation.length).toBeGreaterThan(0);
  });
});

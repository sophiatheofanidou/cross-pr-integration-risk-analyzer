import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { RiskAssessmentPrompt } from '../risk-analysis-provider.js';
import {
  ClaudeRiskAnalysisError,
  ClaudeRiskAnalysisProvider,
} from './claude-risk-analysis-provider.js';

const prompt: RiskAssessmentPrompt = {
  systemInstructions: 'Trusted system instructions',
  userMessage: '{"repositoryData":{"bounded":true}}',
  evidenceReferences: [
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
  ],
  pullRequestAId: '1',
  pullRequestBId: '2',
};

function fakeClientReturning(message: unknown): {
  readonly client: Anthropic;
  readonly create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue(message);
  return {
    client: { messages: { create } } as unknown as Anthropic,
    create,
  };
}

describe('ClaudeRiskAnalysisProvider', () => {
  it('reports sanitized latency and provider usage for a completed assessment', async () => {
    const metrics: unknown[] = [];
    const { client } = fakeClientReturning({
      _request_id: 'req_metrics_test',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1200,
        output_tokens: 240,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 200,
      },
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'NO_RISK_IDENTIFIED',
          likelyOutcome: '',
          pullRequestAId: '',
          pullRequestAContribution: '',
          pullRequestARelevantEvidenceId: '',
          pullRequestBId: '',
          pullRequestBContribution: '',
          pullRequestBRelevantEvidenceId: '',
          combinedEffect: '',
          reviewerAction: '',
          confidence: 'HIGH',
          severity: 'LOW',
          couldBlockBuildTypeCheckOrDeployment: false,
          couldCauseSevereFinancialSecurityOrDataImpact: false,
          relationshipSummary: 'The supplied pair shares a technical term.',
          independenceReason: 'The bounded contexts are independent.',
          coverageLimitation: '',
        }),
      }],
    });
    const provider = new ClaudeRiskAnalysisProvider({
      model: 'test-model',
      client,
      reportOperationalMetric: (metric) => metrics.push(metric),
    });

    await provider.assess(prompt);

    expect(metrics).toEqual([expect.objectContaining({
      event: 'ai_provider_request',
      provider: 'claude',
      pullRequestAId: '1',
      pullRequestBId: '2',
      model: 'test-model',
      maxTokens: 2048,
      outcome: 'COMPLETED',
      requestId: 'req_metrics_test',
      stopReason: 'end_turn',
      inputTokens: 1200,
      outputTokens: 240,
      cacheCreationInputTokens: 1000,
      cacheReadInputTokens: 200,
      durationMs: expect.any(Number),
    })]);
    expect(JSON.stringify(metrics)).not.toContain(prompt.systemInstructions);
    expect(JSON.stringify(metrics)).not.toContain(prompt.userMessage);
  });

  it('sends separated system/user content with structured output and normalizes the result', async () => {
    const { client, create } = fakeClientReturning({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
        status: 'RISK_IDENTIFIED',
        likelyOutcome: 'The build may fail.',
        pullRequestAId: '1',
        pullRequestAContribution: 'PR A changes the previous signature.',
        pullRequestARelevantEvidenceId: 'E1',
        pullRequestBId: '2',
        pullRequestBContribution: 'PR B still relies on the previous signature.',
        pullRequestBRelevantEvidenceId: 'E2',
        combinedEffect: 'The combined call may not satisfy the updated contract.',
        reviewerAction: 'Verify every combined caller.',
        confidence: 'HIGH',
        severity: 'MEDIUM',
        couldBlockBuildTypeCheckOrDeployment: false,
        couldCauseSevereFinancialSecurityOrDataImpact: false,
        relationshipSummary: '',
        independenceReason: '',
        coverageLimitation: '',
        }),
      }],
    });
    const provider = new ClaudeRiskAnalysisProvider({
      model: 'test-model',
      maxTokens: 700,
      client,
    });

    await expect(provider.assess(prompt)).resolves.toEqual({
      status: 'RISK_IDENTIFIED',
      likelyOutcome: 'The build may fail.',
      pullRequestAContribution: 'PR A changes the previous signature.',
      pullRequestBContribution: 'PR B still relies on the previous signature.',
      combinedEffect: 'The combined call may not satisfy the updated contract.',
      relevantCode: {
        pullRequestA: [{ pullRequestId: '1', technicalTerm: 'processPayment', filePath: 'src/a.ts', startLine: 2 }],
        pullRequestB: [{ pullRequestId: '2', technicalTerm: 'processPayment', filePath: 'src/b.ts', startLine: 8 }],
      },
      reviewerAction: 'Verify every combined caller.',
      confidence: 'HIGH',
      severity: 'MEDIUM',
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        max_tokens: 700,
        system: prompt.systemInstructions,
        messages: [{ role: 'user', content: prompt.userMessage }],
        output_config: {
          format: expect.objectContaining({ type: 'json_schema' }),
        },
      }),
    );
  });

  it.each([
    ['refusal', 'REFUSAL'],
    ['max_tokens', 'INCOMPLETE_OUTPUT'],
    ['model_context_window_exceeded', 'INCOMPLETE_OUTPUT'],
  ] as const)('fails explicitly for stop reason %s', async (stopReason, failureReason) => {
    const { client, create } = fakeClientReturning({
      stop_reason: stopReason,
      content: [{ type: 'text', text: 'Provider-generated non-schema stop message' }],
    });
    const provider = new ClaudeRiskAnalysisProvider({ model: 'test-model', client });

    const assessment = provider.assess(prompt);
    await expect(assessment).rejects.toBeInstanceOf(ClaudeRiskAnalysisError);
    await expect(assessment).rejects.toMatchObject({ reason: failureReason });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 2048 }));
  });

  it('fails explicitly when the SDK returns no structured-output text block', async () => {
    const { client } = fakeClientReturning({
      stop_reason: 'end_turn',
      content: [],
    });
    const provider = new ClaudeRiskAnalysisProvider({ model: 'test-model', client });

    await expect(provider.assess(prompt)).rejects.toMatchObject({
      reason: 'INVALID_OUTPUT',
    });
  });

  it('wraps parsing or validation failures without exposing a raw provider payload', async () => {
    const metrics: unknown[] = [];
    const { client } = fakeClientReturning({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'malformed JSON body contents' }],
    });
    const provider = new ClaudeRiskAnalysisProvider({
      model: 'test-model',
      client,
      reportOperationalMetric: (metric) => metrics.push(metric),
    });

    await expect(provider.assess(prompt)).rejects.toMatchObject({
      reason: 'INVALID_OUTPUT',
      message: 'Claude structured output could not be parsed or validated',
    });
    expect(metrics).toEqual([expect.objectContaining({
      outcome: 'FAILED',
      failureReason: 'INVALID_OUTPUT',
      failureDetail: 'JSON_PARSE: structured-output text was not valid JSON',
    })]);
    expect(JSON.stringify(metrics)).not.toContain('malformed JSON body contents');
  });

  it('rejects missing model configuration before making a request', () => {
    const { client, create } = fakeClientReturning({});

    expect(() => new ClaudeRiskAnalysisProvider({ model: '   ', client })).toThrow(
      'Claude model configuration must not be empty',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid maxTokens configuration %s', (maxTokens) => {
    const { client, create } = fakeClientReturning({});

    expect(() => new ClaudeRiskAnalysisProvider({ model: 'test-model', maxTokens, client })).toThrow(
      'Claude maxTokens configuration must be a positive integer',
    );
    expect(create).not.toHaveBeenCalled();
  });
});

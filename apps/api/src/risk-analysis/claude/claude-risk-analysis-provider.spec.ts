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
  it('sends separated system/user content with structured output and normalizes the result', async () => {
    const { client, create } = fakeClientReturning({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
        status: 'RISK_IDENTIFIED',
        explanation: 'The caller may rely on the previous signature.',
        changedAssumption: 'The function now requires a currency.',
        confidence: 'HIGH',
        severity: 'MEDIUM',
        reviewerCheck: 'Verify every combined caller.',
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
      explanation: 'The caller may rely on the previous signature.',
      changedAssumption: 'The function now requires a currency.',
      confidence: 'HIGH',
      severity: 'MEDIUM',
      reviewerCheck: 'Verify every combined caller.',
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
    const { client } = fakeClientReturning({
      stop_reason: stopReason,
      content: [{ type: 'text', text: 'Provider-generated non-schema stop message' }],
    });
    const provider = new ClaudeRiskAnalysisProvider({ model: 'test-model', client });

    const assessment = provider.assess(prompt);
    await expect(assessment).rejects.toBeInstanceOf(ClaudeRiskAnalysisError);
    await expect(assessment).rejects.toMatchObject({ reason: failureReason });
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
    const { client } = fakeClientReturning({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'malformed JSON body contents' }],
    });
    const provider = new ClaudeRiskAnalysisProvider({ model: 'test-model', client });

    await expect(provider.assess(prompt)).rejects.toMatchObject({
      reason: 'INVALID_OUTPUT',
      message: 'Claude structured output could not be parsed or validated',
    });
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

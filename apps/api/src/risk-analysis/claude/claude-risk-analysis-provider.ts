/** Claude implementation of the provider-neutral RiskAnalysisProvider. */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { RiskResult } from '../../domain/risk-result.js';
import type {
  RiskAnalysisProvider,
  RiskAssessmentPrompt,
} from '../risk-analysis-provider.js';
import {
  claudeRiskResultSchema,
  normalizeClaudeRiskResult,
} from './claude-risk-result-schema.js';

export type ClaudeRiskAnalysisFailureReason =
  | 'REFUSAL'
  | 'INCOMPLETE_OUTPUT'
  | 'INVALID_OUTPUT';

export class ClaudeRiskAnalysisError extends Error {
  readonly reason: ClaudeRiskAnalysisFailureReason;

  constructor(reason: ClaudeRiskAnalysisFailureReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ClaudeRiskAnalysisError';
    this.reason = reason;
  }
}

export interface ClaudeRiskAnalysisProviderConfig {
  readonly model: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  /** Concrete test seam; production composition normally omits it. */
  readonly client?: Anthropic;
}

const DEFAULT_MAX_TOKENS = 1024;

export class ClaudeRiskAnalysisProvider implements RiskAnalysisProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: ClaudeRiskAnalysisProviderConfig) {
    const model = config.model.trim();
    if (model.length === 0) {
      throw new Error('Claude model configuration must not be empty');
    }
    if (
      config.maxTokens !== undefined &&
      (!Number.isInteger(config.maxTokens) || config.maxTokens <= 0)
    ) {
      throw new Error('Claude maxTokens configuration must be a positive integer');
    }

    this.model = model;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.client =
      config.client ??
      new Anthropic({
        apiKey: config.apiKey,
        // M4 performs one external request attempt per assessable Candidate Pair.
        // A retry framework is deliberately outside the MVP boundary.
        maxRetries: 0,
      });
  }

  async assess(prompt: RiskAssessmentPrompt): Promise<RiskResult> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: prompt.systemInstructions,
      messages: [{ role: 'user', content: prompt.userMessage }],
      output_config: {
        format: zodOutputFormat(claudeRiskResultSchema),
      },
    });

    if (message.stop_reason === 'refusal') {
      throw new ClaudeRiskAnalysisError(
        'REFUSAL',
        'Claude refused the Risk Assessment request',
      );
    }
    if (
      message.stop_reason === 'max_tokens' ||
      message.stop_reason === 'model_context_window_exceeded'
    ) {
      throw new ClaudeRiskAnalysisError(
        'INCOMPLETE_OUTPUT',
        'Claude Risk Assessment output was incomplete because a token or context limit was reached',
      );
    }
    const textBlocks = message.content.filter((block) => block.type === 'text');
    if (textBlocks.length !== 1) {
      throw new ClaudeRiskAnalysisError(
        'INVALID_OUTPUT',
        'Claude returned an unexpected structured-output content shape',
      );
    }

    try {
      const parsedJson: unknown = JSON.parse(textBlocks[0]!.text);
      return normalizeClaudeRiskResult(claudeRiskResultSchema.parse(parsedJson));
    } catch (error) {
      throw new ClaudeRiskAnalysisError(
        'INVALID_OUTPUT',
        'Claude structured output could not be parsed or validated',
        { cause: error },
      );
    }
  }
}

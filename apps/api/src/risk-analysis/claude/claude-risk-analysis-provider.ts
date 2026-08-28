/** Claude implementation of the provider-neutral RiskAnalysisProvider. */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { RiskResult } from '../../domain/risk-result.js';
import {
  elapsedMilliseconds,
  emitOperationalMetric,
  type OperationalMetricReporter,
} from '../../shared/operational-metrics.js';
import type {
  RiskAnalysisProvider,
  RiskAssessmentPrompt,
} from '../risk-analysis-provider.js';
import {
  providerFailureDetail,
  sanitizeProviderError,
} from '../provider-error-diagnostic.js';
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
  readonly requestId?: string;

  constructor(
    reason: ClaudeRiskAnalysisFailureReason,
    message: string,
    options?: ErrorOptions & { readonly requestId?: string },
  ) {
    super(message, options);
    this.name = 'ClaudeRiskAnalysisError';
    this.reason = reason;
    this.requestId = options?.requestId;
  }
}

export interface ClaudeRiskAnalysisProviderConfig {
  readonly model: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  /** Concrete test seam; production composition normally omits it. */
  readonly client?: Anthropic;
  /** Optional sanitized metrics sink; never receives prompt or response content. */
  readonly reportOperationalMetric?: OperationalMetricReporter;
}

const DEFAULT_MAX_TOKENS = 2048;

function invalidOutputFailureDetail(error: ClaudeRiskAnalysisError): string | undefined {
  if (error.reason !== 'INVALID_OUTPUT') {
    return undefined;
  }
  if (error.message === 'Claude returned an unexpected structured-output content shape') {
    return 'CONTENT_SHAPE: expected exactly one structured-output text block';
  }
  const cause = error.cause;
  if (cause instanceof SyntaxError) {
    return 'JSON_PARSE: structured-output text was not valid JSON';
  }
  if (cause instanceof Error && cause.name === 'ZodError') {
    const issues = (cause as Error & { readonly issues?: readonly { readonly path?: readonly PropertyKey[]; readonly code?: string }[] }).issues;
    const summary = issues?.slice(0, 4).map((issue) => `${issue.path?.join('.') || '(root)'}:${issue.code ?? 'invalid'}`).join(', ');
    return `SCHEMA_VALIDATION: ${summary || 'structured output did not match the declared schema'}`;
  }
  if (cause instanceof Error) {
    return `LOCAL_VALIDATION: ${cause.message.replace(/\s+/g, ' ').trim().slice(0, 300)}`;
  }
  return 'INVALID_OUTPUT: structured output could not be parsed or validated';
}

export class ClaudeRiskAnalysisProvider implements RiskAnalysisProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly reportOperationalMetric: OperationalMetricReporter | undefined;

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
    this.reportOperationalMetric = config.reportOperationalMetric;
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
    const startedAt = performance.now();
    let requestId: string | undefined;
    let stopReason: string | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let cacheCreationInputTokens: number | undefined;
    let cacheReadInputTokens: number | undefined;
    let providerResponseReceived = false;
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: prompt.systemInstructions,
        messages: [{ role: 'user', content: prompt.userMessage }],
        output_config: {
          format: zodOutputFormat(claudeRiskResultSchema),
        },
      });
      providerResponseReceived = true;
      requestId = message._request_id ?? undefined;
      stopReason = message.stop_reason ?? undefined;
      inputTokens = message.usage?.input_tokens;
      outputTokens = message.usage?.output_tokens;
      cacheCreationInputTokens = message.usage?.cache_creation_input_tokens ?? undefined;
      cacheReadInputTokens = message.usage?.cache_read_input_tokens ?? undefined;

      if (message.stop_reason === 'refusal') {
        throw new ClaudeRiskAnalysisError(
          'REFUSAL',
          'Claude refused the Risk Assessment request',
          { requestId },
        );
      }
      if (
        message.stop_reason === 'max_tokens' ||
        message.stop_reason === 'model_context_window_exceeded'
      ) {
        throw new ClaudeRiskAnalysisError(
          'INCOMPLETE_OUTPUT',
          'Claude Risk Assessment output was incomplete because a token or context limit was reached',
          { requestId },
        );
      }
      const textBlocks = message.content.filter((block) => block.type === 'text');
      if (textBlocks.length !== 1) {
        throw new ClaudeRiskAnalysisError(
          'INVALID_OUTPUT',
          'Claude returned an unexpected structured-output content shape',
          { requestId },
        );
      }

      const parsedJson: unknown = JSON.parse(textBlocks[0]!.text);
      const result = normalizeClaudeRiskResult(
        claudeRiskResultSchema.parse(parsedJson),
        prompt.evidenceReferences,
        prompt.pullRequestAId,
        prompt.pullRequestBId,
      );
      emitOperationalMetric(this.reportOperationalMetric, {
        event: 'ai_provider_request',
        provider: 'claude',
        pullRequestAId: prompt.pullRequestAId,
        pullRequestBId: prompt.pullRequestBId,
        model: this.model,
        maxTokens: this.maxTokens,
        durationMs: elapsedMilliseconds(startedAt),
        outcome: 'COMPLETED',
        ...(requestId !== undefined ? { requestId } : {}),
        ...(stopReason !== undefined ? { stopReason } : {}),
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(cacheCreationInputTokens !== undefined ? { cacheCreationInputTokens } : {}),
        ...(cacheReadInputTokens !== undefined ? { cacheReadInputTokens } : {}),
      });
      return result;
    } catch (error) {
      const reportedError =
        error instanceof ClaudeRiskAnalysisError
          ? error
          : providerResponseReceived
            ? new ClaudeRiskAnalysisError(
              'INVALID_OUTPUT',
              'Claude structured output could not be parsed or validated',
              { cause: error, requestId },
            )
            : error;
      const providerDiagnostic = sanitizeProviderError(reportedError);
      const failureDetail =
        reportedError instanceof ClaudeRiskAnalysisError
          ? invalidOutputFailureDetail(reportedError)
          : providerFailureDetail(providerDiagnostic);
      const metricRequestId = requestId ?? providerDiagnostic.requestId;
      emitOperationalMetric(this.reportOperationalMetric, {
        event: 'ai_provider_request',
        provider: 'claude',
        pullRequestAId: prompt.pullRequestAId,
        pullRequestBId: prompt.pullRequestBId,
        model: this.model,
        maxTokens: this.maxTokens,
        durationMs: elapsedMilliseconds(startedAt),
        outcome: 'FAILED',
        errorName: providerDiagnostic.errorName,
        ...(reportedError instanceof ClaudeRiskAnalysisError
          ? { failureReason: reportedError.reason }
          : { failureReason: providerDiagnostic.providerErrorType ?? providerDiagnostic.failureReason ?? providerDiagnostic.errorName }),
        ...(failureDetail !== undefined ? { failureDetail } : {}),
        ...(metricRequestId !== undefined ? { requestId: metricRequestId } : {}),
        ...(stopReason !== undefined ? { stopReason } : {}),
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(cacheCreationInputTokens !== undefined ? { cacheCreationInputTokens } : {}),
        ...(cacheReadInputTokens !== undefined ? { cacheReadInputTokens } : {}),
        ...(providerDiagnostic.httpStatus !== undefined ? { httpStatus: providerDiagnostic.httpStatus } : {}),
      });
      throw reportedError;
    }
  }
}

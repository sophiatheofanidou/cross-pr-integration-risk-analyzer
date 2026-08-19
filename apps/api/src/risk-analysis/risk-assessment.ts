/**
 * M4 orchestration for one AI Risk Assessment per assessable Candidate Pair.
 *
 * This module coordinates the sufficient-context check, bounded prompt,
 * provider call, validated Risk Result and pair-relevant warnings. It does not
 * retrieve pull requests, discover new candidates or compose the future HTTP
 * application workflow.
 */

import type { CandidateDiscoveryRun } from '../candidate-discovery/candidate-discovery.js';
import { retrieveContext, type ContextRetrievalBounds } from '../context-retrieval/context-retrieval.js';
import type { AnalysisWarning } from '../domain/analysis-warning.js';
import type { CandidatePair } from '../domain/candidate-pair.js';
import type { RiskResult } from '../domain/risk-result.js';
import type { RiskAnalysisProvider } from './risk-analysis-provider.js';
import { buildRiskAssessmentPrompt } from './risk-assessment-prompt.js';

export type CandidatePairAssessment =
  | {
      readonly kind: 'ASSESSED';
      readonly candidatePair: CandidatePair;
      readonly riskResult: RiskResult;
      readonly warnings: readonly AnalysisWarning[];
    }
  | {
      readonly kind: 'NOT_ASSESSED';
      readonly candidatePair: CandidatePair;
      readonly warnings: readonly [AnalysisWarning, ...AnalysisWarning[]];
    };

/**
 * Provider-neutral marker for a failure raised specifically while invoking
 * `RiskAnalysisProvider.assess`. Pair-relevant warnings are carried with the
 * failure so an application boundary may preserve them in a partial report.
 * Errors from Context Retrieval or prompt construction are deliberately not
 * wrapped and continue to propagate as unexpected internal failures.
 */
export class RiskAnalysisProviderInvocationError extends Error {
  readonly warnings: readonly AnalysisWarning[];

  constructor(warnings: readonly AnalysisWarning[], cause: unknown) {
    super('Risk analysis provider invocation failed', { cause });
    this.name = 'RiskAnalysisProviderInvocationError';
    this.warnings = warnings;
  }
}

/**
 * Assesses one Candidate Pair: checks Context Retrieval sufficiency, and,
 * only when sufficient, calls the provider exactly once. Does not catch a
 * provider failure; callers that need to continue past a per-pair failure
 * (the M5 application orchestration boundary) catch it themselves around
 * this call.
 */
export async function assessCandidatePair(
  candidatePair: CandidatePair,
  run: CandidateDiscoveryRun,
  provider: RiskAnalysisProvider,
  bounds?: ContextRetrievalBounds,
): Promise<CandidatePairAssessment> {
  const contextOutcome = retrieveContext(candidatePair, run, bounds);
  if (!contextOutcome.sufficientContext) {
    return {
      kind: 'NOT_ASSESSED',
      candidatePair,
      warnings: contextOutcome.warnings,
    };
  }

  const prompt = buildRiskAssessmentPrompt(contextOutcome.context);
  let riskResult: RiskResult;
  try {
    riskResult = await provider.assess(prompt);
  } catch (error) {
    throw new RiskAnalysisProviderInvocationError(contextOutcome.context.warnings, error);
  }
  return {
    kind: 'ASSESSED',
    candidatePair,
    riskResult,
    warnings: contextOutcome.context.warnings,
  };
}

/**
 * Assesses Candidate Pairs in their deterministic discovery order. The
 * provider is called exactly once for each pair whose Context Retrieval result
 * is sufficient, and never for an insufficient pair. A provider failure rejects
 * the run explicitly; partial provider-failure results and continuation policy
 * belong to the M5 application orchestration boundary
 * (see `assessCandidatePair`, which that boundary calls per pair instead).
 */
export async function assessCandidatePairs(
  run: CandidateDiscoveryRun,
  provider: RiskAnalysisProvider,
  bounds?: ContextRetrievalBounds,
): Promise<readonly CandidatePairAssessment[]> {
  const assessments: CandidatePairAssessment[] = [];

  for (const candidatePair of run.result.candidatePairs) {
    assessments.push(await assessCandidatePair(candidatePair, run, provider, bounds));
  }

  return assessments;
}

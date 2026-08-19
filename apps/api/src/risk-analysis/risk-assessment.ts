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
 * Assesses Candidate Pairs in their deterministic discovery order. The
 * provider is called exactly once for each pair whose Context Retrieval result
 * is sufficient, and never for an insufficient pair. A provider failure rejects
 * the run explicitly; partial provider-failure results and continuation policy
 * belong to the future application orchestration boundary.
 */
export async function assessCandidatePairs(
  run: CandidateDiscoveryRun,
  provider: RiskAnalysisProvider,
  bounds?: ContextRetrievalBounds,
): Promise<readonly CandidatePairAssessment[]> {
  const assessments: CandidatePairAssessment[] = [];

  for (const candidatePair of run.result.candidatePairs) {
    const contextOutcome = retrieveContext(candidatePair, run, bounds);
    if (!contextOutcome.sufficientContext) {
      assessments.push({
        kind: 'NOT_ASSESSED',
        candidatePair,
        warnings: contextOutcome.warnings,
      });
      continue;
    }

    const riskResult = await provider.assess(buildRiskAssessmentPrompt(contextOutcome.context));
    assessments.push({
      kind: 'ASSESSED',
      candidatePair,
      riskResult,
      warnings: contextOutcome.context.warnings,
    });
  }

  return assessments;
}

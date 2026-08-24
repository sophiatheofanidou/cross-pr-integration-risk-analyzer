/** Adapter-local validation for Claude structured output. */

import { z } from 'zod';
import type { RiskResult } from '../../domain/risk-result.js';
import {
  COMBINED_EFFECT_MAX_LENGTH,
  LIKELY_OUTCOME_MAX_LENGTH,
  NO_RISK_SECTION_MAX_LENGTH,
  PULL_REQUEST_CONTRIBUTION_MAX_LENGTH,
  REVIEWER_ACTION_MAX_LENGTH,
} from '../../domain/risk-result.js';
import type { RiskEvidenceReference } from '../risk-analysis-provider.js';

export {
  COMBINED_EFFECT_MAX_LENGTH,
  LIKELY_OUTCOME_MAX_LENGTH,
  NO_RISK_SECTION_MAX_LENGTH,
  PULL_REQUEST_CONTRIBUTION_MAX_LENGTH,
  REVIEWER_ACTION_MAX_LENGTH,
} from '../../domain/risk-result.js';

const conditionalText = (maxLength: number) => z.string().trim().max(maxLength);
const confidenceSchema = z
  .enum(['LOW', 'MEDIUM', 'HIGH'])
  .describe('Evidential support for the assessment, not potential impact');
const severitySchema = z
  .enum(['LOW', 'MEDIUM', 'HIGH'])
  .describe('Potential impact if the identified risk is real');

// Keep one flat object instead of a top-level union. Anthropic compiles strict
// JSON schemas into grammars and can reject otherwise valid, more complex
// unions with HTTP 400. Irrelevant branch fields are required as empty strings;
// local validation below still enforces the correct fields for each status.
export const claudeRiskResultSchema = z
  .object({
    status: z.enum(['RISK_IDENTIFIED', 'NO_RISK_IDENTIFIED']),
    likelyOutcome: conditionalText(LIKELY_OUTCOME_MAX_LENGTH).describe(
        'A short, concrete, plain-language reviewer-visible outcome if both pull requests are merged',
      ),
    pullRequestAId: conditionalText(80).describe(
        'The exact supplied pull-request ID described by pullRequestAContribution',
      ),
    pullRequestAContribution: conditionalText(PULL_REQUEST_CONTRIBUTION_MAX_LENGTH).describe(
        'One or two concise sentences describing only the change or assumption associated with pullRequestAId',
      ),
    pullRequestARelevantEvidenceId: conditionalText(40).describe(
        'The single supplied deterministic evidence ID most useful for reviewing pullRequestAContribution',
      ),
    pullRequestBId: conditionalText(80).describe(
        'The exact supplied pull-request ID described by pullRequestBContribution',
      ),
    pullRequestBContribution: conditionalText(PULL_REQUEST_CONTRIBUTION_MAX_LENGTH).describe(
        'One or two concise sentences describing only the change or assumption associated with pullRequestBId',
      ),
    pullRequestBRelevantEvidenceId: conditionalText(40).describe(
        'The single supplied deterministic evidence ID most useful for reviewing pullRequestBContribution',
      ),
    combinedEffect: conditionalText(COMBINED_EFFECT_MAX_LENGTH).describe(
        'One or two concise sentences explaining why the two changes may become incompatible and what happens when combined',
      ),
    reviewerAction: conditionalText(REVIEWER_ACTION_MAX_LENGTH).describe(
        'One concrete imperative review step, naming the relevant supplied file, symbol or data flow when the evidence supports it',
      ),
    confidence: confidenceSchema,
    severity: severitySchema,
    couldBlockBuildTypeCheckOrDeployment: z.boolean().describe(
        'Whether the combined risk could block a repository build, type-check, or deployment',
      ),
    couldCauseSevereFinancialSecurityOrDataImpact: z.boolean().describe(
        'Whether the combined risk could cause severe financial, security, or data-integrity impact',
      ),
    relationshipSummary: conditionalText(NO_RISK_SECTION_MAX_LENGTH).describe(
        'A concise reviewer-facing explanation of why the deterministic matcher selected this pair',
      ),
    independenceReason: conditionalText(NO_RISK_SECTION_MAX_LENGTH).describe(
        'A concise reviewer-facing explanation of why the supplied relationship appears independent, compatible, or coincidental',
      ),
    coverageLimitation: conditionalText(NO_RISK_SECTION_MAX_LENGTH).describe(
        'A material bounded-context or coverage limitation, or an empty string when none was supplied',
      ),
  })
  .strict();

function assertBranchContent(output: z.infer<typeof claudeRiskResultSchema>): void {
  const requiredForRisk = [
    'likelyOutcome',
    'pullRequestAId',
    'pullRequestAContribution',
    'pullRequestARelevantEvidenceId',
    'pullRequestBId',
    'pullRequestBContribution',
    'pullRequestBRelevantEvidenceId',
    'combinedEffect',
    'reviewerAction',
  ] as const;
  const requiredForNoRisk = ['relationshipSummary', 'independenceReason'] as const;
  const requiredFields =
    output.status === 'RISK_IDENTIFIED' ? requiredForRisk : requiredForNoRisk;
  for (const field of requiredFields) {
    if (output[field].length === 0) {
      throw new Error(`${field} must not be empty for ${output.status}`);
    }
  }
  const fieldsThatMustBeEmpty =
    output.status === 'RISK_IDENTIFIED'
      ? (['relationshipSummary', 'independenceReason', 'coverageLimitation'] as const)
      : ([
          'likelyOutcome',
          'pullRequestAId',
          'pullRequestAContribution',
          'pullRequestARelevantEvidenceId',
          'pullRequestBId',
          'pullRequestBContribution',
          'pullRequestBRelevantEvidenceId',
          'combinedEffect',
          'reviewerAction',
        ] as const);
  for (const field of fieldsThatMustBeEmpty) {
    if (output[field].length > 0) {
      throw new Error(`${field} must be empty for ${output.status}`);
    }
  }

  if (
    output.status === 'NO_RISK_IDENTIFIED' &&
    (output.severity !== 'LOW' ||
      output.couldBlockBuildTypeCheckOrDeployment ||
      output.couldCauseSevereFinancialSecurityOrDataImpact)
  ) {
    throw new Error('No-risk output must use neutral impact fields');
  }
}

export function normalizeClaudeRiskResult(
  output: z.infer<typeof claudeRiskResultSchema>,
  evidenceReferences: readonly RiskEvidenceReference[],
  pullRequestAId: string,
  pullRequestBId: string,
): RiskResult {
  assertBranchContent(output);
  if (output.status === 'RISK_IDENTIFIED') {
    const contributions = [
      {
        pullRequestId: output.pullRequestAId,
        contribution: output.pullRequestAContribution,
        relevantEvidenceId: output.pullRequestARelevantEvidenceId,
      },
      {
        pullRequestId: output.pullRequestBId,
        contribution: output.pullRequestBContribution,
        relevantEvidenceId: output.pullRequestBRelevantEvidenceId,
      },
    ];
    const contributionFor = (pullRequestId: string) => {
      const matching = contributions.filter(
        (contribution) => contribution.pullRequestId === pullRequestId,
      );
      if (matching.length !== 1) {
        throw new Error(`Claude output must contain exactly one contribution for pull request ${pullRequestId}`);
      }
      return matching[0]!;
    };
    const pullRequestAContribution = contributionFor(pullRequestAId);
    const pullRequestBContribution = contributionFor(pullRequestBId);
    const evidenceById = new Map(evidenceReferences.map((reference) => [reference.id, reference]));
    const resolveReference = (
      selectedId: string,
      companionSelectedId: string,
      expectedPullRequestId: string,
    ): RiskEvidenceReference => {
      const selected = evidenceById.get(selectedId);
      if (selected?.location.pullRequestId === expectedPullRequestId) {
        return selected;
      }

      const companion = evidenceById.get(companionSelectedId);
      const preferredTerms = [selected?.technicalTerm, companion?.technicalTerm].filter(
        (technicalTerm): technicalTerm is string => technicalTerm !== undefined,
      );
      for (const technicalTerm of preferredTerms) {
        const repaired = evidenceReferences.find(
          (reference) =>
            reference.location.pullRequestId === expectedPullRequestId &&
            reference.technicalTerm === technicalTerm,
        );
        if (repaired !== undefined) {
          return repaired;
        }
      }

      const fallback = evidenceReferences.find(
        (reference) => reference.location.pullRequestId === expectedPullRequestId,
      );
      if (fallback === undefined) {
        throw new Error(`No deterministic evidence exists for pull request ${expectedPullRequestId}`);
      }
      return fallback;
    };
    const toLocation = (reference: RiskEvidenceReference) => {
      return {
        pullRequestId: reference.location.pullRequestId,
        technicalTerm: reference.technicalTerm,
        filePath: reference.location.filePath,
        startLine: reference.location.range.start.line,
      };
    };

    const pullRequestAReference = resolveReference(
      pullRequestAContribution.relevantEvidenceId,
      pullRequestBContribution.relevantEvidenceId,
      pullRequestAId,
    );
    const pullRequestBReference = resolveReference(
      pullRequestBContribution.relevantEvidenceId,
      pullRequestAContribution.relevantEvidenceId,
      pullRequestBId,
    );

    return {
      status: output.status,
      likelyOutcome: output.likelyOutcome,
      pullRequestAContribution: pullRequestAContribution.contribution,
      pullRequestBContribution: pullRequestBContribution.contribution,
      combinedEffect: output.combinedEffect,
      relevantCode: {
        pullRequestA: [toLocation(pullRequestAReference)],
        pullRequestB: [toLocation(pullRequestBReference)],
      },
      reviewerAction: output.reviewerAction,
      confidence: output.confidence,
      severity:
        output.couldBlockBuildTypeCheckOrDeployment ||
        output.couldCauseSevereFinancialSecurityOrDataImpact
          ? 'HIGH'
          : output.severity,
    };
  }

  return {
    status: output.status,
    relationshipSummary: output.relationshipSummary,
    independenceReason: output.independenceReason,
    ...(output.coverageLimitation.length === 0
      ? {}
      : { coverageLimitation: output.coverageLimitation }),
    confidence: output.confidence,
  };
}

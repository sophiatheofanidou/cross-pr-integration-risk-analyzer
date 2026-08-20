import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import type {
  CandidatePairReport,
  RiskConfidence,
  RiskSeverity,
  TechnicalTermMatch,
} from '../analysis-report.dto';

const POTENTIAL_INTEGRATION_PROBLEM_COLLAPSE_THRESHOLD = 500;

let nextInstanceId = 0;

/** RISK_IDENTIFIED / NOT_RUN / NO_RISK_IDENTIFIED presentation for one Candidate Pair. */
type PairVariant = 'risk' | 'pending' | 'safe';

@Component({
  selector: 'app-candidate-pair-result',
  imports: [NgTemplateOutlet],
  templateUrl: './candidate-pair-result.html',
  styleUrl: './candidate-pair-result.css',
})
export class CandidatePairResult {
  readonly pair = input.required<CandidatePairReport>();

  private readonly instanceId = `candidate-pair-${nextInstanceId++}`;
  protected readonly problemTextId = `${this.instanceId}-problem`;
  protected readonly safeDetailsId = `${this.instanceId}-safe-details`;

  protected readonly explanationExpanded = signal(false);
  protected readonly safeDetailsExpanded = signal(false);

  protected readonly variant = computed<PairVariant>(() => {
    const assessment = this.pair().assessment;
    if (assessment.state === 'NOT_RUN') {
      return 'pending';
    }
    return assessment.result.status === 'RISK_IDENTIFIED' ? 'risk' : 'safe';
  });

  protected readonly isLongExplanation = computed(() => {
    const assessment = this.pair().assessment;
    if (assessment.state !== 'COMPLETED' || assessment.result.status !== 'RISK_IDENTIFIED') {
      return false;
    }
    return assessment.result.potentialIntegrationProblem.length > POTENTIAL_INTEGRATION_PROBLEM_COLLAPSE_THRESHOLD;
  });

  protected toggleExplanation(): void {
    this.explanationExpanded.update((expanded) => !expanded);
  }

  protected toggleSafeDetails(): void {
    this.safeDetailsExpanded.update((expanded) => !expanded);
  }

  protected notRunHeading(reason: 'INSUFFICIENT_CONTEXT' | 'PROVIDER_FAILURE'): string {
    return reason === 'INSUFFICIENT_CONTEXT'
      ? 'Insufficient context for an assessment'
      : 'The assessment provider could not complete';
  }

  protected severityClass(severity: RiskSeverity): string {
    return `severity-${severity.toLowerCase()}`;
  }

  protected confidenceClass(confidence: RiskConfidence): string {
    return `confidence-${confidence.toLowerCase()}`;
  }

  protected titleCase(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  protected matchLocationLabel(match: TechnicalTermMatch): {
    changedPullRequestId: string;
    changedFilePath: string;
    changedStartLine: number;
    matchingPullRequestId: string;
    matchingFilePath: string;
    matchingStartLine: number;
  } {
    return {
      changedPullRequestId: match.changedRegionLocation.pullRequestId,
      changedFilePath: match.changedRegionLocation.filePath,
      changedStartLine: match.changedRegionLocation.range.start.line,
      matchingPullRequestId: match.matchingOccurrenceLocation.pullRequestId,
      matchingFilePath: match.matchingOccurrenceLocation.filePath,
      matchingStartLine: match.matchingOccurrenceLocation.range.start.line,
    };
  }
}

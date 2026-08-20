import { Component, computed, input } from '@angular/core';
import { AnalysisInventory } from '../analysis-inventory/analysis-inventory';
import type { AnalysisReport as AnalysisReportDto, CandidatePairReport } from '../analysis-report.dto';
import { CandidatePairResult } from '../candidate-pair-result/candidate-pair-result';

@Component({
  selector: 'app-analysis-report',
  imports: [CandidatePairResult, AnalysisInventory],
  templateUrl: './analysis-report.html',
  styleUrl: './analysis-report.css',
})
export class AnalysisReport {
  readonly report = input.required<AnalysisReportDto>();

  protected readonly statusText = computed(() =>
    this.report().status === 'COMPLETED_WITH_WARNINGS' ? 'Completed with warnings' : 'Completed',
  );

  /** RISK_IDENTIFIED first, then NOT_RUN, then NO_RISK_IDENTIFIED; backend order preserved within each group. */
  protected readonly orderedCandidatePairs = computed<readonly CandidatePairReport[]>(() => {
    const pairs = this.report().candidatePairs;
    const risk: CandidatePairReport[] = [];
    const notRun: CandidatePairReport[] = [];
    const noRisk: CandidatePairReport[] = [];
    for (const pair of pairs) {
      if (pair.assessment.state === 'NOT_RUN') {
        notRun.push(pair);
      } else if (pair.assessment.result.status === 'RISK_IDENTIFIED') {
        risk.push(pair);
      } else {
        noRisk.push(pair);
      }
    }
    return [...risk, ...notRun, ...noRisk];
  });

  protected readonly emptyResultsExplanation = computed(() => {
    const summary = this.report().summary;
    const eligible = `${summary.eligiblePullRequestCount} eligible pull request${summary.eligiblePullRequestCount === 1 ? '' : 's'}`;
    const pairs = `${summary.possiblePairCount} possible pair${summary.possiblePairCount === 1 ? '' : 's'}`;
    return `${eligible} produced ${pairs}, but no Technical Term Matches were found.`;
  });

  protected pairTrackBy(_index: number, pair: CandidatePairReport): string {
    return `${pair.pullRequestA.id}-${pair.pullRequestB.id}`;
  }
}

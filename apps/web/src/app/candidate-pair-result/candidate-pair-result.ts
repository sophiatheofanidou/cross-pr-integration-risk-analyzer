import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import type {
  CandidatePairReport,
  RiskConfidence,
  RiskSeverity,
  TechnicalTermMatch,
} from '../analysis-report.dto';

let nextInstanceId = 0;

/** RISK_IDENTIFIED / NOT_RUN / NO_RISK_IDENTIFIED presentation for one Candidate Pair. */
type PairVariant = 'risk' | 'pending' | 'safe';

interface EvidenceFile {
  readonly filePath: string;
  readonly lines: readonly number[];
}

interface EvidenceSide {
  readonly pullRequestId: string;
  readonly files: readonly EvidenceFile[];
}

interface EvidenceGroup {
  readonly technicalTerm: string;
  readonly pullRequestA: EvidenceSide;
  readonly pullRequestB: EvidenceSide;
}

@Component({
  selector: 'app-candidate-pair-result',
  imports: [NgTemplateOutlet],
  templateUrl: './candidate-pair-result.html',
  styleUrl: './candidate-pair-result.css',
})
export class CandidatePairResult {
  readonly pair = input.required<CandidatePairReport>();

  private readonly instanceId = `candidate-pair-${nextInstanceId++}`;
  protected readonly safeDetailsId = `${this.instanceId}-safe-details`;

  protected readonly safeDetailsExpanded = signal(false);

  protected readonly evidenceGroups = computed<readonly EvidenceGroup[]>(() => {
    const groups = new Map<
      string,
      Map<string, Map<string, Set<number>>>
    >();

    for (const match of this.pair().technicalTermMatches) {
      let group = groups.get(match.technicalTerm);
      if (group === undefined) {
        group = new Map<string, Map<string, Set<number>>>();
        groups.set(match.technicalTerm, group);
      }

      this.addEvidenceLocation(group, match.changedRegionLocation);
      this.addEvidenceLocation(group, match.matchingOccurrenceLocation);
    }

    const pullRequestAId = this.pair().pullRequestA.id;
    const pullRequestBId = this.pair().pullRequestB.id;
    return [...groups.entries()].map(([technicalTerm, group]) => ({
      technicalTerm,
      pullRequestA: this.toEvidenceSide(pullRequestAId, group.get(pullRequestAId)),
      pullRequestB: this.toEvidenceSide(pullRequestBId, group.get(pullRequestBId)),
    }));
  });

  protected readonly riskSupportingTerms = computed<ReadonlySet<string>>(() => {
    const assessment = this.pair().assessment;
    if (assessment.state !== 'COMPLETED' || assessment.result.status !== 'RISK_IDENTIFIED') {
      return new Set<string>();
    }

    const locations = [
      ...assessment.result.relevantCode.pullRequestA,
      ...assessment.result.relevantCode.pullRequestB,
    ];
    return new Set(locations.map((location) => location.technicalTerm));
  });

  protected readonly variant = computed<PairVariant>(() => {
    const assessment = this.pair().assessment;
    if (assessment.state === 'NOT_RUN') {
      return 'pending';
    }
    return assessment.result.status === 'RISK_IDENTIFIED' ? 'risk' : 'safe';
  });

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

  protected termTooltipId(technicalTerm: string): string {
    return `${this.instanceId}-${technicalTerm.replace(/[^a-zA-Z0-9_-]/g, '-')}-risk-tooltip`;
  }

  private addEvidenceLocation(
    group: Map<string, Map<string, Set<number>>>,
    location: TechnicalTermMatch['changedRegionLocation'],
  ): void {
    let files = group.get(location.pullRequestId);
    if (files === undefined) {
      files = new Map<string, Set<number>>();
      group.set(location.pullRequestId, files);
    }
    let lines = files.get(location.filePath);
    if (lines === undefined) {
      lines = new Set<number>();
      files.set(location.filePath, lines);
    }
    lines.add(location.range.start.line);
  }

  private toEvidenceSide(
    pullRequestId: string,
    files: Map<string, Set<number>> | undefined,
  ): EvidenceSide {
    return {
      pullRequestId,
      files: [...(files ?? new Map<string, Set<number>>()).entries()].map(([filePath, lines]) => ({
        filePath,
        lines: [...lines].sort((left, right) => left - right),
      })),
    };
  }
}

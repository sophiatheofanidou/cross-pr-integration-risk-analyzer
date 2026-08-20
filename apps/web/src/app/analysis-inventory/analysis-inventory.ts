import { Component, ElementRef, ViewChild, computed, input, signal } from '@angular/core';
import type {
  AnalysisWarning,
  CandidatePairReport,
  EligiblePullRequest,
} from '../analysis-report.dto';

type InventoryTab = 'pairs' | 'pull-requests';

const TAB_ORDER: readonly InventoryTab[] = ['pairs', 'pull-requests'];

interface PairCoverage {
  readonly label: string;
  readonly detail?: string;
}

@Component({
  selector: 'app-analysis-inventory',
  templateUrl: './analysis-inventory.html',
  styleUrl: './analysis-inventory.css',
})
export class AnalysisInventory {
  readonly candidatePairs = input.required<readonly CandidatePairReport[]>();
  readonly eligiblePullRequests = input.required<readonly EligiblePullRequest[]>();
  readonly warnings = input.required<readonly AnalysisWarning[]>();

  @ViewChild('pairsTabButton') private readonly pairsTabButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('pullRequestsTabButton') private readonly pullRequestsTabButton?: ElementRef<HTMLButtonElement>;

  protected readonly activeTab = signal<InventoryTab>('pairs');

  protected readonly pairsTabId = 'analysis-inventory-pairs-tab';
  protected readonly pullRequestsTabId = 'analysis-inventory-pull-requests-tab';
  protected readonly pairsPanelId = 'analysis-inventory-pairs-panel';
  protected readonly pullRequestsPanelId = 'analysis-inventory-pull-requests-panel';

  protected readonly assessedPairs = computed(() =>
    this.candidatePairs().map((pair) => ({ pair, coverage: this.coverageFor(pair) })),
  );

  protected selectTab(tab: InventoryTab): void {
    this.activeTab.set(tab);
  }

  protected onTabKeydown(event: KeyboardEvent, currentTab: InventoryTab): void {
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    let nextIndex = currentIndex;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % TAB_ORDER.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = TAB_ORDER[nextIndex];
    this.activeTab.set(nextTab);
    this.focusTab(nextTab);
  }

  private focusTab(tab: InventoryTab): void {
    const target = tab === 'pairs' ? this.pairsTabButton : this.pullRequestsTabButton;
    target?.nativeElement.focus();
  }

  protected assessmentLabel(pair: CandidatePairReport): string {
    return pair.assessment.state === 'COMPLETED' ? 'Completed' : 'Not run';
  }

  /** Every distinct technical term, in backend first-appearance order; duplicates collapsed. */
  protected distinctTerms(pair: CandidatePairReport): readonly string[] {
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const match of pair.technicalTermMatches) {
      if (!seen.has(match.technicalTerm)) {
        seen.add(match.technicalTerm);
        terms.push(match.technicalTerm);
      }
    }
    return terms;
  }

  protected rowStateClass(pair: CandidatePairReport): 'row-risk' | 'row-pending' | 'row-safe' {
    if (pair.assessment.state === 'NOT_RUN') {
      return 'row-pending';
    }
    return pair.assessment.result.status === 'RISK_IDENTIFIED' ? 'row-risk' : 'row-safe';
  }

  protected resultSummary(pair: CandidatePairReport): { status: string; detail?: string } | undefined {
    if (pair.assessment.state !== 'COMPLETED') {
      return undefined;
    }
    const result = pair.assessment.result;
    if (result.status === 'RISK_IDENTIFIED') {
      return {
        status: 'Risk identified',
        detail: `Severity: ${this.titleCase(result.severity)} · Confidence: ${this.titleCase(result.confidence)}`,
      };
    }
    return { status: 'No risk identified' };
  }

  private titleCase(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  private coverageFor(pair: CandidatePairReport): PairCoverage {
    if (pair.assessment.state === 'NOT_RUN') {
      return {
        label: pair.assessment.reason === 'INSUFFICIENT_CONTEXT' ? 'Insufficient context' : 'Provider failure',
      };
    }

    const pairIds = new Set([pair.pullRequestA.id, pair.pullRequestB.id]);
    const relevantWarnings = this.warnings().filter((warning) => {
      if (warning.relatedPullRequestId !== undefined) {
        return pairIds.has(warning.pullRequestId) && pairIds.has(warning.relatedPullRequestId);
      }
      return pairIds.has(warning.pullRequestId);
    });

    if (relevantWarnings.length === 0) {
      return { label: 'Complete' };
    }
    return {
      label: 'Limited',
      detail: `${relevantWarnings.length} ${relevantWarnings.length === 1 ? 'warning' : 'warnings'}`,
    };
  }
}

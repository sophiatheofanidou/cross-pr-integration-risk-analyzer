import type { RiskResult } from '../../domain/risk-result.js';
import type {
  RiskAnalysisProvider,
  RiskAssessmentPrompt,
} from '../risk-analysis-provider.js';

/** Minimal queued fake: records calls and never contacts an external model. */
export class FakeRiskAnalysisProvider implements RiskAnalysisProvider {
  readonly calls: RiskAssessmentPrompt[] = [];
  private readonly outcomes: (RiskResult | Error)[];

  constructor(outcomes: readonly (RiskResult | Error)[]) {
    this.outcomes = [...outcomes];
  }

  async assess(prompt: RiskAssessmentPrompt): Promise<RiskResult> {
    this.calls.push(prompt);
    const outcome = this.outcomes.shift();
    if (outcome === undefined) {
      throw new Error('FakeRiskAnalysisProvider has no queued outcome');
    }
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  }
}

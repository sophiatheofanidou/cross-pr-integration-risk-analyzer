import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  combineOperationalMetricReporters,
  createConsoleOperationalMetricReporter,
  createHtmlOperationalMetricReporter,
  ensureHtmlOperationalMetricsReport,
  emitOperationalMetric,
  withOperationalMetricContext,
  type OperationalMetricReporter,
} from './operational-metrics.js';

const completedRun = {
  event: 'analysis_run' as const,
  outcome: 'COMPLETED' as const,
  durationMs: 48_000,
  eligiblePullRequestRetrievalMs: 11_000,
  candidateDiscoveryMs: 3_000,
  assessmentWallMs: 34_000,
  eligiblePullRequestCount: 8,
  possiblePairCount: 28,
  candidatePairCount: 4,
  assessedPairCount: 4,
  riskIdentifiedCount: 3,
  noRiskIdentifiedCount: 1,
  notAssessedCount: 0,
  warningCount: 1,
};

function reportOneClaudeCall(reporter: OperationalMetricReporter, model = 'test-model'): void {
  reporter({
    event: 'ai_provider_request',
    provider: 'claude',
    pullRequestAId: '1',
    pullRequestBId: '2',
    model,
    maxTokens: 2048,
    durationMs: 8_500,
    outcome: 'COMPLETED',
    inputTokens: 1_200,
    outputTokens: 300,
    requestId: 'req_test',
  });
}

describe('operational metrics', () => {
  it('prints one concise summary only when the run finishes', async () => {
    const summaries: string[] = [];
    const reporter = createConsoleOperationalMetricReporter(
      (summary) => summaries.push(summary),
      'runtime/metrics/analysis-report.html',
    );

    await withOperationalMetricContext(async () => {
      reporter({ event: 'github_request', operation: 'listPullRequests', durationMs: 500, outcome: 'COMPLETED', httpStatus: 200 });
      reportOneClaudeCall(reporter);
      expect(summaries).toEqual([]);
      reporter(completedRun);
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain('Total: 48.00s');
    expect(summaries[0]).toContain('Eligible Pull Request Retrieval: 11.00s');
    expect(summaries[0]).toContain('Candidate Discovery: 3.00s');
    expect(summaries[0]).toContain('AI Risk Assessment: 34.00s');
    expect(summaries[0]).toContain('AI calls: 1');
    expect(summaries[0]).toContain('PR 1 + PR 2: 8.50s (COMPLETED)');
    expect(summaries[0]).toContain('Failures: 0');
    expect(summaries[0]).not.toContain('Results:');
    expect(summaries[0]).toContain('analysis-report.html');
    expect(summaries[0]).not.toContain('{"event"');
  });

  it('preserves earlier runs in one readable HTML report', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-metrics-'));
    try {
      const reporter = createHtmlOperationalMetricReporter({ directory });
      await withOperationalMetricContext(async () => {
        reportOneClaudeCall(reporter);
        reporter(completedRun);
      });
      await withOperationalMetricContext(async () => {
        reportOneClaudeCall(reporter);
        reporter({ ...completedRun, durationMs: 35_000 });
      });

      const html = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect(html).toContain('Analysis Performance Report');
      expect(html).toContain('Run Comparison');
      expect(html).toContain('Eligible Pull Request<br>Retrieval');
      expect(html).toContain('Candidate<br>Discovery');
      expect(html).toContain('AI Risk<br>Assessment');
      expect(html).toContain('<th>Failures</th><th>Est. AI cost</th>');
      expect(html).toContain('class="comparison-table"');
      expect(html).toContain('PR 1 + PR 2');
      expect(html).not.toContain('<th>Risks</th>');
      expect(html).not.toContain('<th>No risk</th>');
      expect(html).not.toContain('<th>Warnings</th>');
      expect((html.match(/<details>/g) ?? [])).toHaveLength(2);
      expect((html.match(/35\.00s/g) ?? []).length).toBeGreaterThan(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('shows estimated Claude Sonnet 5 cost per call and per run', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-cost-'));
    try {
      const reporter = createHtmlOperationalMetricReporter({ directory });
      await withOperationalMetricContext(async () => {
        reportOneClaudeCall(reporter, 'claude-sonnet-5');
        reporter(completedRun);
      });

      const html = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect(html).toContain('$2 / MTok');
      expect(html).toContain('$10 / MTok');
      expect(html).toContain('$0.0054');
      expect(html).toContain('Est. AI cost');
      expect(html).toContain('Est. cost');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('summarizes operational failures and keeps their details in the expandable tables', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-failure-counts-'));
    try {
      const reporter = createHtmlOperationalMetricReporter({ directory });
      await withOperationalMetricContext(async () => {
        reporter({ event: 'github_request', operation: 'compareCommits', durationMs: 400, outcome: 'NETWORK_FAILURE', errorName: 'TypeError' });
        reporter({ event: 'ai_provider_request', provider: 'claude', pullRequestAId: '1', pullRequestBId: '2', model: 'test-model', maxTokens: 2048, durationMs: 500, outcome: 'FAILED', failureReason: 'authentication_error', failureDetail: 'HTTP 401 · authentication_error · API key is invalid.', requestId: 'req_auth_failure', httpStatus: 401 });
        reporter(completedRun);
      });

      const html = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect(html).toContain('<th>Failures</th><th>Est. AI cost</th>');
      expect(html).toContain('compareCommits</td><td>1</td><td>0.40s</td><td>0.40s</td><td>1</td>');
      expect(html).toContain('HTTP 401 · authentication_error · API key is invalid.');
      expect(html).toContain('req_auth_failure');
      expect(html).toContain('"httpStatus":401');
      expect(html).toContain('<td class="number">2</td><td class="number"><strong>—</strong></td>');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('shows estimated Claude Opus 5 cost per call and per run', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-opus-cost-'));
    try {
      const reporter = createHtmlOperationalMetricReporter({ directory });
      await withOperationalMetricContext(async () => {
        reportOneClaudeCall(reporter, 'claude-opus-5');
        reporter(completedRun);
      });

      const html = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect(html).toContain('$5 / MTok');
      expect(html).toContain('$25 / MTok');
      expect(html).toContain('$0.0135');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('migrates the existing CSV baseline into the first HTML report', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-migration-'));
    try {
      writeFileSync(
        join(directory, 'analysis-runs.csv'),
        'started_at,analysis_run_id,outcome,model,total_ms,eligible_pr_retrieval_ms,candidate_discovery_ms,assessment_wall_ms,github_request_count,github_request_total_ms,github_network_failure_count,github_request_details,claude_call_details,input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens,eligible_pr_count,possible_pair_count,candidate_pair_count,assessed_pair_count,not_assessed_count,warning_count,error_name\n' +
        '2026-08-25T22:21:15.209Z,legacy-run,COMPLETED,test-model,48765.11,11245.12,2928.83,34590.7,36,14059.54,0,listPullRequests: 1 call(s) / 507.16ms,8+7: 15529.75ms (COMPLETED),22630,4278,0,0,8,28,4,4,0,1,\n',
        'utf8',
      );
      expect(ensureHtmlOperationalMetricsReport(directory)).toBe(join(directory, 'analysis-report.html'));

      const html = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect(html).toContain('legacy-run');
      expect(html).toContain('48.77s');
      expect((html.match(/<details>/g) ?? [])).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('can curate a one-time recent-run baseline without changing normal append behaviour', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-recent-baseline-'));
    try {
      const reporter = createHtmlOperationalMetricReporter({ directory });
      for (const durationMs of [10_000, 20_000, 30_000]) {
        await withOperationalMetricContext(async () => reporter({ ...completedRun, durationMs }));
      }

      expect(ensureHtmlOperationalMetricsReport(directory, 2)).toBe(join(directory, 'analysis-report.html'));
      const curatedHtml = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect((curatedHtml.match(/<details>/g) ?? [])).toHaveLength(2);
      expect(curatedHtml).not.toContain('10.00s');

      await withOperationalMetricContext(async () => reporter({ ...completedRun, durationMs: 40_000 }));
      const appendedHtml = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect((appendedHtml.match(/<details>/g) ?? [])).toHaveLength(3);
      expect(appendedHtml).toContain('40.00s');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('escapes HTML from provider-facing identifiers', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-escape-'));
    try {
      const reporter = createHtmlOperationalMetricReporter({ directory });
      await withOperationalMetricContext(async () => {
        reporter({
          event: 'ai_provider_request', provider: 'claude', pullRequestAId: '<script>',
          pullRequestBId: '2', model: '<unsafe>', maxTokens: 2048, durationMs: 1,
          outcome: 'FAILED', errorName: '<failure>', failureDetail: 'LOCAL_VALIDATION: <field>',
        });
        reporter(completedRun);
      });
      const html = readFileSync(join(directory, 'analysis-report.html'), 'utf8');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('LOCAL_VALIDATION: &lt;field&gt;');
      expect(html).toContain('\\u003cscript>');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('never lets a failing metrics sink change application behaviour', () => {
    expect(() => emitOperationalMetric(() => { throw new Error('sink failed'); }, {
      event: 'analysis_run', outcome: 'FAILED', durationMs: 1, errorName: 'TestError',
    })).not.toThrow();
  });

  it('reports an HTML sink failure once without exposing its raw message', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cross-pr-html-failure-'));
    try {
      const blocked = join(directory, 'blocked');
      writeFileSync(blocked, 'file', 'utf8');
      const failures: string[] = [];
      const reporter = createHtmlOperationalMetricReporter({ directory: blocked, reportFailure: (name) => failures.push(name) });
      await withOperationalMetricContext(async () => reporter(completedRun));
      await withOperationalMetricContext(async () => reporter(completedRun));
      expect(failures).toEqual([expect.any(String)]);
      expect(failures.join(' ')).not.toContain(blocked);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('continues to the remaining combined sink when another sink fails', () => {
    const received: unknown[] = [];
    const reporter = combineOperationalMetricReporters([() => { throw new Error('failed'); }, (metric) => received.push(metric)]);
    const metric = { event: 'analysis_run' as const, outcome: 'FAILED' as const, durationMs: 1, errorName: 'AnalysisError' };
    expect(() => reporter(metric)).not.toThrow();
    expect(received).toEqual([metric]);
  });
});

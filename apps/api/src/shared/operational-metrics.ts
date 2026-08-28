/** Sanitized, opt-in operational metrics and human-readable local reporting. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type OperationalMetric =
  | { readonly event: 'github_request'; readonly operation: string; readonly durationMs: number; readonly outcome: 'COMPLETED' | 'NETWORK_FAILURE'; readonly httpStatus?: number; readonly errorName?: string }
  | { readonly event: 'ai_provider_request'; readonly provider: 'claude'; readonly pullRequestAId: string; readonly pullRequestBId: string; readonly model: string; readonly maxTokens: number; readonly durationMs: number; readonly outcome: 'COMPLETED' | 'FAILED'; readonly requestId?: string; readonly stopReason?: string; readonly inputTokens?: number; readonly outputTokens?: number; readonly cacheCreationInputTokens?: number; readonly cacheReadInputTokens?: number; readonly failureReason?: string; readonly failureDetail?: string; readonly errorName?: string; readonly httpStatus?: number }
  | { readonly event: 'analysis_run'; readonly outcome: 'COMPLETED'; readonly durationMs: number; readonly eligiblePullRequestRetrievalMs: number; readonly candidateDiscoveryMs: number; readonly assessmentWallMs: number; readonly eligiblePullRequestCount: number; readonly possiblePairCount: number; readonly candidatePairCount: number; readonly assessedPairCount: number; readonly riskIdentifiedCount: number; readonly noRiskIdentifiedCount: number; readonly notAssessedCount: number; readonly warningCount: number }
  | { readonly event: 'analysis_run'; readonly outcome: 'FAILED'; readonly durationMs: number; readonly errorName: string };

export type OperationalMetricReporter = (metric: OperationalMetric) => void;

interface OperationalMetricContext { readonly analysisRunId: string; readonly startedAt: string }
interface GitHubOperationSummary { readonly operation: string; readonly calls: number; readonly totalMs: number; readonly averageMs: number; readonly failureCount: number }
interface StoredClaudeCall { readonly pullRequestAId: string; readonly pullRequestBId: string; readonly durationMs: number; readonly outcome: string; readonly inputTokens?: number; readonly outputTokens?: number; readonly requestId?: string; readonly failureReason?: string; readonly failureDetail?: string; readonly httpStatus?: number }
interface StoredAnalysisRun {
  readonly startedAt: string; readonly analysisRunId: string; readonly outcome: string; readonly model: string; readonly totalMs: number;
  readonly eligiblePullRequestRetrievalMs?: number; readonly candidateDiscoveryMs?: number; readonly assessmentWallMs?: number;
  readonly githubRequestCount: number; readonly githubRequestTotalMs: number; readonly githubNetworkFailureCount: number; readonly githubOperations: readonly GitHubOperationSummary[];
  readonly claudeCalls: readonly StoredClaudeCall[]; readonly inputTokens: number; readonly outputTokens: number; readonly cacheCreationInputTokens: number; readonly cacheReadInputTokens: number;
  readonly eligiblePullRequestCount?: number; readonly possiblePairCount?: number; readonly candidatePairCount?: number; readonly assessedPairCount?: number;
  readonly riskIdentifiedCount?: number; readonly noRiskIdentifiedCount?: number; readonly notAssessedCount?: number; readonly warningCount?: number; readonly errorName?: string;
}
interface RunAccumulator { readonly startedAt: string; readonly models: Set<string>; readonly githubRequests: Array<Extract<OperationalMetric, { readonly event: 'github_request' }>>; readonly claudeCalls: Array<Extract<OperationalMetric, { readonly event: 'ai_provider_request' }>> }

const metricContext = new AsyncLocalStorage<OperationalMetricContext>();

export function withOperationalMetricContext<T>(operation: () => Promise<T>): Promise<T> {
  return metricContext.run({ analysisRunId: randomUUID(), startedAt: new Date().toISOString() }, operation);
}

export function emitOperationalMetric(reporter: OperationalMetricReporter | undefined, metric: OperationalMetric): void {
  try { reporter?.(metric); } catch { /* Observability must never fail analysis. */ }
}

function rounded(value: number): number { return Math.round(value * 100) / 100; }
function sum(values: readonly number[]): number { return rounded(values.reduce((total, value) => total + value, 0)); }
function seconds(milliseconds: number | undefined): string { return milliseconds === undefined ? '—' : `${(milliseconds / 1000).toFixed(2)}s`; }
function formatCount(value: number | undefined): string { return value === undefined ? '—' : value.toLocaleString('en-US'); }

interface StandardModelPricing { readonly inputUsdPerMillionTokens: number; readonly outputUsdPerMillionTokens: number }
const STANDARD_MODEL_PRICING: Readonly<Record<string, StandardModelPricing>> = {
  'claude-sonnet-5': { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 10 },
  'claude-opus-5': { inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 25 },
};
const STANDARD_MODEL_PRICING_AS_OF = '27 Aug 2026';

function estimatedStandardCostUsd(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  cacheCreationInputTokens = 0,
  cacheReadInputTokens = 0,
): number | undefined {
  const pricing = STANDARD_MODEL_PRICING[model];
  if (pricing === undefined || inputTokens === undefined || outputTokens === undefined || cacheCreationInputTokens !== 0 || cacheReadInputTokens !== 0) return undefined;
  return (inputTokens * pricing.inputUsdPerMillionTokens + outputTokens * pricing.outputUsdPerMillionTokens) / 1_000_000;
}

function formatUsd(value: number | undefined): string { return value === undefined ? '—' : `$${value.toFixed(4)}`; }

function finalizeRun(context: OperationalMetricContext, accumulator: RunAccumulator, metric: Extract<OperationalMetric, { readonly event: 'analysis_run' }>): StoredAnalysisRun {
  const operationMap = new Map<string, Array<{ readonly durationMs: number; readonly failed: boolean }>>();
  for (const request of accumulator.githubRequests) {
    const requests = operationMap.get(request.operation) ?? [];
    requests.push({ durationMs: request.durationMs, failed: request.outcome === 'NETWORK_FAILURE' });
    operationMap.set(request.operation, requests);
  }
  const githubOperations = [...operationMap.entries()].map(([operation, requests]) => {
    const durations = requests.map((request) => request.durationMs);
    return {
      operation,
      calls: requests.length,
      totalMs: sum(durations),
      averageMs: rounded(sum(durations) / requests.length),
      failureCount: requests.filter((request) => request.failed).length,
    };
  });
  const claudeCalls = accumulator.claudeCalls.map((call): StoredClaudeCall => ({
    pullRequestAId: call.pullRequestAId, pullRequestBId: call.pullRequestBId, durationMs: call.durationMs, outcome: call.outcome,
    ...(call.inputTokens !== undefined ? { inputTokens: call.inputTokens } : {}), ...(call.outputTokens !== undefined ? { outputTokens: call.outputTokens } : {}),
    ...(call.requestId !== undefined ? { requestId: call.requestId } : {}), ...(call.outcome === 'FAILED' ? { failureReason: call.failureReason ?? call.errorName ?? 'UNKNOWN' } : {}),
    ...(call.failureDetail !== undefined ? { failureDetail: call.failureDetail } : {}),
    ...(call.httpStatus !== undefined ? { httpStatus: call.httpStatus } : {}),
  }));
  const completed = metric.outcome === 'COMPLETED';
  return {
    startedAt: accumulator.startedAt, analysisRunId: context.analysisRunId, outcome: metric.outcome, model: [...accumulator.models].join(' | '), totalMs: metric.durationMs,
    ...(completed ? { eligiblePullRequestRetrievalMs: metric.eligiblePullRequestRetrievalMs, candidateDiscoveryMs: metric.candidateDiscoveryMs, assessmentWallMs: metric.assessmentWallMs } : {}),
    githubRequestCount: accumulator.githubRequests.length, githubRequestTotalMs: sum(accumulator.githubRequests.map((request) => request.durationMs)),
    githubNetworkFailureCount: accumulator.githubRequests.filter((request) => request.outcome === 'NETWORK_FAILURE').length, githubOperations, claudeCalls,
    inputTokens: sum(accumulator.claudeCalls.flatMap((call) => call.inputTokens === undefined ? [] : [call.inputTokens])),
    outputTokens: sum(accumulator.claudeCalls.flatMap((call) => call.outputTokens === undefined ? [] : [call.outputTokens])),
    cacheCreationInputTokens: sum(accumulator.claudeCalls.flatMap((call) => call.cacheCreationInputTokens === undefined ? [] : [call.cacheCreationInputTokens])),
    cacheReadInputTokens: sum(accumulator.claudeCalls.flatMap((call) => call.cacheReadInputTokens === undefined ? [] : [call.cacheReadInputTokens])),
    ...(completed ? { eligiblePullRequestCount: metric.eligiblePullRequestCount, possiblePairCount: metric.possiblePairCount, candidatePairCount: metric.candidatePairCount, assessedPairCount: metric.assessedPairCount, riskIdentifiedCount: metric.riskIdentifiedCount, noRiskIdentifiedCount: metric.noRiskIdentifiedCount, notAssessedCount: metric.notAssessedCount, warningCount: metric.warningCount } : { errorName: metric.errorName }),
  };
}

function createRunCollector(onComplete: (run: StoredAnalysisRun) => void): OperationalMetricReporter {
  const accumulators = new Map<string, RunAccumulator>();
  return (metric) => {
    const context = metricContext.getStore();
    if (context === undefined) return;
    let accumulator = accumulators.get(context.analysisRunId);
    if (accumulator === undefined) {
      accumulator = { startedAt: context.startedAt, models: new Set<string>(), githubRequests: [], claudeCalls: [] };
      accumulators.set(context.analysisRunId, accumulator);
    }
    if (metric.event === 'github_request') accumulator.githubRequests.push(metric);
    else if (metric.event === 'ai_provider_request') { accumulator.models.add(metric.model); accumulator.claudeCalls.push(metric); }
    else { const run = finalizeRun(context, accumulator, metric); accumulators.delete(context.analysisRunId); onComplete(run); }
  };
}

export function createConsoleOperationalMetricReporter(write: (summary: string) => void = console.log, reportPath?: string): OperationalMetricReporter {
  return createRunCollector((run) => {
    const calls = run.claudeCalls.map((call) => `  PR ${call.pullRequestAId} + PR ${call.pullRequestBId}: ${seconds(call.durationMs)} (${call.outcome}${call.failureDetail === undefined ? '' : ` — ${call.failureDetail}`})`).join('\n');
    const failureCount = run.githubNetworkFailureCount + run.claudeCalls.filter((call) => call.outcome === 'FAILED').length;
    write(['', 'Analysis metrics summary', `Run: ${run.analysisRunId}`, `Total: ${seconds(run.totalMs)}`, `Eligible Pull Request Retrieval: ${seconds(run.eligiblePullRequestRetrievalMs)}`, `Candidate Discovery: ${seconds(run.candidateDiscoveryMs)}`, `AI Risk Assessment: ${seconds(run.assessmentWallMs)}`, `AI calls: ${run.claudeCalls.length}`, ...(calls ? [calls] : []), `Tokens: ${run.inputTokens} input / ${run.outputTokens} output`, `Failures: ${failureCount}`, ...(reportPath === undefined ? [] : [`Report: ${reportPath}`]), ''].join('\n'));
  });
}

function escapeHtml(value: string | number | undefined): string {
  if (value === undefined) return '—';
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function formattedStart(startedAt: string): { readonly date: string; readonly time: string } {
  const value = new Date(startedAt);
  if (Number.isNaN(value.getTime())) return { date: startedAt || '—', time: '' };
  return {
    date: value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    time: `${value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC`,
  };
}

function operationalFailureCount(run: StoredAnalysisRun): number {
  return run.githubNetworkFailureCount + run.claudeCalls.filter((call) => call.outcome === 'FAILED').length;
}

function runDetails(run: StoredAnalysisRun): string {
  const started = formattedStart(run.startedAt);
  const sourceControlRows = run.githubOperations.map((operation) => `
    <tr><td>${escapeHtml(operation.operation)}</td><td>${operation.calls}</td><td>${seconds(operation.totalMs)}</td><td>${seconds(operation.averageMs)}</td><td>${operation.failureCount ?? 0}</td></tr>`).join('');
  const aiRows = run.claudeCalls.map((call) => `
    <tr><td>PR ${escapeHtml(call.pullRequestAId)} + PR ${escapeHtml(call.pullRequestBId)}</td><td>${seconds(call.durationMs)}</td><td>${formatCount(call.inputTokens)}</td><td>${formatCount(call.outputTokens)}</td><td><strong>${formatUsd(estimatedStandardCostUsd(run.model, call.inputTokens, call.outputTokens))}</strong></td><td><span class="pill ${call.outcome.toLowerCase()}">${escapeHtml(call.outcome)}</span></td><td>${escapeHtml(call.failureDetail ?? call.failureReason)}</td><td class="request-id">${escapeHtml(call.requestId)}</td></tr>`).join('');
  const runCost = estimatedStandardCostUsd(run.model, run.inputTokens, run.outputTokens, run.cacheCreationInputTokens, run.cacheReadInputTokens);
  return `
    <details>
      <summary><span>${escapeHtml(started.date)} · ${escapeHtml(started.time)} · ${seconds(run.totalMs)}</span><span class="summary-meta">${escapeHtml(run.model)}</span></summary>
      <div class="detail-grid">
        <section class="detail-section">
          <h3>Source-control requests</h3>
          <p class="detail-summary">${run.githubRequestCount} requests · ${seconds(run.githubRequestTotalMs)} accumulated request time · ${run.githubNetworkFailureCount} network failures</p>
          <div class="table-wrap"><table class="detail-table"><thead><tr><th>Operation</th><th>Calls</th><th>Total</th><th>Average</th><th>Failures</th></tr></thead><tbody>${sourceControlRows || '<tr><td colspan="5">No requests recorded</td></tr>'}</tbody></table></div>
        </section>
        <section class="detail-section">
          <h3>AI assessment calls</h3>
          <p class="detail-summary">${formatCount(run.inputTokens)} input tokens · ${formatCount(run.outputTokens)} output tokens · ${formatCount(run.cacheReadInputTokens)} cache-read tokens · ${formatUsd(runCost)} estimated cost</p>
          <div class="table-wrap"><table class="detail-table"><thead><tr><th>Candidate Pair</th><th>Latency</th><th>Input</th><th>Output</th><th>Est. cost</th><th>Outcome</th><th>Failure detail</th><th>Request ID</th></tr></thead><tbody>${aiRows || '<tr><td colspan="8">No AI calls recorded</td></tr>'}</tbody></table></div>
        </section>
      </div>
    </details>`;
}

function renderReport(runs: readonly StoredAnalysisRun[]): string {
  const comparisonRows = runs.map((run) => {
    const started = formattedStart(run.startedAt);
    const cost = estimatedStandardCostUsd(run.model, run.inputTokens, run.outputTokens, run.cacheCreationInputTokens, run.cacheReadInputTokens);
    return `
      <tr><td class="date">${escapeHtml(started.date)}<span>${escapeHtml(started.time)}</span></td><td><span class="pill ${run.outcome.toLowerCase()}">${escapeHtml(run.outcome)}</span></td><td><span class="pill model">${escapeHtml(run.model)}</span></td><td class="number">${seconds(run.totalMs)}</td><td class="number">${seconds(run.eligiblePullRequestRetrievalMs)}</td><td class="number">${seconds(run.candidateDiscoveryMs)}</td><td class="number">${seconds(run.assessmentWallMs)}</td><td class="number">${run.claudeCalls.length}</td><td class="number">${formatCount(run.inputTokens)}</td><td class="number">${formatCount(run.outputTokens)}</td><td class="number">${operationalFailureCount(run)}</td><td class="number"><strong>${formatUsd(cost)}</strong></td></tr>`;
  }).join('');
  const pricingRows = Object.entries(STANDARD_MODEL_PRICING).map(([model, pricing]) => `
    <tr><td><span class="pill model">${escapeHtml(model)}</span></td><td>$${pricing.inputUsdPerMillionTokens} / MTok</td><td>$${pricing.outputUsdPerMillionTokens} / MTok</td><td>${STANDARD_MODEL_PRICING_AS_OF}</td></tr>`).join('');
  const data = JSON.stringify(runs).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cross-PR Analyzer · Analysis Performance Report</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&display=swap');
      :root { --background:#edf1f2; --paper:#fff; --ink:#202629; --muted:#687277; --line:#c4cccf; --accent:#334e5a; font-family:'Manrope',sans-serif; color:var(--ink); background:var(--background); }
      * { box-sizing:border-box; }
      body { margin:0; background:var(--background); }
      h1,h2,h3,p { margin:0; }
      .window { max-width:1360px; margin:0 auto; border:1px solid var(--line); background:var(--background); }
      .product-header { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(270px,.7fr); gap:34px; padding:27px 29px 23px; border-top:8px solid var(--accent); border-bottom:1px solid var(--line); background:var(--paper); }
      .kicker,.section-label { color:var(--muted); font-size:10px; letter-spacing:.12em; text-transform:uppercase; }
      h1 { margin:7px 0 13px; font-size:clamp(30px,4vw,45px); font-weight:500; letter-spacing:-.045em; line-height:1.06; }
      .description { max-width:760px; color:#465156; font-size:14px; line-height:1.6; }
      .advisory { align-self:end; padding:3px 0 3px 15px; border-left:3px solid var(--accent); color:#4d595e; font-size:13px; line-height:1.55; }
      .advisory strong { display:block; margin-bottom:3px; color:var(--ink); font-weight:500; }
      .content { padding:25px 29px 31px; }
      .report-section { border:1px solid var(--line); border-top:2px solid var(--accent); background:var(--paper); }
      .section-header { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:18px 18px 15px; border-bottom:1px solid var(--line); }
      h2 { margin-top:5px; font-size:23px; font-weight:500; letter-spacing:-.035em; }
      h3 { font-size:16px; font-weight:500; letter-spacing:-.02em; }
      .section-copy { margin-top:6px; color:var(--muted); font-size:12px; line-height:1.5; }
      .record-count { color:var(--muted); font-size:11px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }
      .table-wrap { overflow-x:hidden; }
      table { width:100%; border-collapse:collapse; background:var(--paper); }
      .comparison-table,.detail-table,.pricing-table { font-family:'Segoe UI',Arial,sans-serif; }
      .comparison-table { min-width:0; table-layout:fixed; }
      th,td { border-bottom:1px solid var(--line); text-align:center; vertical-align:middle; }
      th { padding:10px 7px; background:#e6edef; color:var(--muted); font-size:10px; font-weight:700; letter-spacing:.08em; line-height:1.3; text-transform:uppercase; }
      td { padding:12px 7px; color:#3f494d; font-size:12px; white-space:nowrap; }
      tbody tr:last-child td { border-bottom:0; }
      tbody tr:nth-child(even) { background:#f4f7f8; }
      .comparison-table th:nth-child(1),.comparison-table td:nth-child(1) { width:8%; }
      .comparison-table th:nth-child(2),.comparison-table td:nth-child(2) { width:8%; }
      .comparison-table th:nth-child(3),.comparison-table td:nth-child(3) { width:11%; }
      .comparison-table th:nth-child(4),.comparison-table td:nth-child(4) { width:6%; }
      .comparison-table th:nth-child(5),.comparison-table td:nth-child(5) { width:11%; }
      .comparison-table th:nth-child(6),.comparison-table td:nth-child(6) { width:9%; }
      .comparison-table th:nth-child(7),.comparison-table td:nth-child(7) { width:9%; }
      .comparison-table th:nth-child(8),.comparison-table td:nth-child(8) { width:6%; }
      .comparison-table th:nth-child(9),.comparison-table td:nth-child(9),.comparison-table th:nth-child(10),.comparison-table td:nth-child(10) { width:8%; }
      .comparison-table th:nth-child(11),.comparison-table td:nth-child(11) { width:7%; }
      .comparison-table th:nth-child(12),.comparison-table td:nth-child(12) { width:9%; }
      .pill { display:inline-block; padding:5px 9px; border-radius:999px; font-family:'Segoe UI',Arial,sans-serif; font-size:11px; font-weight:700; line-height:1.25; white-space:nowrap; }
      .completed { background:#dcfce7; color:#166534; text-transform:uppercase; }
      .failed { background:#fee2e2; color:#991b1b; text-transform:uppercase; }
      .model { background:#e6edef; color:#294a57; }
      .number { font-variant-numeric:tabular-nums; }
      .date { line-height:1.35; white-space:normal; }
      .date span { display:block; color:var(--muted); font-size:9px; }
      .comparison-table td:nth-child(3) { white-space:normal; }
      .comparison-table td:nth-child(3) .model { overflow-wrap:anywhere; text-align:center; }
      .timing-note { padding:11px 17px; border-top:1px solid var(--line); color:var(--muted); background:#f7f9f9; font-size:11px; line-height:1.5; }
      .pricing-section { margin-top:19px; }
      .pricing-layout { display:grid; grid-template-columns:minmax(250px,.8fr) minmax(520px,1.45fr); gap:26px; padding:18px; }
      .pricing-copy { margin-top:7px; color:var(--muted); font-size:12px; line-height:1.55; }
      .pricing-table { border:1px solid var(--line); }
      .pricing-table th,.pricing-table td { padding:9px 10px; }
      .details-heading { margin:27px 0 12px; padding-bottom:8px; border-bottom:2px solid var(--accent); }
      details { margin-top:10px; border:1px solid var(--line); background:var(--paper); }
      summary { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 16px; cursor:pointer; list-style:none; color:var(--ink); font-size:13px; font-weight:500; }
      summary::-webkit-details-marker { display:none; }
      summary::after { content:'+'; color:var(--accent); font-size:20px; font-weight:400; }
      details[open] summary { border-bottom:1px solid var(--line); }
      details[open] summary::after { content:'−'; }
      .summary-meta { margin-left:auto; color:var(--muted); font-size:11px; font-weight:400; }
      .detail-grid { display:grid; grid-template-columns:minmax(350px,.8fr) minmax(620px,1.4fr); gap:22px; padding:18px; }
      .detail-section h3 { margin-bottom:5px; }
      .detail-summary { margin-bottom:11px; color:var(--muted); font-size:11px; line-height:1.5; }
      .detail-table { border:1px solid var(--line); table-layout:auto; }
      .detail-table th { padding:8px 9px; font-size:10px; }
      .detail-table td { padding:8px 9px; font-size:11px; }
      .request-id { font-family:ui-monospace,'Cascadia Code',Consolas,monospace; color:#294a57; font-size:9px; }
      .detail-section .table-wrap { overflow-x:auto; }
      @media(max-width:900px) { .product-header { grid-template-columns:1fr; gap:20px; padding:23px 19px 20px; } .content { padding:21px 19px 25px; } .section-header { align-items:flex-start; flex-direction:column; } .pricing-layout,.detail-grid { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <main class="window">
      <header class="product-header">
        <div><p class="kicker">Cross-PR Integration Risk Analyzer</p><h1>Analysis Performance Report</h1><p class="description">Human-readable history of recorded analysis runs.</p></div>
        <aside class="advisory"><strong>Local operational report</strong>Generated from opt-in metrics for performance review. This report is separate from the pull-request reviewer workspace.</aside>
      </header>
      <div class="content">
        <section class="report-section" aria-labelledby="run-comparison-heading">
          <div class="section-header"><div><p class="section-label">Recorded analysis history</p><h2 id="run-comparison-heading">Run Comparison</h2><p class="section-copy">Pipeline timing, AI usage, estimated cost, and operational failures for each recorded run.</p></div><span class="record-count">${runs.length} recorded ${runs.length === 1 ? 'run' : 'runs'}</span></div>
          <div class="table-wrap"><table class="comparison-table"><thead><tr><th>Started</th><th>Outcome</th><th>Model</th><th>Total</th><th>Eligible Pull Request<br>Retrieval</th><th>Candidate<br>Discovery</th><th>AI Risk<br>Assessment</th><th>AI calls</th><th>Input tokens</th><th>Output tokens</th><th>Failures</th><th>Est. AI cost</th></tr></thead><tbody>${comparisonRows || '<tr><td colspan="12">No runs recorded</td></tr>'}</tbody></table></div>
          <p class="timing-note">AI Risk Assessment includes negligible local preparation of bounded context before each request. Individual AI call durations may overlap when requests run concurrently. Failures include source-control network failures and unsuccessful AI calls.</p>
        </section>
        <section class="report-section pricing-section" aria-labelledby="estimated-cost-heading"><div class="pricing-layout"><div><p class="section-label">Pricing configuration</p><h3 id="estimated-cost-heading">Estimated API Cost</h3><p class="pricing-copy">Cost estimates are calculated from recorded token usage and the pricing configuration associated with each run. Actual provider billing may vary.</p></div><table class="pricing-table"><thead><tr><th>Model</th><th>Input price</th><th>Output price</th><th>Pricing date</th></tr></thead><tbody>${pricingRows}</tbody></table></div></section>
        <h2 class="details-heading">Run details</h2>
        ${runs.map(runDetails).join('')}
      </div>
    </main>
    <script id="analysis-run-data" type="application/json">${data}</script>
  </body>
</html>`;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < content.length; index++) {
    const character = content[index]!;
    if (character === '"') { if (quoted && content[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && content[index + 1] === '\n') index++; row.push(cell); if (row.some((value) => value)) rows.push(row); row = []; cell = ''; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function numeric(value: string | undefined): number | undefined { if (value === undefined || value.trim() === '') return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }

function migrateLegacyCsv(csvPath: string): StoredAnalysisRun[] {
  if (!existsSync(csvPath)) return [];
  const [headers, ...rows] = parseCsv(readFileSync(csvPath, 'utf8')); if (headers === undefined) return [];
  return rows.map((values): StoredAnalysisRun => {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const claudeCalls: StoredClaudeCall[] = [];
    for (const match of row['claude_call_details']?.matchAll(/([^+|]+)\+([^:|]+):\s*([\d.]+)ms\s*\(([^)]+)\)/g) ?? []) claudeCalls.push({ pullRequestAId: match[1]!.trim(), pullRequestBId: match[2]!.trim(), durationMs: Number(match[3]), outcome: match[4]! });
    const githubOperations: GitHubOperationSummary[] = [];
    for (const match of row['github_request_details']?.matchAll(/([^|:]+):\s*(\d+) call\(s\) \/ ([\d.]+)ms/g) ?? []) { const calls = Number(match[2]); const totalMs = Number(match[3]); githubOperations.push({ operation: match[1]!.trim(), calls, totalMs, averageMs: rounded(totalMs / calls), failureCount: 0 }); }
    return {
      startedAt: row['started_at'] ?? '', analysisRunId: row['analysis_run_id'] ?? '', outcome: row['outcome'] ?? 'UNKNOWN', model: row['model'] ?? '', totalMs: numeric(row['total_ms']) ?? 0,
      ...(numeric(row['eligible_pr_retrieval_ms']) !== undefined ? { eligiblePullRequestRetrievalMs: numeric(row['eligible_pr_retrieval_ms']) } : {}), ...(numeric(row['candidate_discovery_ms']) !== undefined ? { candidateDiscoveryMs: numeric(row['candidate_discovery_ms']) } : {}), ...(numeric(row['assessment_wall_ms']) !== undefined ? { assessmentWallMs: numeric(row['assessment_wall_ms']) } : {}),
      githubRequestCount: numeric(row['github_request_count']) ?? 0, githubRequestTotalMs: numeric(row['github_request_total_ms']) ?? 0, githubNetworkFailureCount: numeric(row['github_network_failure_count']) ?? 0, githubOperations, claudeCalls,
      inputTokens: numeric(row['input_tokens']) ?? 0, outputTokens: numeric(row['output_tokens']) ?? 0, cacheCreationInputTokens: numeric(row['cache_creation_input_tokens']) ?? 0, cacheReadInputTokens: numeric(row['cache_read_input_tokens']) ?? 0,
      ...(numeric(row['eligible_pr_count']) !== undefined ? { eligiblePullRequestCount: numeric(row['eligible_pr_count']) } : {}), ...(numeric(row['possible_pair_count']) !== undefined ? { possiblePairCount: numeric(row['possible_pair_count']) } : {}), ...(numeric(row['candidate_pair_count']) !== undefined ? { candidatePairCount: numeric(row['candidate_pair_count']) } : {}), ...(numeric(row['assessed_pair_count']) !== undefined ? { assessedPairCount: numeric(row['assessed_pair_count']) } : {}), ...(numeric(row['not_assessed_count']) !== undefined ? { notAssessedCount: numeric(row['not_assessed_count']) } : {}), ...(numeric(row['warning_count']) !== undefined ? { warningCount: numeric(row['warning_count']) } : {}), ...(row['error_name'] ? { errorName: row['error_name'] } : {}),
    };
  });
}

function readExistingRuns(reportPath: string, legacyCsvPath: string): StoredAnalysisRun[] {
  if (!existsSync(reportPath)) return migrateLegacyCsv(legacyCsvPath);
  const match = /<script id="analysis-run-data" type="application\/json">([\s\S]*?)<\/script>/.exec(readFileSync(reportPath, 'utf8'));
  return match?.[1] === undefined ? [] : JSON.parse(match[1]) as StoredAnalysisRun[];
}

export interface HtmlOperationalMetricReporterOptions { readonly directory: string; readonly reportFailure?: (errorName: string) => void }

function writeReportFile(directory: string, runs: readonly StoredAnalysisRun[]): string {
  mkdirSync(directory, { recursive: true });
  const reportPath = join(directory, 'analysis-report.html');
  const temporaryPath = `${reportPath}.tmp`;
  writeFileSync(temporaryPath, renderReport(runs), 'utf8');
  renameSync(temporaryPath, reportPath);
  return reportPath;
}

/** Creates or refreshes the HTML view without adding a new run; an optional limit supports one-time local baseline curation. */
export function ensureHtmlOperationalMetricsReport(directory: string, keepMostRecentRuns?: number): string | undefined {
  const reportPath = join(directory, 'analysis-report.html');
  const existingRuns = readExistingRuns(reportPath, join(directory, 'analysis-runs.csv'));
  const runs = keepMostRecentRuns === undefined ? existingRuns : existingRuns.slice(-keepMostRecentRuns);
  return runs.length === 0 ? undefined : writeReportFile(directory, runs);
}

export function createHtmlOperationalMetricReporter(options: HtmlOperationalMetricReporterOptions): OperationalMetricReporter {
  let failureReported = false;
  return createRunCollector((run) => {
    try {
      const reportPath = join(options.directory, 'analysis-report.html');
      const runs = [...readExistingRuns(reportPath, join(options.directory, 'analysis-runs.csv')), run];
      writeReportFile(options.directory, runs);
    } catch (error) {
      if (!failureReported) { failureReported = true; try { options.reportFailure?.(error instanceof Error ? error.name : 'UnknownFileError'); } catch { /* Observational only. */ } }
    }
  });
}

export function combineOperationalMetricReporters(reporters: readonly OperationalMetricReporter[]): OperationalMetricReporter { return (metric) => { for (const reporter of reporters) emitOperationalMetric(reporter, metric); }; }
export function elapsedMilliseconds(startedAt: number): number { return rounded(performance.now() - startedAt); }

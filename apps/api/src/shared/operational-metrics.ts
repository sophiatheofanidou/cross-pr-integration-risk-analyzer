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
interface GitHubOperationSummary { readonly operation: string; readonly calls: number; readonly totalMs: number; readonly averageMs: number }
interface StoredClaudeCall { readonly pullRequestAId: string; readonly pullRequestBId: string; readonly durationMs: number; readonly outcome: string; readonly inputTokens?: number; readonly outputTokens?: number; readonly requestId?: string; readonly failureReason?: string; readonly failureDetail?: string }
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
  const operationMap = new Map<string, number[]>();
  for (const request of accumulator.githubRequests) {
    const durations = operationMap.get(request.operation) ?? [];
    durations.push(request.durationMs);
    operationMap.set(request.operation, durations);
  }
  const githubOperations = [...operationMap.entries()].map(([operation, durations]) => ({ operation, calls: durations.length, totalMs: sum(durations), averageMs: rounded(sum(durations) / durations.length) }));
  const claudeCalls = accumulator.claudeCalls.map((call): StoredClaudeCall => ({
    pullRequestAId: call.pullRequestAId, pullRequestBId: call.pullRequestBId, durationMs: call.durationMs, outcome: call.outcome,
    ...(call.inputTokens !== undefined ? { inputTokens: call.inputTokens } : {}), ...(call.outputTokens !== undefined ? { outputTokens: call.outputTokens } : {}),
    ...(call.requestId !== undefined ? { requestId: call.requestId } : {}), ...(call.outcome === 'FAILED' ? { failureReason: call.failureReason ?? call.errorName ?? 'UNKNOWN' } : {}),
    ...(call.failureDetail !== undefined ? { failureDetail: call.failureDetail } : {}),
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
    write(['', 'Analysis metrics summary', `Run: ${run.analysisRunId}`, `Total: ${seconds(run.totalMs)}`, `Eligible Pull Request Retrieval: ${seconds(run.eligiblePullRequestRetrievalMs)}`, `Candidate Discovery: ${seconds(run.candidateDiscoveryMs)}`, `Context Retrieval + AI Risk Assessment: ${seconds(run.assessmentWallMs)}`, `Claude calls: ${run.claudeCalls.length}`, ...(calls ? [calls] : []), `Tokens: ${run.inputTokens} input / ${run.outputTokens} output`, `Results: ${run.riskIdentifiedCount ?? '—'} risk / ${run.noRiskIdentifiedCount ?? '—'} no risk / ${run.warningCount ?? '—'} warnings`, ...(reportPath === undefined ? [] : [`Report: ${reportPath}`]), ''].join('\n'));
  });
}

function escapeHtml(value: string | number | undefined): string {
  if (value === undefined) return '—';
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function runDetails(run: StoredAnalysisRun, index: number): string {
  const githubRows = run.githubOperations.map((operation) => `<tr><td>${escapeHtml(operation.operation)}</td><td>${operation.calls}</td><td>${seconds(operation.totalMs)}</td><td>${seconds(operation.averageMs)}</td></tr>`).join('');
  const claudeRows = run.claudeCalls.map((call) => `<tr><td>PR ${escapeHtml(call.pullRequestAId)} + PR ${escapeHtml(call.pullRequestBId)}</td><td>${seconds(call.durationMs)}</td><td>${formatCount(call.inputTokens)}</td><td>${formatCount(call.outputTokens)}</td><td>${formatUsd(estimatedStandardCostUsd(run.model, call.inputTokens, call.outputTokens))}</td><td><span class="status ${call.outcome.toLowerCase()}">${escapeHtml(call.outcome)}</span></td><td>${escapeHtml(call.failureDetail)}</td><td>${escapeHtml(call.requestId)}</td></tr>`).join('');
  const runCost = estimatedStandardCostUsd(run.model, run.inputTokens, run.outputTokens, run.cacheCreationInputTokens, run.cacheReadInputTokens);
  return `<details><summary>Run ${index + 1} · ${escapeHtml(run.startedAt)} · ${seconds(run.totalMs)}</summary><div class="detail-grid"><section><h3>GitHub requests</h3><p>${run.githubRequestCount} requests · ${seconds(run.githubRequestTotalMs)} accumulated request time · ${run.githubNetworkFailureCount} network failures</p><div class="table-wrap"><table><thead><tr><th>Operation</th><th>Calls</th><th>Total</th><th>Average</th></tr></thead><tbody>${githubRows || '<tr><td colspan="4">No requests recorded</td></tr>'}</tbody></table></div></section><section><h3>Claude calls</h3><p>${formatCount(run.inputTokens)} input tokens · ${formatCount(run.outputTokens)} output tokens · ${formatCount(run.cacheReadInputTokens)} cache-read tokens · ${formatUsd(runCost)} estimated cost</p><div class="table-wrap"><table><thead><tr><th>Candidate Pair</th><th>Latency</th><th>Input</th><th>Output</th><th>Est. cost</th><th>Outcome</th><th>Failure detail</th><th>Request ID</th></tr></thead><tbody>${claudeRows || '<tr><td colspan="8">No Claude calls recorded</td></tr>'}</tbody></table></div></section></div></details>`;
}

function renderReport(runs: readonly StoredAnalysisRun[]): string {
  const rows = runs.map((run, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(run.startedAt)}</td><td><span class="status ${run.outcome.toLowerCase()}">${escapeHtml(run.outcome)}</span></td><td>${escapeHtml(run.model)}</td><td>${seconds(run.totalMs)}</td><td>${seconds(run.eligiblePullRequestRetrievalMs)}</td><td>${seconds(run.candidateDiscoveryMs)}</td><td>${seconds(run.assessmentWallMs)}</td><td>${run.claudeCalls.length}</td><td>${formatCount(run.inputTokens)}</td><td>${formatCount(run.outputTokens)}</td><td>${formatUsd(estimatedStandardCostUsd(run.model, run.inputTokens, run.outputTokens, run.cacheCreationInputTokens, run.cacheReadInputTokens))}</td><td>${formatCount(run.riskIdentifiedCount)}</td><td>${formatCount(run.noRiskIdentifiedCount)}</td><td>${formatCount(run.warningCount)}</td></tr>`).join('');
  const data = JSON.stringify(runs).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cross-PR Analyzer · Performance Runs</title><style>:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#172033;background:#f4f6fa}*{box-sizing:border-box}body{margin:0}main{max-width:1500px;margin:auto;padding:32px}header{margin-bottom:24px}h1{margin:0 0 8px;font-size:28px}h2{margin-top:30px}h3{margin:0 0 8px}p{color:#536078}.card{background:#fff;border:1px solid #dfe4ec;border-radius:12px;padding:20px;box-shadow:0 2px 8px #1720330d}.table-wrap{overflow:auto;border:1px solid #e2e6ed;border-radius:8px}table{width:100%;border-collapse:collapse;white-space:nowrap;background:#fff}th,td{padding:10px 12px;border-bottom:1px solid #e8ebf0;text-align:left;font-size:13px}th{position:sticky;top:0;background:#eef2f7;color:#3d485c}.comparison-table{white-space:normal}.comparison-table th{padding:8px 7px;line-height:1.2;white-space:normal}.comparison-table td{padding:9px 7px;white-space:nowrap}.comparison-table th:nth-child(2),.comparison-table td:nth-child(2){font-size:12px}tbody tr:hover{background:#f8fafc}.status{display:inline-block;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}.completed{background:#dcfce7;color:#166534}.failed{background:#fee2e2;color:#991b1b}details{margin-top:14px;background:#fff;border:1px solid #dfe4ec;border-radius:10px}summary{cursor:pointer;padding:16px 18px;font-weight:700}details[open] summary{border-bottom:1px solid #e5e9f0}.detail-grid{display:grid;grid-template-columns:1fr;gap:22px;padding:20px}.note{padding:12px 14px;background:#eef6ff;border-left:4px solid #3b82f6;border-radius:6px;color:#34445e}.pricing-note{font-size:12px;color:#667085}.pricing-note a{color:#2563eb}@media(max-width:700px){main{padding:18px}h1{font-size:23px}}</style></head><body><main><header><h1>Analysis performance runs</h1><p>Human-readable comparison of local Cross-PR Integration Risk Analyzer runs.</p></header><section class="card"><h2>Run comparison</h2><p class="note">Context Retrieval + AI Risk Assessment time measures real elapsed time for the complete assessment stage. Individual Claude call durations may overlap because calls run concurrently.</p><p class="pricing-note">Estimated cost uses standard global API list prices: Claude Sonnet 5 at $2/MTok input and $10/MTok output, and Claude Opus 5 at $5/MTok input and $25/MTok output. Actual billing may differ for caching, batch or regional processing, negotiated pricing, credits and taxes. Anthropic pricing sources: <a href="https://www.anthropic.com/news/claude-sonnet-5">Sonnet 5</a> and <a href="https://www.anthropic.com/news/claude-opus-5">Opus 5</a>.</p><div class="table-wrap"><table class="comparison-table"><thead><tr><th>#</th><th>Started</th><th>Outcome</th><th>Model</th><th>Total</th><th>Eligible Pull Request<br>Retrieval</th><th>Candidate<br>Discovery</th><th>Context Retrieval +<br>AI Risk Assessment</th><th>AI calls</th><th>Input tokens</th><th>Output tokens</th><th>Est. AI cost</th><th>Risks</th><th>No risk</th><th>Warnings</th></tr></thead><tbody>${rows || '<tr><td colspan="15">No runs recorded</td></tr>'}</tbody></table></div></section><h2>Run details</h2>${runs.map(runDetails).join('')}<script id="analysis-run-data" type="application/json">${data}</script></main></body></html>`;
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
    for (const match of row['github_request_details']?.matchAll(/([^|:]+):\s*(\d+) call\(s\) \/ ([\d.]+)ms/g) ?? []) { const calls = Number(match[2]); const totalMs = Number(match[3]); githubOperations.push({ operation: match[1]!.trim(), calls, totalMs, averageMs: rounded(totalMs / calls) }); }
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

/** Creates or refreshes the HTML view without adding a new run. */
export function ensureHtmlOperationalMetricsReport(directory: string): string | undefined {
  const reportPath = join(directory, 'analysis-report.html');
  const runs = readExistingRuns(reportPath, join(directory, 'analysis-runs.csv'));
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

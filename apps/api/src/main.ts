/**
 * Backend process entry point: the composition root that wires the concrete
 * GitHub, Tree-sitter and Claude adapters into the Fastify server and starts
 * listening (M5 backend prompt, section 6). Kept separate from
 * `createServer` so tests can compose the server with fake providers
 * without starting a process or opening a network port.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createServer } from './http/create-server.js';
import { ClaudeRiskAnalysisProvider } from './risk-analysis/claude/claude-risk-analysis-provider.js';
import { GitHubSourceControlProvider } from './source-control/github/github-source-control-provider.js';
import {
  combineOperationalMetricReporters,
  createConsoleOperationalMetricReporter,
  createHtmlOperationalMetricReporter,
  type OperationalMetricReporter,
} from './shared/operational-metrics.js';
import { TypeScriptStructuralAnalyzer } from './structural-analysis/typescript/typescript-structural-analyzer.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const metricsDirectory = fileURLToPath(new URL('../../../runtime/metrics/', import.meta.url));
  const reportPath = join(metricsDirectory, 'analysis-report.html');
  const consoleReporter = createConsoleOperationalMetricReporter(
    console.log,
    config.analysisMetrics === 'both' ? reportPath : undefined,
  );
  const fileReporter = createHtmlOperationalMetricReporter({
    directory: metricsDirectory,
    reportFailure: (errorName) => {
      console.error(`Operational metrics file output failed (${errorName}).`);
    },
  });
  const reportOperationalMetric: OperationalMetricReporter | undefined =
    config.analysisMetrics === 'console'
      ? consoleReporter
      : config.analysisMetrics === 'file'
        ? fileReporter
        : config.analysisMetrics === 'both'
          ? combineOperationalMetricReporters([consoleReporter, fileReporter])
          : undefined;

  const app = createServer({
    sourceControlProvider: new GitHubSourceControlProvider({
      client: { token: config.githubToken, reportOperationalMetric },
    }),
    structuralAnalyzer: new TypeScriptStructuralAnalyzer(),
    riskAnalysisProvider: new ClaudeRiskAnalysisProvider({
      model: config.claudeModel,
      apiKey: config.anthropicApiKey,
      reportOperationalMetric,
    }),
    reportOperationalMetric,
    reportProviderFailure: (diagnostic) => {
      console.error('Risk assessment provider failure:', diagnostic);
    },
  });

  await app.listen({ port: config.port, host: '127.0.0.1' });
  console.log(`Cross-PR Integration Risk Analyzer API listening on port ${config.port}`);
}

main().catch((error: unknown) => {
  console.error('Failed to start the Cross-PR Integration Risk Analyzer API:', error);
  process.exitCode = 1;
});

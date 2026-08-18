/**
 * Per-pull-request structural facts, prepared once per pull request and
 * reused across every possible pair involving it.
 *
 * See docs/design/04-candidate-discovery.md (Inputs, Resulting-Content
 * Search) and the M3 boundary: "Each supported resulting file should be
 * parsed once per pull request and reused across every possible pair
 * involving that PR."
 */

import type { AnalysisWarning } from '../domain/analysis-warning.js';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { RepositoryRef, SourceControlProvider } from '../source-control/source-control-provider.js';
import type { StructuralAnalyzer } from '../structural-analysis/structural-analyzer.js';
import type { ContentCache, PreparedFileFacts } from './prepare-changed-file.js';
import { prepareChangedFile } from './prepare-changed-file.js';

export interface PullRequestStructuralFacts {
  readonly pullRequest: NormalizedPullRequest;
  /** Prepared facts for each supported changed file, in the pull request's changed-file order. */
  readonly files: readonly PreparedFileFacts[];
}

/**
 * Prepares structural facts for every eligible pull request once, sharing
 * one run-scoped content cache. Returns the per-pull-request facts, keyed
 * by pull request id, together with every material analysis warning
 * produced while preparing them.
 */
export async function prepareAllStructuralFacts(
  pullRequests: readonly NormalizedPullRequest[],
  repository: RepositoryRef,
  sourceControlProvider: SourceControlProvider,
  analyzer: StructuralAnalyzer,
): Promise<{
  readonly factsByPullRequestId: ReadonlyMap<string, PullRequestStructuralFacts>;
  readonly warnings: readonly AnalysisWarning[];
}> {
  const contentCache: ContentCache = new Map();
  const factsByPullRequestId = new Map<string, PullRequestStructuralFacts>();
  const warnings: AnalysisWarning[] = [];

  for (const pullRequest of pullRequests) {
    const files: PreparedFileFacts[] = [];

    for (const changedFile of pullRequest.changedFiles) {
      const result = await prepareChangedFile(
        pullRequest,
        changedFile,
        repository,
        sourceControlProvider,
        analyzer,
        contentCache,
      );
      if (result.kind === 'PREPARED') {
        files.push(result.facts);
      } else {
        warnings.push(result.warning);
      }
    }

    factsByPullRequestId.set(pullRequest.id, { pullRequest, files });
  }

  return { factsByPullRequestId, warnings };
}

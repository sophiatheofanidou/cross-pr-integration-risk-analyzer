/**
 * Preparation of one changed file for structural analysis: resolving
 * reliable changed ranges (provider patch preferred, bounded local diff as
 * fallback) and retrieving the resulting content needed by both structural
 * analysis and, later, Context Retrieval.
 *
 * See docs/design/04-candidate-discovery.md (Resulting-Content Search,
 * Changed-File Support) and ADR-011.
 */

import { createTwoFilesPatch } from 'diff';
import type { AnalysisWarning, AnalysisWarningReason } from '../domain/analysis-warning.js';
import type { ChangedFile, NormalizedPullRequest } from '../domain/pull-request.js';
import type {
  FileContentResult,
  FileContentUnavailableReason,
  RepositoryRef,
  SourceControlProvider,
} from '../source-control/source-control-provider.js';
import type {
  ChangedTermAssociation,
  StructuralAnalyzer,
  StructuralTermOccurrence,
} from '../structural-analysis/structural-analyzer.js';
import { computeWholeFileRange, isSupportedTypeScriptFile } from './changed-file-support.js';
import { reconstructChangedRanges } from './local-diff-reconstruction.js';
import { isRangeWithinContent, parsePatch } from './patch-hunk-parser.js';

/**
 * Structural facts and reusable material for one supported changed file,
 * kept for reuse by Technical Term Match evaluation and by Context
 * Retrieval (docs/design/05-context-retrieval.md, Inputs: "reuses
 * structural information and file contents already available").
 */
export interface PreparedFileFacts {
  readonly filePath: string;
  readonly content: string;
  /** The provider patch text, or a synthesized unified diff when locally reconstructed. */
  readonly changeRepresentation: string;
  readonly changedTerms: readonly ChangedTermAssociation[];
  readonly occurrences: readonly StructuralTermOccurrence[];
}

export type PrepareChangedFileResult =
  | { readonly kind: 'PREPARED'; readonly facts: PreparedFileFacts }
  | { readonly kind: 'SKIPPED'; readonly warning: AnalysisWarning };

const UNAVAILABLE_REASON_TO_WARNING_REASON: Record<FileContentUnavailableReason, AnalysisWarningReason> = {
  NOT_FOUND: 'FILE_UNAVAILABLE',
  OVERSIZED: 'FILE_OVERSIZED',
  UNSUPPORTED_CONTENT: 'UNSUPPORTED_CONTENT',
};

function skip(
  pullRequestId: string,
  filePath: string,
  reason: AnalysisWarningReason,
  message: string,
): PrepareChangedFileResult {
  return { kind: 'SKIPPED', warning: { pullRequestId, filePath, reason, message } };
}

/** Run-scoped cache of retrieved content, keyed by repository, revision and path. */
export type ContentCache = Map<string, Promise<FileContentResult>>;

function contentCacheKey(repository: RepositoryRef, revision: string, path: string): string {
  return `${repository.owner}/${repository.repo}@${revision}::${path}`;
}

async function getCachedFileContent(
  repository: RepositoryRef,
  path: string,
  revision: string,
  sourceControlProvider: SourceControlProvider,
  contentCache: ContentCache,
): Promise<FileContentResult> {
  const key = contentCacheKey(repository, revision, path);
  const cached = contentCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const pending = sourceControlProvider.getFileContent(repository, path, revision);
  contentCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    if (contentCache.get(key) === pending) {
      contentCache.delete(key);
    }
    throw error;
  }
}

export async function prepareChangedFile(
  pullRequest: NormalizedPullRequest,
  file: ChangedFile,
  repository: RepositoryRef,
  sourceControlProvider: SourceControlProvider,
  analyzer: StructuralAnalyzer,
  contentCache: ContentCache,
): Promise<PrepareChangedFileResult> {
  if (file.changeType === 'DELETED') {
    return skip(
      pullRequest.id,
      file.path,
      'DELETED_FILE',
      `${file.path} was deleted; deleted-file structural analysis is not supported`,
    );
  }
  if (file.changeType === 'RENAMED') {
    return skip(
      pullRequest.id,
      file.path,
      'RENAMED_FILE',
      `${file.path} was renamed; renamed-file structural analysis is not supported`,
    );
  }
  if (!isSupportedTypeScriptFile(file.path)) {
    return skip(
      pullRequest.id,
      file.path,
      'UNSUPPORTED_FILE_EXTENSION',
      `${file.path} is not a supported TypeScript (.ts) file`,
    );
  }

  const afterResult = await getCachedFileContent(
    repository,
    file.path,
    pullRequest.headRevision,
    sourceControlProvider,
    contentCache,
  );
  if (afterResult.status === 'UNAVAILABLE') {
    return skip(
      pullRequest.id,
      file.path,
      UNAVAILABLE_REASON_TO_WARNING_REASON[afterResult.reason],
      `resulting content for ${file.path} at ${pullRequest.headRevision} is unavailable (${afterResult.reason})`,
    );
  }
  const afterContent = afterResult.content;

  let changedRanges;
  let changeRepresentation: string;

  if (file.changeType === 'ADDED') {
    changedRanges = [computeWholeFileRange(afterContent)];
    changeRepresentation = file.patch ?? createTwoFilesPatch(file.path, file.path, '', afterContent);
  } else {
    const patchResult = parsePatch(file.patch);
    // A syntactically consistent hunk can still declare resulting line
    // numbers that are impossible for the actual retrieved content (e.g. a
    // hunk at line 100 in a one-line file); only trust the patch once its
    // ranges are checked against that content too.
    if (
      patchResult.usable &&
      patchResult.changedRanges.every((range) => isRangeWithinContent(range, afterContent))
    ) {
      changedRanges = patchResult.changedRanges;
      changeRepresentation = file.patch!;
    } else {
      const beforeResult = await getCachedFileContent(
        repository,
        file.path,
        pullRequest.changeBaseRevision,
        sourceControlProvider,
        contentCache,
      );
      if (beforeResult.status === 'UNAVAILABLE') {
        return skip(
          pullRequest.id,
          file.path,
          'UNRECONSTRUCTABLE_CHANGED_RANGES',
          `${file.path} has no usable provider patch and its before-content at ${pullRequest.changeBaseRevision} is unavailable (${beforeResult.reason})`,
        );
      }
      const reconstructed = reconstructChangedRanges(beforeResult.content, afterContent);
      if (reconstructed.length === 0) {
        return skip(
          pullRequest.id,
          file.path,
          'UNRECONSTRUCTABLE_CHANGED_RANGES',
          `${file.path} has no usable provider patch and local diff reconstruction produced no changed ranges`,
        );
      }
      changedRanges = reconstructed;
      changeRepresentation = createTwoFilesPatch(file.path, file.path, beforeResult.content, afterContent);
    }
  }

  const analysis = analyzer.analyze({ filePath: file.path, content: afterContent, changedRanges });
  if (analysis.malformed) {
    return skip(
      pullRequest.id,
      file.path,
      'MALFORMED_SOURCE',
      `${file.path} could not be parsed reliably at its changed regions`,
    );
  }

  return {
    kind: 'PREPARED',
    facts: {
      filePath: file.path,
      content: afterContent,
      changeRepresentation,
      changedTerms: analysis.changedTerms,
      occurrences: analysis.occurrences,
    },
  };
}

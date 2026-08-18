/**
 * GitHub implementation of the provider-neutral `SourceControlProvider`
 * boundary: HTTP retrieval via `GitHubClient`, response validation via the
 * schemas in ./github-response-schemas.ts, and normalization into
 * ../../domain pull-request contracts.
 *
 * See docs/design/02-architecture.md (Source Control Integration) and
 * docs/design/07-mvp-specification.md (Pull Request Scope,
 * Source-Content Retrieval Scope).
 */

import type { ChangedFile, FileChangeType, NormalizedPullRequest } from '../../domain/pull-request.js';
import type {
  FileContentResult,
  RepositoryRef,
  SourceControlProvider,
} from '../source-control-provider.js';
import {
  isEligiblePullRequest,
  type NormalizedReview,
} from '../pull-request-eligibility.js';
import {
  GitHubClient,
  GitHubResponseValidationError,
  type GitHubClientConfig,
} from './github-client.js';
import {
  changedFileSchema,
  compareCommitsSchema,
  pullRequestSummarySchema,
  repositoryContentSchema,
  reviewSchema,
  type GitHubChangedFile,
  type GitHubFileStatus,
  type GitHubPullRequestSummary,
} from './github-response-schemas.js';

/** Files at or under this size (in bytes) may be returned as available text content. */
export const DEFAULT_MAX_FILE_CONTENT_BYTES = 1_000_000;

const APPROVED_FILE_STATUS_MAP: Partial<Record<GitHubFileStatus, FileChangeType>> = {
  added: 'ADDED',
  modified: 'MODIFIED',
  removed: 'DELETED',
  renamed: 'RENAMED',
};

/**
 * Maps a documented GitHub file status to the four approved MVP domain
 * cases. Fails explicitly for a documented status with no approved
 * mapping (`copied`, `changed`, `unchanged`) rather than inventing one.
 */
export function mapFileChangeType(status: GitHubFileStatus): FileChangeType {
  const mapped = APPROVED_FILE_STATUS_MAP[status];
  if (mapped === undefined) {
    throw new Error(
      `GitHub file status "${status}" has no approved MVP domain mapping`,
    );
  }
  return mapped;
}

/**
 * Normalizes a changed file and enforces the renamed-file invariant: a
 * `RENAMED` file must carry a previous path, and a non-`RENAMED` file must
 * never produce one, even if GitHub's response included
 * `previous_filename` (documented for `renamed` and `copied` statuses).
 * Enforced here rather than in the Zod schema because it is a cross-field
 * normalization rule, not a data-shape concern (ADR-016).
 */
export function normalizeChangedFile(file: GitHubChangedFile): ChangedFile {
  const changeType = mapFileChangeType(file.status);

  if (changeType === 'RENAMED' && file.previous_filename === undefined) {
    throw new Error(
      `GitHub reported a renamed file ("${file.filename}") without a previous_filename`,
    );
  }

  return {
    path: file.filename,
    changeType,
    ...(changeType === 'RENAMED' && file.previous_filename !== undefined
      ? { previousPath: file.previous_filename }
      : {}),
    ...(file.patch !== undefined ? { patch: file.patch } : {}),
  };
}

function normalizePullRequest(
  summary: GitHubPullRequestSummary,
  changeBaseRevision: string,
  changedFiles: readonly ChangedFile[],
): NormalizedPullRequest {
  return {
    id: String(summary.number),
    sourceBranch: summary.head.ref,
    targetBranch: summary.base.ref,
    headRevision: summary.head.sha,
    changeBaseRevision,
    changedFiles,
  };
}

/**
 * GitHub's "List pull request files" endpoint documents a hard cap of
 * 3,000 files per pull request; it does not signal when a larger file set
 * has been truncated. A result of exactly this size can therefore never be
 * safely treated as complete.
 */
export const GITHUB_MAX_PULL_REQUEST_FILES = 3000;

/**
 * Thrown when a pull request's changed-file result reaches exactly
 * GitHub's documented 3,000-file cap. Pull-request listing happens before
 * Candidate Discovery's `AnalysisWarning` scope begins, so this fails
 * explicitly rather than silently under-reporting Technical Term Matches
 * for the affected pull request.
 */
export class GitHubPullRequestFileLimitExceededError extends Error {
  readonly pullRequestNumber: number;

  constructor(pullRequestNumber: number) {
    super(
      `Pull request #${pullRequestNumber} returned exactly GitHub's documented cap of ${GITHUB_MAX_PULL_REQUEST_FILES} changed files; the true file set may be larger and cannot be safely treated as complete`,
    );
    this.name = 'GitHubPullRequestFileLimitExceededError';
    this.pullRequestNumber = pullRequestNumber;
  }
}

const BASE64_CHARSET_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Decodes GitHub's base64 file content strictly. Node's `Buffer.from(str,
 * 'base64')` silently ignores characters outside the base64 alphabet
 * instead of rejecting them, so it cannot by itself detect malformed
 * content. This strips only legitimate whitespace/line wrapping (GitHub
 * wraps base64 content across lines), validates the remaining characters
 * and padding, then verifies the decode is lossless via a re-encode
 * round-trip before returning the decoded bytes.
 */
function decodeStrictBase64(rawContent: string): Buffer {
  const normalized = rawContent.replace(/\s+/g, '');

  if (normalized.length % 4 !== 0 || !BASE64_CHARSET_PATTERN.test(normalized)) {
    throw new Error('content is not structurally valid base64');
  }

  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.toString('base64') !== normalized) {
    throw new Error('content is not structurally valid base64');
  }

  return buffer;
}

function encodeRepositoryPath(owner: string, repo: string): string {
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function encodeFilePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export interface GitHubSourceControlProviderOptions {
  readonly client?: GitHubClientConfig;
  /** Files larger than this are treated as unavailable ("OVERSIZED"). */
  readonly maxFileContentBytes?: number;
}

export class GitHubSourceControlProvider implements SourceControlProvider {
  private readonly client: GitHubClient;
  private readonly maxFileContentBytes: number;

  constructor(options: GitHubSourceControlProviderOptions = {}) {
    this.client = new GitHubClient(options.client);
    this.maxFileContentBytes =
      options.maxFileContentBytes ?? DEFAULT_MAX_FILE_CONTENT_BYTES;
  }

  async getEligiblePullRequests(
    repository: RepositoryRef,
    targetBranch: string,
  ): Promise<readonly NormalizedPullRequest[]> {
    const repoPath = encodeRepositoryPath(repository.owner, repository.repo);

    const summaries = await this.client.listAllPages(
      `/repos/${repoPath}/pulls?state=open&base=${encodeURIComponent(targetBranch)}&per_page=100`,
      pullRequestSummarySchema,
      'listPullRequests',
    );

    const eligible: NormalizedPullRequest[] = [];

    for (const summary of summaries) {
      if (summary.draft) {
        continue;
      }

      const reviews = await this.client.listAllPages(
        `/repos/${repoPath}/pulls/${summary.number}/reviews?per_page=100`,
        reviewSchema,
        'listReviews',
      );

      const normalizedReviews: NormalizedReview[] = reviews.map((review) => ({
        reviewerKey: review.user !== null ? `user:${review.user.id}` : `review:${review.id}`,
        decision: review.state,
      }));

      const eligibilityResult = isEligiblePullRequest(
        {
          state: summary.state,
          draft: summary.draft,
          targetBranch: summary.base.ref,
          reviews: normalizedReviews,
        },
        targetBranch,
      );

      if (!eligibilityResult) {
        continue;
      }

      // Three-dot compare (BASE...HEAD) using immutable commit SHAs, not
      // branch names: its `merge_base_commit.sha` is the actual git
      // merge-base of the two sides, which `summary.base.sha` is not
      // guaranteed to be once the target branch has advanced.
      const compare = await this.client.getValidatedResource(
        `/repos/${repoPath}/compare/${encodeURIComponent(summary.base.sha)}...${encodeURIComponent(summary.head.sha)}`,
        compareCommitsSchema,
        'compareCommits',
      );

      const files = await this.client.listAllPages(
        `/repos/${repoPath}/pulls/${summary.number}/files?per_page=100`,
        changedFileSchema,
        'listPullRequestFiles',
      );

      if (files.length === GITHUB_MAX_PULL_REQUEST_FILES) {
        throw new GitHubPullRequestFileLimitExceededError(summary.number);
      }

      eligible.push(
        normalizePullRequest(
          summary,
          compare.merge_base_commit.sha,
          files.map(normalizeChangedFile),
        ),
      );
    }

    return eligible;
  }

  async getFileContent(
    repository: RepositoryRef,
    path: string,
    revision: string,
  ): Promise<FileContentResult> {
    const repoPath = encodeRepositoryPath(repository.owner, repository.repo);
    const resource = await this.client.getResource(
      `/repos/${repoPath}/contents/${encodeFilePath(path)}?ref=${encodeURIComponent(revision)}`,
      'getRepositoryContent',
    );

    if (resource.status === 404) {
      return { status: 'UNAVAILABLE', reason: 'NOT_FOUND' };
    }

    if (Array.isArray(resource.body)) {
      // A directory response is a top-level array, not a file object.
      return { status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' };
    }

    const parsed = repositoryContentSchema.safeParse(resource.body);
    if (!parsed.success) {
      throw new GitHubResponseValidationError(
        'getRepositoryContent',
        parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
      );
    }
    const content = parsed.data;

    if (content.type !== 'file') {
      return { status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' };
    }
    if (content.encoding !== 'base64' || content.content === undefined) {
      // GitHub omits inline content above 1MB (encoding "none"); treated as unsupported.
      return { status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' };
    }

    let buffer: Buffer;
    try {
      buffer = decodeStrictBase64(content.content);
    } catch (error) {
      throw new GitHubResponseValidationError(
        'getRepositoryContent',
        `malformed base64 content: ${(error as Error).message}`,
      );
    }

    // The declared `size` is untrusted metadata; the decoded byte count is
    // the only authoritative figure for the size boundary.
    if (buffer.byteLength > this.maxFileContentBytes) {
      return { status: 'UNAVAILABLE', reason: 'OVERSIZED' };
    }

    // A NUL byte is valid UTF-8 (it decodes as U+0000) but never legitimately
    // appears in the supported source-file content this MVP analyzes, so it
    // is treated as a binary-content signal. Fatal UTF-8 decoding alone is
    // not a complete binary detector: it only rejects byte sequences that
    // are not valid UTF-8, and plenty of binary formats are valid UTF-8 by
    // coincidence (e.g. many contain NUL padding or control bytes that
    // still form valid UTF-8 code points). Both checks are required.
    if (buffer.includes(0)) {
      return { status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' };
    }

    let text: string;
    try {
      // Fatal decoding rejects invalid UTF-8 instead of silently inserting
      // U+FFFD replacement characters.
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return { status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' };
    }

    return { status: 'AVAILABLE', content: text };
  }
}

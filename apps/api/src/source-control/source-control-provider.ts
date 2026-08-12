/**
 * Provider-neutral Source Control Integration boundary.
 *
 * See docs/design/02-architecture.md (Source Control Integration) and
 * docs/design/05-context-retrieval.md (Source-Content Acquisition
 * Boundary). Concrete providers (e.g. GitHub) implement this interface;
 * the rest of the analysis workflow depends only on it.
 */

import type { NormalizedPullRequest } from '../domain/pull-request.js';

/** Identifies a repository independently of any provider-specific URL shape. */
export interface RepositoryRef {
  readonly owner: string;
  readonly repo: string;
}

/**
 * Why a requested file's content could not be returned as available text
 * (docs/design/04-candidate-discovery.md, Patch and Source-Content
 * Availability). Later stages convert this into a Coverage Limitation.
 */
export type FileContentUnavailableReason =
  | 'NOT_FOUND'
  | 'OVERSIZED'
  | 'UNSUPPORTED_CONTENT';

/**
 * The result of a bounded, on-demand selected-file retrieval. Absence is
 * always explicit: unavailable content is never represented as an empty
 * string.
 */
export type FileContentResult =
  | { readonly status: 'AVAILABLE'; readonly content: string }
  | {
      readonly status: 'UNAVAILABLE';
      readonly reason: FileContentUnavailableReason;
    };

/**
 * The minimum provider-neutral operations required by the approved M2
 * design (docs/design/02-architecture.md, Source Control Integration).
 */
export interface SourceControlProvider {
  /**
   * Retrieves eligible, normalized pull requests for a repository and
   * target branch (docs/design/02-architecture.md, Pull Request
   * Eligibility Selection). Only open, non-draft, actively approved pull
   * requests targeting `targetBranch` are returned.
   */
  getEligiblePullRequests(
    repository: RepositoryRef,
    targetBranch: string,
  ): Promise<readonly NormalizedPullRequest[]>;

  /**
   * Retrieves one selected repository file at one immutable revision
   * (docs/design/05-context-retrieval.md, Source-Content Acquisition
   * Boundary). This is bounded, on-demand retrieval, not repository-wide
   * download or indexing.
   */
  getFileContent(
    repository: RepositoryRef,
    path: string,
    revision: string,
  ): Promise<FileContentResult>;
}

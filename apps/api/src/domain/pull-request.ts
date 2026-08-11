/**
 * Provider-neutral pull request and changed-file contracts.
 *
 * These types represent pull request information after the Source Control
 * Integration has normalized it. The rest of the analysis workflow must not
 * depend on provider-specific (e.g. GitHub) response shapes.
 *
 * See docs/design/02-architecture.md (Source Control Integration) and
 * docs/design/04-candidate-discovery.md (Inputs).
 */

/**
 * How a file was affected by a pull request.
 *
 * Derived from planning/implementation-plan.md M2 verification scope
 * ("added, modified, deleted and renamed file cases").
 */
export type FileChangeType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'RENAMED';

/**
 * A single file changed by a pull request.
 *
 * `patch` is the provider-supplied diff hunk for this file. It may be
 * absent when the provider does not supply one, in which case a local diff
 * may later be constructed from retrieved file versions
 * (docs/design/04-candidate-discovery.md, Patch and Source-Content
 * Availability).
 */
export interface ChangedFile {
  readonly path: string;
  /** Present only for RENAMED files. */
  readonly previousPath?: string;
  readonly changeType: FileChangeType;
  readonly patch?: string;
}

/**
 * A pull request normalized to the shape the analysis workflow depends on,
 * independent of the source-control provider.
 */
export interface NormalizedPullRequest {
  readonly id: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly changedFiles: readonly ChangedFile[];
}

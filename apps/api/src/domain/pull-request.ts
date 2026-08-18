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
  /**
   * The immutable revision identifier of the pull request's source branch
   * at the time it was retrieved. Required so later stages (bounded
   * selected-file retrieval) can request repository content at the exact
   * revision this normalized pull request represents, without depending on
   * provider-specific pull-request identifiers (docs/design/02-architecture.md,
   * Source Control Integration; ADR-011).
   */
  readonly headRevision: string;
  /**
   * The immutable comparison-base revision used to identify what this pull
   * request introduces: the "before" counterpart to `headRevision`, needed
   * for bounded before/after file retrieval when a provider-supplied patch
   * is unavailable or insufficient (docs/design/04-candidate-discovery.md,
   * Resulting-Content Search; docs/design/02-architecture.md, Source
   * Control Integration; ADR-011).
   *
   * This is deliberately not the provider's recorded target-branch commit
   * for the pull request (GitHub's `base.sha`), which does not reliably
   * track the actual point of divergence once the target branch has
   * advanced. It is the actual merge-base commit of the source and target
   * branches as resolved by the provider at retrieval time. It does not
   * represent the target branch's current tip and does not imply
   * simulated-merge or mergeability analysis, which remain explicitly out
   * of scope (docs/design/02-architecture.md, Architectural Boundary;
   * ADR-004).
   */
  readonly changeBaseRevision: string;
  readonly changedFiles: readonly ChangedFile[];
}

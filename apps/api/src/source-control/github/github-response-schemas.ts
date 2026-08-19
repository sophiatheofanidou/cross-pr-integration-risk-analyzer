/**
 * Focused, adapter-local Zod schemas for the GitHub REST API responses
 * consumed by the M2 source-control integration.
 *
 * Each schema validates only the fields the adapter actually uses (P0.4 /
 * ADR-016). `z.object` strips unrecognized keys by default, so unrelated
 * GitHub response fields are tolerated but discarded rather than causing
 * validation failure. These types are adapter-local: the provider-neutral
 * domain contracts in ../../domain never import Zod.
 *
 * Verified against the official GitHub REST API documentation
 * (docs.github.com/en/rest) for API version 2026-03-10:
 * - List pull requests / Get a pull request,
 * - List reviews for a pull request,
 * - List pull requests files,
 * - Get repository content,
 * - Compare two commits.
 */

import { z } from 'zod';

/** The GitHub REST API version this adapter targets and sends on every request. */
export const GITHUB_API_VERSION = '2026-03-10';

/**
 * A pull request summary as returned by "List pull requests". `number` is
 * used (rather than the internal `id`) because it is also the identifier
 * required to call the reviews and files endpoints.
 */
export const pullRequestSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
});

export type GitHubPullRequestSummary = z.infer<typeof pullRequestSummarySchema>;

/**
 * The documented GitHub pull-request review states. Officially, `user` is
 * required-but-nullable (null for a deleted account) and `submitted_at` is
 * absent only for `PENDING` reviews, which is why it is modeled as
 * optional rather than nullable.
 */
export const reviewSchema = z.object({
  id: z.number(),
  user: z
    .object({
      id: z.number(),
      login: z.string(),
    })
    .nullable(),
  state: z.enum([
    'APPROVED',
    'CHANGES_REQUESTED',
    'COMMENTED',
    'DISMISSED',
    'PENDING',
  ]),
  submitted_at: z.string().optional(),
  commit_id: z.string().nullable(),
});

export type GitHubReview = z.infer<typeof reviewSchema>;

/**
 * The complete set of documented "List pull requests files" status values.
 * Only four have an approved MVP domain mapping; `copied`, `changed` and
 * `unchanged` are accepted here (so the schema does not reject a
 * documented response) but must fail explicitly during normalization
 * rather than receive an invented mapping.
 */
export const githubFileStatusSchema = z.enum([
  'added',
  'removed',
  'modified',
  'renamed',
  'copied',
  'changed',
  'unchanged',
]);

export type GitHubFileStatus = z.infer<typeof githubFileStatusSchema>;

export const changedFileSchema = z.object({
  filename: z.string(),
  status: githubFileStatusSchema,
  previous_filename: z.string().optional(),
  patch: z.string().optional(),
});

export type GitHubChangedFile = z.infer<typeof changedFileSchema>;

/**
 * "Get repository content" for a single file. Directory responses are a
 * top-level JSON array rather than an object matching this shape, so they
 * are rejected before this schema is applied. `content`/`encoding` are
 * absent when GitHub omits inline content (e.g. files between 1MB and
 * 100MB), which the adapter treats as unsupported rather than as empty
 * text.
 */
export const repositoryContentSchema = z.object({
  type: z.enum(['file', 'dir', 'symlink', 'submodule']),
  size: z.number(),
  encoding: z.string().optional(),
  content: z.string().optional(),
});

export type GitHubRepositoryContent = z.infer<typeof repositoryContentSchema>;

/**
 * "Compare two commits" (`GET /repos/{owner}/{repo}/compare/{basehead}`),
 * used only to obtain `merge_base_commit.sha`: GitHub pull requests use a
 * three-dot ("what does HEAD introduce relative to BASE") comparison, and
 * `merge_base_commit.sha` is the actual git merge-base of the two sides,
 * unlike the pull request's own `base.sha` (the provider's recorded
 * base-branch commit, which does not track the true merge-base once the
 * target branch has advanced). This schema intentionally validates nothing
 * else from the (much larger) compare response, including its own
 * `files`/`commits` arrays, which are capped by GitHub at 300 and 250
 * respectively and are not used here — changed-file metadata continues to
 * come from "List pull request files".
 */
export const compareCommitsSchema = z.object({
  merge_base_commit: z.object({
    sha: z.string(),
  }),
});

export type GitHubCompareCommits = z.infer<typeof compareCommitsSchema>;

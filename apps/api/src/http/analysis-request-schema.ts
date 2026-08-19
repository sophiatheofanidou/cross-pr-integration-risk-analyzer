/**
 * Zod validation for the `POST /api/analysis` HTTP request body
 * (M5 backend prompt, section 4).
 *
 * Accepts an HTTPS GitHub repository URL with exactly an owner and
 * repository path segment (a trailing slash is tolerated) and parses it
 * into the existing internal `RepositoryRef`. Unsupported hosts, a missing
 * owner or repository segment, extra path segments, query strings and
 * fragments are all rejected.
 */

import { z } from 'zod';
import type { RepositoryRef } from '../source-control/source-control-provider.js';

const GITHUB_HOSTNAME = 'github.com';
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+$/;

function parseGitHubRepositoryUrl(value: string): RepositoryRef | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== GITHUB_HOSTNAME ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0
  ) {
    return undefined;
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    return undefined;
  }

  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length !== 2) {
    return undefined;
  }

  const [owner, repo] = segments as [string, string];
  if (!GITHUB_OWNER_PATTERN.test(owner) || !GITHUB_REPOSITORY_PATTERN.test(repo)) {
    return undefined;
  }
  return { owner, repo };
}

export interface ParsedAnalysisRequest {
  readonly repository: RepositoryRef;
  readonly targetBranch: string;
}

export const analysisRequestSchema = z
  .object({
    repositoryUrl: z.string(),
    targetBranch: z.string().trim().min(1, 'targetBranch must not be empty'),
  })
  .strict()
  .transform((value, ctx): ParsedAnalysisRequest => {
    const repository = parseGitHubRepositoryUrl(value.repositoryUrl);
    if (repository === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'repositoryUrl must be an HTTPS GitHub repository URL with exactly an owner and repository path (e.g. https://github.com/owner/repo)',
        path: ['repositoryUrl'],
      });
      return z.NEVER;
    }
    return { repository, targetBranch: value.targetBranch };
  });

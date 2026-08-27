/**
 * GitHub HTTP client: request construction, `Link`-header pagination and
 * the HTTP/validation error boundary. GitHub-specific response shapes stay
 * out of this file; callers pass in a Zod schema per operation and receive
 * back parsed, focused items.
 *
 * See docs/design/02-architecture.md (Source Control Integration) and the
 * "Pagination" and "HTTP error behaviour" sections of the M2 implementation
 * brief. Uses the native `fetch` implementation available in the supported
 * Node.js runtime; a fetch implementation can be injected so tests never
 * make a live network request.
 */

import type { z } from 'zod';
import {
  elapsedMilliseconds,
  emitOperationalMetric,
  type OperationalMetricReporter,
} from '../../shared/operational-metrics.js';
import { GITHUB_API_VERSION } from './github-response-schemas.js';

export const DEFAULT_GITHUB_API_BASE_URL = 'https://api.github.com';

/**
 * A non-success GitHub HTTP response. The request URL contains no
 * credentials (the token is sent only as a header), so it is safe to
 * include for diagnostics.
 */
export class GitHubHttpError extends Error {
  readonly operation: string;
  readonly status: number;
  readonly url: string;

  constructor(operation: string, status: number, url: string) {
    super(`GitHub request failed for ${operation}: HTTP ${status} (${url})`);
    this.name = 'GitHubHttpError';
    this.operation = operation;
    this.status = status;
    this.url = url;
  }
}

/**
 * A GitHub response body that failed schema validation, or was not valid
 * JSON. Never includes the raw response body.
 */
export class GitHubResponseValidationError extends Error {
  readonly operation: string;

  constructor(operation: string, details: string) {
    super(`GitHub response validation failed for ${operation}: ${details}`);
    this.name = 'GitHubResponseValidationError';
    this.operation = operation;
  }
}

/** A pagination-specific failure: a cyclic or out-of-origin `next` link. */
export class GitHubPaginationError extends Error {
  readonly operation: string;

  constructor(operation: string, details: string) {
    super(`GitHub pagination failed for ${operation}: ${details}`);
    this.name = 'GitHubPaginationError';
    this.operation = operation;
  }
}

export interface GitHubClientConfig {
  /** Defaults to the public GitHub REST API origin. */
  readonly baseUrl?: string;
  readonly token?: string;
  /** Injected fetch implementation; defaults to the global Node.js fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Defaults to the current GitHub REST API version this adapter targets. */
  readonly apiVersion?: string;
  /** Optional sanitized metrics sink; disabled in production unless explicitly configured. */
  readonly reportOperationalMetric?: OperationalMetricReporter;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

function extractNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) {
    return undefined;
  }
  for (const part of linkHeader.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim());
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly allowedOrigin: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly apiVersion: string;
  private readonly reportOperationalMetric: OperationalMetricReporter | undefined;

  constructor(config: GitHubClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_GITHUB_API_BASE_URL;
    this.allowedOrigin = new URL(this.baseUrl).origin;
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.apiVersion = config.apiVersion ?? GITHUB_API_VERSION;
    this.reportOperationalMetric = config.reportOperationalMetric;
  }

  private async fetchResponse(url: string, operation: string): Promise<Response> {
    const startedAt = performance.now();
    try {
      const response = await this.fetchImpl(url, { headers: this.buildHeaders() });
      emitOperationalMetric(this.reportOperationalMetric, {
        event: 'github_request',
        operation,
        durationMs: elapsedMilliseconds(startedAt),
        outcome: 'COMPLETED',
        httpStatus: response.status,
      });
      return response;
    } catch (error) {
      emitOperationalMetric(this.reportOperationalMetric, {
        event: 'github_request',
        operation,
        durationMs: elapsedMilliseconds(startedAt),
        outcome: 'NETWORK_FAILURE',
        errorName: error instanceof Error ? error.name : 'UnknownNetworkError',
      });
      throw error;
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.apiVersion,
    };
    if (this.token !== undefined) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private resolveUrl(path: string): string {
    return new URL(path, `${this.baseUrl.replace(/\/$/, '')}/`).toString();
  }

  private async parseJsonBody(response: Response, operation: string): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new GitHubResponseValidationError(
        operation,
        'response body is not valid JSON',
      );
    }
  }

  /**
   * Retrieves every page of a GitHub list endpoint, following only the
   * `Link` header's `rel="next"` URL. Every page is validated with
   * `itemSchema` before its items are added to the result; a malformed
   * page, a cyclic next-link or a next-link outside the configured GitHub
   * API origin all fail the whole call rather than returning a partial
   * result.
   */
  async listAllPages<T>(
    path: string,
    itemSchema: z.ZodType<T>,
    operation: string,
  ): Promise<T[]> {
    const results: T[] = [];
    const seenUrls = new Set<string>();
    let url: string | undefined = this.resolveUrl(path);

    while (url !== undefined) {
      if (seenUrls.has(url)) {
        throw new GitHubPaginationError(
          operation,
          `cyclic next-page link detected: ${url}`,
        );
      }
      seenUrls.add(url);

      const response = await this.fetchResponse(url, operation);
      if (!response.ok) {
        throw new GitHubHttpError(operation, response.status, url);
      }

      const body = await this.parseJsonBody(response, operation);
      const parsed = itemSchema.array().safeParse(body);
      if (!parsed.success) {
        throw new GitHubResponseValidationError(
          operation,
          formatZodError(parsed.error),
        );
      }
      results.push(...parsed.data);

      const nextLink = extractNextLink(response.headers.get('link'));
      if (nextLink === undefined) {
        url = undefined;
        continue;
      }

      const resolvedNext = new URL(nextLink, url).toString();
      if (new URL(resolvedNext).origin !== this.allowedOrigin) {
        throw new GitHubPaginationError(
          operation,
          `next-page link outside the configured GitHub API origin: ${resolvedNext}`,
        );
      }
      url = resolvedNext;
    }

    return results;
  }

  /**
   * Retrieves and validates a single, non-paginated GitHub resource.
   * Unlike `getResource`, every non-success status (including `404`)
   * throws: this is for resources a caller needs in order to produce a
   * valid result at all (e.g. a pull request's comparison-base revision),
   * as opposed to resources whose absence is itself a legitimate outcome.
   */
  async getValidatedResource<T>(
    path: string,
    schema: z.ZodType<T>,
    operation: string,
  ): Promise<T> {
    const url = this.resolveUrl(path);
    const response = await this.fetchResponse(url, operation);
    if (!response.ok) {
      throw new GitHubHttpError(operation, response.status, url);
    }

    const body = await this.parseJsonBody(response, operation);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new GitHubResponseValidationError(operation, formatZodError(parsed.error));
    }
    return parsed.data;
  }

  /**
   * Retrieves a single resource. Returns a `404` status explicitly rather
   * than throwing, so callers that treat "not found" as a legitimate
   * outcome (e.g. selected file retrieval) do not need to catch an
   * exception for it. Every other non-success status throws.
   */
  async getResource(
    path: string,
    operation: string,
  ): Promise<{ readonly status: number; readonly body: unknown }> {
    const url = this.resolveUrl(path);
    const response = await this.fetchResponse(url, operation);

    if (response.status === 404) {
      return { status: 404, body: undefined };
    }
    if (!response.ok) {
      throw new GitHubHttpError(operation, response.status, url);
    }

    const body = await this.parseJsonBody(response, operation);
    return { status: response.status, body };
  }
}

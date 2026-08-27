import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  GitHubClient,
  GitHubHttpError,
  GitHubPaginationError,
  GitHubResponseValidationError,
} from './github-client.js';

const itemSchema = z.object({ id: z.number() });

function jsonResponse(
  body: unknown,
  init: { status?: number; link?: string } = {},
): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.link !== undefined) {
    headers['link'] = init.link;
  }
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

describe('GitHubClient.listAllPages', () => {
  it('reports sanitized timing and status for each HTTP request', async () => {
    const metrics: unknown[] = [];
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }]));
    const client = new GitHubClient({
      fetchImpl,
      token: 'must-not-appear',
      reportOperationalMetric: (metric) => metrics.push(metric),
    });

    await client.listAllPages('/repos/private/repository/pulls', itemSchema, 'listPullRequests');

    expect(metrics).toEqual([expect.objectContaining({
      event: 'github_request',
      operation: 'listPullRequests',
      outcome: 'COMPLETED',
      httpStatus: 200,
      durationMs: expect.any(Number),
    })]);
    expect(JSON.stringify(metrics)).not.toContain('must-not-appear');
    expect(JSON.stringify(metrics)).not.toContain('/repos/private/repository');
  });

  it('reports a bounded network failure without logging the failing URL', async () => {
    const metrics: unknown[] = [];
    const fetchImpl = vi.fn(async () => { throw new TypeError('secret network details'); });
    const client = new GitHubClient({
      fetchImpl,
      reportOperationalMetric: (metric) => metrics.push(metric),
    });

    await expect(
      client.listAllPages('/repos/private/repository/pulls', itemSchema, 'listPullRequests'),
    ).rejects.toThrow(TypeError);
    expect(metrics).toEqual([expect.objectContaining({
      event: 'github_request',
      operation: 'listPullRequests',
      outcome: 'NETWORK_FAILURE',
      errorName: 'TypeError',
    })]);
    expect(JSON.stringify(metrics)).not.toContain('secret network details');
    expect(JSON.stringify(metrics)).not.toContain('/repos/private/repository');
  });

  it('returns the items of a single page when no Link header is present', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }, { id: 2 }]));
    const client = new GitHubClient({ fetchImpl });

    const result = await client.listAllPages('/repos/o/r/pulls', itemSchema, 'listPullRequests');

    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('follows rel="next" links and combines pages in order', async () => {
    const page1Url = 'https://api.github.com/repos/o/r/pulls?page=1';
    const page2Url = 'https://api.github.com/repos/o/r/pulls?page=2';
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === page1Url) {
        return jsonResponse([{ id: 1 }], { link: `<${page2Url}>; rel="next"` });
      }
      if (url === page2Url) {
        return jsonResponse([{ id: 2 }]);
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new GitHubClient({ fetchImpl });

    const result = await client.listAllPages(
      '/repos/o/r/pulls?page=1',
      itemSchema,
      'listPullRequests',
    );

    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('fails rather than returning a partial result when a later page is malformed', async () => {
    const page1Url = 'https://api.github.com/repos/o/r/pulls?page=1';
    const page2Url = 'https://api.github.com/repos/o/r/pulls?page=2';
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === page1Url) {
        return jsonResponse([{ id: 1 }], { link: `<${page2Url}>; rel="next"` });
      }
      return jsonResponse([{ id: 'not-a-number' }]);
    });
    const client = new GitHubClient({ fetchImpl });

    await expect(
      client.listAllPages('/repos/o/r/pulls?page=1', itemSchema, 'listPullRequests'),
    ).rejects.toThrow(GitHubResponseValidationError);
  });

  it('rejects a cyclic next-page link', async () => {
    const url = 'https://api.github.com/repos/o/r/pulls?page=1';
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ id: 1 }], { link: `<${url}>; rel="next"` }),
    );
    const client = new GitHubClient({ fetchImpl });

    await expect(
      client.listAllPages('/repos/o/r/pulls?page=1', itemSchema, 'listPullRequests'),
    ).rejects.toThrow(GitHubPaginationError);
  });

  it('rejects a next-page link outside the configured GitHub API origin', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ id: 1 }], {
        link: '<https://evil.example.com/repos/o/r/pulls?page=2>; rel="next"',
      }),
    );
    const client = new GitHubClient({ fetchImpl });

    await expect(
      client.listAllPages('/repos/o/r/pulls', itemSchema, 'listPullRequests'),
    ).rejects.toThrow(GitHubPaginationError);
  });

  it('throws GitHubHttpError with status and no live network access for non-success responses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'Not Found' }, { status: 404 }));
    const client = new GitHubClient({ fetchImpl });

    await expect(
      client.listAllPages('/repos/o/r/pulls', itemSchema, 'listPullRequests'),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never invokes the injected fetch with a real network call outside the fake', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([]));
    const client = new GitHubClient({ fetchImpl, token: 'super-secret-token' });

    await client.listAllPages('/repos/o/r/pulls', itemSchema, 'listPullRequests');

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const requestInit = call?.[1];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer super-secret-token');
  });
});

describe('GitHubClient.getResource', () => {
  it('returns status 404 rather than throwing for a missing resource', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const client = new GitHubClient({ fetchImpl });

    const result = await client.getResource('/repos/o/r/contents/missing.ts', 'getRepositoryContent');

    expect(result).toEqual({ status: 404, body: undefined });
  });

  it('throws GitHubHttpError for other non-success statuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const client = new GitHubClient({ fetchImpl });

    await expect(
      client.getResource('/repos/o/r/contents/file.ts', 'getRepositoryContent'),
    ).rejects.toThrow(GitHubHttpError);
  });

  it('returns the parsed body for a success response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ type: 'file' }));
    const client = new GitHubClient({ fetchImpl });

    const result = await client.getResource('/repos/o/r/contents/file.ts', 'getRepositoryContent');

    expect(result).toEqual({ status: 200, body: { type: 'file' } });
  });
});

describe('GitHubClient.getValidatedResource', () => {
  it('returns the validated body for a success response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 1, extra: 'ignored' }));
    const client = new GitHubClient({ fetchImpl });

    const result = await client.getValidatedResource(
      '/repos/o/r/compare/a...b',
      itemSchema,
      'compareCommits',
    );

    expect(result).toEqual({ id: 1 });
  });

  it('throws GitHubHttpError for a 404, unlike getResource', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const client = new GitHubClient({ fetchImpl });

    await expect(
      client.getValidatedResource('/repos/o/r/compare/a...b', itemSchema, 'compareCommits'),
    ).rejects.toThrow(GitHubHttpError);
  });

  it('throws GitHubResponseValidationError for a malformed body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'not-a-number' }));
    const client = new GitHubClient({ fetchImpl });

    await expect(
      client.getValidatedResource('/repos/o/r/compare/a...b', itemSchema, 'compareCommits'),
    ).rejects.toThrow(GitHubResponseValidationError);
  });
});

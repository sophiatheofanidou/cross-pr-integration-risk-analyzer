import { describe, expect, it, vi } from 'vitest';
import {
  GITHUB_MAX_PULL_REQUEST_FILES,
  GitHubPullRequestFileLimitExceededError,
  GitHubSourceControlProvider,
  mapFileChangeType,
  normalizeChangedFile,
} from './github-source-control-provider.js';
import { GitHubResponseValidationError } from './github-client.js';
import type { GitHubChangedFile } from './github-response-schemas.js';

function jsonResponse(
  body: unknown,
  init: { status?: number; link?: string } = {},
): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.link !== undefined) {
    headers['link'] = init.link;
  }
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

describe('normalizeChangedFile', () => {
  const base: GitHubChangedFile = { filename: 'src/file.ts', status: 'added' };

  it('normalizes an added file', () => {
    expect(normalizeChangedFile(base)).toEqual({
      path: 'src/file.ts',
      changeType: 'ADDED',
    });
  });

  it('normalizes a modified file', () => {
    expect(normalizeChangedFile({ ...base, status: 'modified' })).toEqual({
      path: 'src/file.ts',
      changeType: 'MODIFIED',
    });
  });

  it('normalizes a removed file to DELETED', () => {
    expect(normalizeChangedFile({ ...base, status: 'removed' })).toEqual({
      path: 'src/file.ts',
      changeType: 'DELETED',
    });
  });

  it('normalizes a renamed file and preserves the previous path', () => {
    expect(
      normalizeChangedFile({
        filename: 'src/new-name.ts',
        status: 'renamed',
        previous_filename: 'src/old-name.ts',
      }),
    ).toEqual({
      path: 'src/new-name.ts',
      changeType: 'RENAMED',
      previousPath: 'src/old-name.ts',
    });
  });

  it('keeps a missing patch absent rather than an empty string', () => {
    const result = normalizeChangedFile(base);
    expect(result.patch).toBeUndefined();
    expect('patch' in result ? result.patch : undefined).not.toBe('');
  });

  it('preserves a present patch', () => {
    const result = normalizeChangedFile({ ...base, patch: '@@ -1 +1 @@' });
    expect(result.patch).toBe('@@ -1 +1 @@');
  });

  it('fails explicitly for a documented status with no approved domain mapping', () => {
    expect(() => mapFileChangeType('copied')).toThrow(/no approved MVP domain mapping/);
    expect(() => mapFileChangeType('changed')).toThrow();
    expect(() => mapFileChangeType('unchanged')).toThrow();
  });

  it('fails explicitly when GitHub reports a renamed file without a previous filename', () => {
    expect(() =>
      normalizeChangedFile({ filename: 'src/new-name.ts', status: 'renamed' }),
    ).toThrow(/renamed file .* without a previous_filename/);
  });

  it('never leaks a previous filename into a non-renamed normalized file', () => {
    // GitHub only documents `previous_filename` for `renamed`/`copied`, but the
    // schema does not forbid it on other statuses; normalization must not
    // pass it through regardless.
    const result = normalizeChangedFile({
      filename: 'src/file.ts',
      status: 'modified',
      previous_filename: 'src/should-not-appear.ts',
    });

    expect(result).toEqual({ path: 'src/file.ts', changeType: 'MODIFIED' });
    expect('previousPath' in result).toBe(false);
  });
});

describe('GitHubSourceControlProvider.getFileContent', () => {
  it('returns available text content for a valid base64 file', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from('export const x = 1;').toString('base64'),
        size: 20,
      }),
    );
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'src/a.ts', 'sha1');

    expect(result).toEqual({ status: 'AVAILABLE', content: 'export const x = 1;' });
  });

  it('reports a 404 as unavailable/NOT_FOUND rather than an empty file', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'missing.ts', 'sha1');

    expect(result).toEqual({ status: 'UNAVAILABLE', reason: 'NOT_FOUND' });
  });

  it('rejects a malformed content payload rather than treating it as available', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ type: 'file' }));
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    await expect(
      provider.getFileContent({ owner: 'o', repo: 'r' }, 'a.ts', 'sha1'),
    ).rejects.toThrow(GitHubResponseValidationError);
  });

  it('marks a file whose decoded content exceeds the configured size boundary as UNAVAILABLE/OVERSIZED', async () => {
    const actualContent = 'x'.repeat(10);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(actualContent).toString('base64'),
        size: actualContent.length,
      }),
    );
    const provider = new GitHubSourceControlProvider({
      client: { fetchImpl },
      maxFileContentBytes: 5,
    });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'big.ts', 'sha1');

    expect(result).toEqual({ status: 'UNAVAILABLE', reason: 'OVERSIZED' });
  });

  it('marks a file as OVERSIZED using the decoded byte count even when the declared size understates it', async () => {
    const actualContent = 'x'.repeat(20);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(actualContent).toString('base64'),
        // Declared size lies and claims to be within the limit.
        size: 1,
      }),
    );
    const provider = new GitHubSourceControlProvider({
      client: { fetchImpl },
      maxFileContentBytes: 5,
    });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'big.ts', 'sha1');

    expect(result).toEqual({ status: 'UNAVAILABLE', reason: 'OVERSIZED' });
  });

  it('marks a NUL byte as UNAVAILABLE/UNSUPPORTED_CONTENT even though it is otherwise valid UTF-8', async () => {
    // 0x00 (NUL) decodes successfully as U+0000 under strict UTF-8, so this
    // payload would pass fatal UTF-8 decoding on its own; the explicit NUL
    // check is what must catch it.
    const binaryWithNulOnly = Buffer.from([0x00, 0x41, 0x42]);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: binaryWithNulOnly.toString('base64'),
        size: binaryWithNulOnly.byteLength,
      }),
    );
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'image.png', 'sha1');

    expect(result).toEqual({ status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' });
  });

  it('rejects invalid UTF-8 rather than silently inserting replacement characters', async () => {
    // A lone continuation byte: not NUL, so an older NUL-only heuristic would
    // have missed it, but it is not valid UTF-8 on its own.
    const invalidUtf8 = Buffer.from([0x80, 0x41, 0x42]);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: invalidUtf8.toString('base64'),
        size: invalidUtf8.byteLength,
      }),
    );
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'a.ts', 'sha1');

    expect(result).toEqual({ status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' });
  });

  it('rejects structurally malformed base64 content', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: 'not-valid-base64!!!',
        size: 19,
      }),
    );
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    await expect(
      provider.getFileContent({ owner: 'o', repo: 'r' }, 'a.ts', 'sha1'),
    ).rejects.toThrow(GitHubResponseValidationError);
  });

  it('accepts base64 content wrapped with legitimate whitespace/line wrapping', async () => {
    const raw = Buffer.from('export const x = 1;\nexport const y = 2;').toString('base64');
    // GitHub wraps base64 content across lines.
    const wrapped = `${raw.slice(0, 20)}\n${raw.slice(20)}\n`;
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: wrapped,
        size: raw.length,
      }),
    );
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'a.ts', 'sha1');

    expect(result).toEqual({
      status: 'AVAILABLE',
      content: 'export const x = 1;\nexport const y = 2;',
    });
  });

  it('marks a directory response as UNAVAILABLE/UNSUPPORTED_CONTENT rather than as a file', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ type: 'file', name: 'a.ts', size: 1 }]),
    );
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'src', 'sha1');

    expect(result).toEqual({ status: 'UNAVAILABLE', reason: 'UNSUPPORTED_CONTENT' });
  });

  it('never represents unavailable content as an empty string', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getFileContent({ owner: 'o', repo: 'r' }, 'missing.ts', 'sha1');

    expect(result.status).toBe('UNAVAILABLE');
    expect((result as { content?: string }).content).toBeUndefined();
  });
});

describe('GitHubSourceControlProvider.getEligiblePullRequests (adapter integration boundary)', () => {
  it('retrieves paginated PRs, applies review-based eligibility, fetches files only for eligible PRs and returns normalized output', async () => {
    const calls: string[] = [];

    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      calls.push(url);

      // Page 1 of pull requests: PR #1 (will be approved+eligible) and PR #2 (draft).
      if (url === 'https://api.github.com/repos/o/r/pulls?state=open&base=main&per_page=100') {
        return jsonResponse(
          [
            {
              number: 1,
              title: 'Add payment authorization',
              html_url: 'https://github.com/o/r/pull/1',
              state: 'open',
              draft: false,
              head: { ref: 'feature/one', sha: 'sha-1' },
              base: { ref: 'main', sha: 'base-sha' },
            },
            {
              number: 2,
              title: 'Draft: work in progress',
              html_url: 'https://github.com/o/r/pull/2',
              state: 'open',
              draft: true,
              head: { ref: 'feature/two', sha: 'sha-2' },
              base: { ref: 'main', sha: 'base-sha' },
            },
          ],
          { link: '<https://api.github.com/repos/o/r/pulls?state=open&base=main&per_page=100&page=2>; rel="next"' },
        );
      }

      // Page 2 of pull requests: PR #3 (changes requested, ineligible).
      if (
        url ===
        'https://api.github.com/repos/o/r/pulls?state=open&base=main&per_page=100&page=2'
      ) {
        return jsonResponse([
          {
            number: 3,
            title: 'Changes requested PR',
            html_url: 'https://github.com/o/r/pull/3',
            state: 'open',
            draft: false,
            head: { ref: 'feature/three', sha: 'sha-3' },
            base: { ref: 'main', sha: 'base-sha' },
          },
        ]);
      }

      // Reviews for PR #1: one active approval.
      if (url === 'https://api.github.com/repos/o/r/pulls/1/reviews?per_page=100') {
        return jsonResponse([
          {
            id: 11,
            user: { id: 100, login: 'reviewer-a' },
            state: 'APPROVED',
            submitted_at: '2026-01-01T00:00:00Z',
            commit_id: 'sha-1',
          },
        ]);
      }

      // Reviews for PR #3: active changes-requested.
      if (url === 'https://api.github.com/repos/o/r/pulls/3/reviews?per_page=100') {
        return jsonResponse([
          {
            id: 31,
            user: { id: 200, login: 'reviewer-b' },
            state: 'CHANGES_REQUESTED',
            submitted_at: '2026-01-02T00:00:00Z',
            commit_id: 'sha-3',
          },
        ]);
      }

      // Compare for PR #1 (the only eligible PR): the merge-base differs
      // from base.sha because the target-side commit and the branches'
      // common comparison base are distinct concepts.
      if (url === 'https://api.github.com/repos/o/r/compare/base-sha...sha-1') {
        return jsonResponse({
          status: 'ahead',
          merge_base_commit: { sha: 'merge-base-sha' },
        });
      }

      // Changed files for PR #1 only (the only eligible PR).
      if (url === 'https://api.github.com/repos/o/r/pulls/1/files?per_page=100') {
        return jsonResponse([
          { filename: 'src/payment.service.ts', status: 'modified', patch: '@@ -1 +1 @@' },
          { filename: 'src/new-file.ts', status: 'added' },
        ]);
      }

      throw new Error(`unexpected request in test: ${url}`);
    });

    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    const result = await provider.getEligiblePullRequests({ owner: 'o', repo: 'r' }, 'main');

    expect(result).toEqual([
      {
        id: '1',
        title: 'Add payment authorization',
        webUrl: 'https://github.com/o/r/pull/1',
        sourceBranch: 'feature/one',
        targetBranch: 'main',
        headRevision: 'sha-1',
        // Uses the validated comparison-base SHA from the Compare API
        // (merge_base_commit.sha), not the PR summary's base.sha.
        changeBaseRevision: 'merge-base-sha',
        changedFiles: [
          { path: 'src/payment.service.ts', changeType: 'MODIFIED', patch: '@@ -1 +1 @@' },
          { path: 'src/new-file.ts', changeType: 'ADDED' },
        ],
      },
    ]);
    expect(result[0]?.changeBaseRevision).not.toBe('base-sha');

    // Draft PR #2 must never trigger a reviews, compare or files request.
    expect(calls.some((url) => url.includes('/pulls/2/'))).toBe(false);
    expect(calls.some((url) => url.includes('/compare/base-sha...sha-2'))).toBe(false);
    // Ineligible PR #3 (active changes-requested) must never trigger a
    // compare or files request.
    expect(calls.some((url) => url.includes('/compare/base-sha...sha-3'))).toBe(false);
    expect(calls.some((url) => url.includes('/pulls/3/files'))).toBe(false);
  });

  it('fails explicitly rather than silently truncating when the file count hits GitHub\'s documented cap', async () => {
    const cappedFiles = Array.from({ length: GITHUB_MAX_PULL_REQUEST_FILES }, (_, index) => ({
      filename: `src/file-${index}.ts`,
      status: 'modified',
    }));

    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();

      if (url === 'https://api.github.com/repos/o/r/pulls?state=open&base=main&per_page=100') {
        return jsonResponse([
          {
            number: 1,
            title: 'Huge PR',
            html_url: 'https://github.com/o/r/pull/1',
            state: 'open',
            draft: false,
            head: { ref: 'feature/huge', sha: 'sha-1' },
            base: { ref: 'main', sha: 'base-sha' },
          },
        ]);
      }
      if (url === 'https://api.github.com/repos/o/r/pulls/1/reviews?per_page=100') {
        return jsonResponse([
          {
            id: 11,
            user: { id: 100, login: 'reviewer-a' },
            state: 'APPROVED',
            submitted_at: '2026-01-01T00:00:00Z',
            commit_id: 'sha-1',
          },
        ]);
      }
      if (url === 'https://api.github.com/repos/o/r/compare/base-sha...sha-1') {
        return jsonResponse({ status: 'ahead', merge_base_commit: { sha: 'merge-base-sha' } });
      }
      if (url === 'https://api.github.com/repos/o/r/pulls/1/files?per_page=100') {
        return jsonResponse(cappedFiles);
      }

      throw new Error(`unexpected request in test: ${url}`);
    });

    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    await expect(
      provider.getEligiblePullRequests({ owner: 'o', repo: 'r' }, 'main'),
    ).rejects.toThrow(GitHubPullRequestFileLimitExceededError);
  });

  it('rejects malformed Compare API data rather than producing a pull request with an invalid comparison base', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();

      if (url === 'https://api.github.com/repos/o/r/pulls?state=open&base=main&per_page=100') {
        return jsonResponse([
          {
            number: 1,
            title: 'Add payment authorization',
            html_url: 'https://github.com/o/r/pull/1',
            state: 'open',
            draft: false,
            head: { ref: 'feature/one', sha: 'sha-1' },
            base: { ref: 'main', sha: 'base-sha' },
          },
        ]);
      }
      if (url === 'https://api.github.com/repos/o/r/pulls/1/reviews?per_page=100') {
        return jsonResponse([
          {
            id: 11,
            user: { id: 100, login: 'reviewer-a' },
            state: 'APPROVED',
            submitted_at: '2026-01-01T00:00:00Z',
            commit_id: 'sha-1',
          },
        ]);
      }
      if (url === 'https://api.github.com/repos/o/r/compare/base-sha...sha-1') {
        // Missing merge_base_commit.sha entirely.
        return jsonResponse({ status: 'ahead', merge_base_commit: {} });
      }

      throw new Error(`unexpected request in test: ${url}`);
    });

    const provider = new GitHubSourceControlProvider({ client: { fetchImpl } });

    await expect(
      provider.getEligiblePullRequests({ owner: 'o', repo: 'r' }, 'main'),
    ).rejects.toThrow(GitHubResponseValidationError);

    // A malformed compare response must fail before the files endpoint is
    // ever requested for this pull request.
    expect(fetchImpl.mock.calls.some((call) => call[0]?.toString().includes('/pulls/1/files'))).toBe(
      false,
    );
  });
});

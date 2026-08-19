import { describe, expect, it } from 'vitest';
import { analysisRequestSchema } from './analysis-request-schema.js';

describe('analysisRequestSchema', () => {
  it('accepts a valid HTTPS GitHub repository URL and a target branch, parsing owner/repo', () => {
    const parsed = analysisRequestSchema.safeParse({
      repositoryUrl: 'https://github.com/acme/payments-platform',
      targetBranch: 'development',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        repository: { owner: 'acme', repo: 'payments-platform' },
        targetBranch: 'development',
      });
    }
  });

  it('accepts a trailing slash on the repository path', () => {
    const parsed = analysisRequestSchema.safeParse({
      repositoryUrl: 'https://github.com/acme/payments-platform/',
      targetBranch: 'main',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.repository).toEqual({ owner: 'acme', repo: 'payments-platform' });
    }
  });

  it('trims a target branch surrounded by whitespace', () => {
    const parsed = analysisRequestSchema.safeParse({
      repositoryUrl: 'https://github.com/acme/payments-platform',
      targetBranch: '  main  ',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.targetBranch).toBe('main');
    }
  });

  it('rejects an empty or whitespace-only target branch', () => {
    expect(
      analysisRequestSchema.safeParse({
        repositoryUrl: 'https://github.com/acme/payments-platform',
        targetBranch: '',
      }).success,
    ).toBe(false);
    expect(
      analysisRequestSchema.safeParse({
        repositoryUrl: 'https://github.com/acme/payments-platform',
        targetBranch: '   ',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing target branch', () => {
    expect(
      analysisRequestSchema.safeParse({
        repositoryUrl: 'https://github.com/acme/payments-platform',
      }).success,
    ).toBe(false);
  });

  it.each([
    ['an unsupported host', 'https://gitlab.com/acme/payments-platform'],
    ['a plain HTTP URL', 'http://github.com/acme/payments-platform'],
    ['a missing repository segment', 'https://github.com/acme'],
    ['a missing owner and repository segment', 'https://github.com/'],
    ['an extra path segment', 'https://github.com/acme/payments-platform/tree/main'],
    ['a query string', 'https://github.com/acme/payments-platform?tab=readme'],
    ['a fragment', 'https://github.com/acme/payments-platform#readme'],
    ['embedded credentials', 'https://user:secret@github.com/acme/payments-platform'],
    ['a non-default port', 'https://github.com:444/acme/payments-platform'],
    ['an encoded path separator', 'https://github.com/acme%2Fother/payments-platform'],
    ['a non-URL string', 'not a url'],
    ['an empty string', ''],
  ])('rejects %s', (_description, repositoryUrl) => {
    const parsed = analysisRequestSchema.safeParse({ repositoryUrl, targetBranch: 'main' });
    expect(parsed.success).toBe(false);
  });

  it('reports the repositoryUrl issue on the repositoryUrl path', () => {
    const parsed = analysisRequestSchema.safeParse({
      repositoryUrl: 'https://gitlab.com/acme/payments-platform',
      targetBranch: 'main',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'repositoryUrl')).toBe(true);
    }
  });

  it('rejects unexpected request properties', () => {
    const parsed = analysisRequestSchema.safeParse({
      repositoryUrl: 'https://github.com/acme/payments-platform',
      targetBranch: 'development',
      unexpected: true,
    });

    expect(parsed.success).toBe(false);
  });
});

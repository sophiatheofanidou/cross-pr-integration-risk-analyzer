import { describe, expect, it } from 'vitest';
import {
  changedFileSchema,
  compareCommitsSchema,
  pullRequestSummarySchema,
  repositoryContentSchema,
  reviewSchema,
} from './github-response-schemas.js';

describe('pullRequestSummarySchema', () => {
  it('accepts a valid focused payload and strips unrelated fields', () => {
    const result = pullRequestSummarySchema.parse({
      number: 42,
      state: 'open',
      draft: false,
      head: { ref: 'feature/x', sha: 'abc123', label: 'octocat:feature/x' },
      base: { ref: 'main', sha: 'def456' },
      title: 'Unrelated field the adapter does not use',
      url: 'https://api.github.com/repos/o/r/pulls/42',
    });

    expect(result).toEqual({
      number: 42,
      state: 'open',
      draft: false,
      head: { ref: 'feature/x', sha: 'abc123' },
      base: { ref: 'main', sha: 'def456' },
    });
    expect(result).not.toHaveProperty('title');
    expect((result.head as Record<string, unknown>)).not.toHaveProperty('label');
  });

  it('rejects a malformed payload and reports the failing path', () => {
    const parsed = pullRequestSummarySchema.safeParse({
      number: 42,
      state: 'open',
      draft: false,
      head: { ref: 'feature/x' },
      base: { ref: 'main', sha: 'def456' },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'head.sha')).toBe(true);
    }
  });
});

describe('reviewSchema', () => {
  it('accepts a valid review', () => {
    const result = reviewSchema.parse({
      id: 1,
      user: { id: 7, login: 'octocat' },
      state: 'APPROVED',
      submitted_at: '2026-01-01T00:00:00Z',
      commit_id: 'abc123',
    });

    expect(result.state).toBe('APPROVED');
  });

  it('treats a null user as documented (deleted account) rather than rejecting the review', () => {
    const result = reviewSchema.parse({
      id: 1,
      user: null,
      state: 'APPROVED',
      submitted_at: '2026-01-01T00:00:00Z',
      commit_id: 'abc123',
    });

    expect(result.user).toBeNull();
  });

  it('accepts a PENDING review without submitted_at', () => {
    const result = reviewSchema.parse({
      id: 1,
      user: { id: 7, login: 'octocat' },
      state: 'PENDING',
      commit_id: null,
    });

    expect(result.submitted_at).toBeUndefined();
  });

  it('rejects an unrecognized review state', () => {
    const parsed = reviewSchema.safeParse({
      id: 1,
      user: { id: 7, login: 'octocat' },
      state: 'SOMETHING_ELSE',
      commit_id: null,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('changedFileSchema', () => {
  it('accepts an added file without a previous filename or patch', () => {
    const result = changedFileSchema.parse({
      filename: 'src/new.ts',
      status: 'added',
      additions: 10,
      deletions: 0,
    });

    expect(result.previous_filename).toBeUndefined();
    expect(result.patch).toBeUndefined();
  });

  it('accepts a renamed file with a previous filename', () => {
    const result = changedFileSchema.parse({
      filename: 'src/renamed.ts',
      status: 'renamed',
      previous_filename: 'src/old.ts',
    });

    expect(result.previous_filename).toBe('src/old.ts');
  });

  it('preserves a missing patch as undefined rather than an empty string', () => {
    const result = changedFileSchema.parse({
      filename: 'src/file.ts',
      status: 'modified',
    });

    expect(result.patch).toBeUndefined();
    expect(result.patch).not.toBe('');
  });

  it('accepts a documented status with no approved domain mapping (rejected later at normalization)', () => {
    const parsed = changedFileSchema.safeParse({
      filename: 'src/file.ts',
      status: 'unchanged',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects an undocumented status value', () => {
    const parsed = changedFileSchema.safeParse({
      filename: 'src/file.ts',
      status: 'not-a-real-status',
    });

    expect(parsed.success).toBe(false);
  });
});

describe('repositoryContentSchema', () => {
  it('accepts a valid base64 file content payload', () => {
    const result = repositoryContentSchema.parse({
      type: 'file',
      encoding: 'base64',
      content: 'aGVsbG8=',
      size: 5,
      sha: 'abc123',
      name: 'file.ts',
    });

    expect(result.encoding).toBe('base64');
  });

  it('accepts a response with content omitted (large-file case)', () => {
    const result = repositoryContentSchema.parse({
      type: 'file',
      size: 5_000_000,
    });

    expect(result.content).toBeUndefined();
    expect(result.encoding).toBeUndefined();
  });

  it('rejects a malformed payload missing required fields', () => {
    const parsed = repositoryContentSchema.safeParse({
      type: 'file',
    });

    expect(parsed.success).toBe(false);
  });
});

describe('compareCommitsSchema', () => {
  it('extracts merge_base_commit.sha and tolerates the much larger unused response fields', () => {
    const result = compareCommitsSchema.parse({
      status: 'ahead',
      ahead_by: 3,
      behind_by: 0,
      merge_base_commit: {
        sha: 'merge-base-sha',
        commit: { message: 'irrelevant' },
      },
      base_commit: { sha: 'base-sha' },
      commits: [{ sha: 'c1' }],
      files: [{ filename: 'a.ts', status: 'modified' }],
    });

    expect(result).toEqual({ merge_base_commit: { sha: 'merge-base-sha' } });
  });

  it('rejects a payload missing merge_base_commit.sha', () => {
    const parsed = compareCommitsSchema.safeParse({
      status: 'ahead',
      merge_base_commit: { commit: { message: 'no sha here' } },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a payload missing merge_base_commit entirely', () => {
    const parsed = compareCommitsSchema.safeParse({ status: 'ahead' });

    expect(parsed.success).toBe(false);
  });
});

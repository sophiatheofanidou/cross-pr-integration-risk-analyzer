import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { FakeSourceControlProvider } from './__fixtures__/fake-source-control-provider.js';
import { prepareChangedFile, type ContentCache } from './prepare-changed-file.js';

const repository = { owner: 'o', repo: 'r' };
const analyzer = new TypeScriptStructuralAnalyzer();

function pullRequest(): NormalizedPullRequest {
  return {
    id: 'pr-1',
    sourceBranch: 'feature/x',
    targetBranch: 'main',
    headRevision: 'head-sha',
    changeBaseRevision: 'base-sha',
    changedFiles: [],
  };
}

describe('prepareChangedFile', () => {
  it('treats an added file as fully changed content without requesting a before version', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('head-sha', 'src/new.ts', 'export function processPayment(amount: number) { return amount; }\n');
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/new.ts', changeType: 'ADDED' },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(result.kind).toBe('PREPARED');
    if (result.kind === 'PREPARED') {
      expect(result.facts.changedTerms.map((t) => t.technicalTerm)).toContain('processPayment');
    }
    expect(provider.requestedKeys).toEqual(['head-sha::src/new.ts']);
  });

  it('prefers a usable provider patch and does not request the before revision', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile(
      'head-sha',
      'src/payment.service.ts',
      'function processPayment(amount) {\n  return authorizeAndCapture(amount);\n}\n',
    );
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      {
        path: 'src/payment.service.ts',
        changeType: 'MODIFIED',
        patch: '@@ -1,3 +1,3 @@\n function processPayment(amount) {\n-  return charge(amount);\n+  return authorizeAndCapture(amount);\n }',
      },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(result.kind).toBe('PREPARED');
    if (result.kind === 'PREPARED') {
      expect(result.facts.changedTerms.map((t) => t.technicalTerm)).toContain('authorizeAndCapture');
    }
    // Only the resulting (after) content should have been requested.
    expect(provider.requestedKeys).toEqual(['head-sha::src/payment.service.ts']);
  });

  it('falls back to local diff reconstruction when the patch is missing', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('base-sha', 'src/payment.service.ts', 'function processPayment(amount) {\n  return charge(amount);\n}\n');
    provider.setFile(
      'head-sha',
      'src/payment.service.ts',
      'function processPayment(amount) {\n  return authorizeAndCapture(amount);\n}\n',
    );
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/payment.service.ts', changeType: 'MODIFIED' },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(result.kind).toBe('PREPARED');
    if (result.kind === 'PREPARED') {
      expect(result.facts.changedTerms.map((t) => t.technicalTerm)).toContain('authorizeAndCapture');
    }
    expect(provider.requestedKeys.sort()).toEqual(
      ['base-sha::src/payment.service.ts', 'head-sha::src/payment.service.ts'].sort(),
    );
  });

  it('falls back to local diff reconstruction when the patch is insufficient (truncated)', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('base-sha', 'src/payment.service.ts', 'function processPayment(amount) {\n  return charge(amount);\n}\n');
    provider.setFile(
      'head-sha',
      'src/payment.service.ts',
      'function processPayment(amount) {\n  return authorizeAndCapture(amount);\n}\n',
    );
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      {
        path: 'src/payment.service.ts',
        changeType: 'MODIFIED',
        // Declares 3 new lines but the body supplies only 1: insufficient/truncated.
        patch: '@@ -1,3 +1,3 @@\n-return charge(amount);',
      },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(result.kind).toBe('PREPARED');
    if (result.kind === 'PREPARED') {
      expect(result.facts.changedTerms.map((t) => t.technicalTerm)).toContain('authorizeAndCapture');
    }
  });

  it('activates local-diff fallback when a syntactically consistent patch declares impossible resulting line numbers', async () => {
    const provider = new FakeSourceControlProvider();
    // The resulting file has exactly one line.
    provider.setFile('head-sha', 'src/payment.service.ts', 'export const x = 1;');
    provider.setFile('base-sha', 'src/payment.service.ts', 'export const x = 0;');
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      {
        path: 'src/payment.service.ts',
        changeType: 'MODIFIED',
        // Internally consistent (body matches its declared counts) but
        // declares a hunk at line 100 in a file that only has one line.
        patch: '@@ -100,1 +100,1 @@\n-export const x = 0;\n+export const x = 1;',
      },
      repository,
      provider,
      analyzer,
      cache,
    );

    // Fallback must have retrieved the before content rather than trusting
    // the patch's impossible resulting line numbers.
    expect(provider.requestedKeys.sort()).toEqual(
      ['base-sha::src/payment.service.ts', 'head-sha::src/payment.service.ts'].sort(),
    );
    expect(result.kind).toBe('PREPARED');
    if (result.kind === 'PREPARED') {
      // The reconstructed changed range reflects the real line 1, not line 100/101.
      expect(result.facts.changedTerms.map((t) => t.technicalTerm)).toContain('x');
    }
  });

  it('skips the file as unreconstructable when a patch with impossible resulting line numbers has no before content available', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('head-sha', 'src/payment.service.ts', 'export const x = 1;');
    // No before content registered for 'base-sha'.
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      {
        path: 'src/payment.service.ts',
        changeType: 'MODIFIED',
        patch: '@@ -100,1 +100,1 @@\n-export const x = 0;\n+export const x = 1;',
      },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(result).toEqual({
      kind: 'SKIPPED',
      warning: expect.objectContaining({
        pullRequestId: 'pr-1',
        filePath: 'src/payment.service.ts',
        reason: 'UNRECONSTRUCTABLE_CHANGED_RANGES',
      }),
    });
  });

  it('accepts a patch whose only changed range is a valid zero-width deletion anchor at the exclusive EOF position', async () => {
    const provider = new FakeSourceControlProvider();
    // Resulting content has exactly 2 lines; the deletion removed a 3rd
    // trailing line, so the deletion anchor legitimately sits at line 3
    // (lineCount + 1), the exclusive end-of-file position.
    provider.setFile('head-sha', 'src/payment.service.ts', 'line1\nline2');
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      {
        path: 'src/payment.service.ts',
        changeType: 'MODIFIED',
        patch: '@@ -1,3 +1,2 @@\n line1\n line2\n-line3',
      },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(result.kind).toBe('PREPARED');
    // The valid EOF anchor keeps the patch usable; no before-content fetch.
    expect(provider.requestedKeys).toEqual(['head-sha::src/payment.service.ts']);
  });

  it('skips a deleted file with a scoped warning', async () => {
    const provider = new FakeSourceControlProvider();
    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/removed.ts', changeType: 'DELETED' },
      repository,
      provider,
      analyzer,
      new Map(),
    );

    expect(result).toEqual({
      kind: 'SKIPPED',
      warning: expect.objectContaining({ pullRequestId: 'pr-1', filePath: 'src/removed.ts', reason: 'DELETED_FILE' }),
    });
  });

  it('skips a renamed file with a scoped warning', async () => {
    const provider = new FakeSourceControlProvider();
    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/renamed.ts', previousPath: 'src/old.ts', changeType: 'RENAMED' },
      repository,
      provider,
      analyzer,
      new Map(),
    );

    expect(result).toEqual({
      kind: 'SKIPPED',
      warning: expect.objectContaining({ pullRequestId: 'pr-1', filePath: 'src/renamed.ts', reason: 'RENAMED_FILE' }),
    });
  });

  it('skips an unsupported .tsx file', async () => {
    const provider = new FakeSourceControlProvider();
    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/component.tsx', changeType: 'ADDED' },
      repository,
      provider,
      analyzer,
      new Map(),
    );

    expect(result).toEqual({
      kind: 'SKIPPED',
      warning: expect.objectContaining({
        pullRequestId: 'pr-1',
        filePath: 'src/component.tsx',
        reason: 'UNSUPPORTED_FILE_EXTENSION',
      }),
    });
  });

  it('skips when the resulting content is unavailable', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setUnavailable('head-sha', 'src/big.ts', { status: 'UNAVAILABLE', reason: 'OVERSIZED' });

    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/big.ts', changeType: 'ADDED' },
      repository,
      provider,
      analyzer,
      new Map(),
    );

    expect(result).toEqual({
      kind: 'SKIPPED',
      warning: expect.objectContaining({ pullRequestId: 'pr-1', filePath: 'src/big.ts', reason: 'FILE_OVERSIZED' }),
    });
  });

  it('skips as unreconstructable when the patch is missing and the before content is unavailable', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('head-sha', 'src/payment.service.ts', 'function f() { return 1; }\n');
    // No before content registered -> NOT_FOUND.

    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/payment.service.ts', changeType: 'MODIFIED' },
      repository,
      provider,
      analyzer,
      new Map(),
    );

    expect(result).toEqual({
      kind: 'SKIPPED',
      warning: expect.objectContaining({
        pullRequestId: 'pr-1',
        filePath: 'src/payment.service.ts',
        reason: 'UNRECONSTRUCTABLE_CHANGED_RANGES',
      }),
    });
  });

  it('skips malformed source that cannot provide reliable structural facts', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('head-sha', 'src/broken.ts', 'function {{{ broken syntax\n');
    const cache: ContentCache = new Map();

    const result = await prepareChangedFile(
      pullRequest(),
      { path: 'src/broken.ts', changeType: 'ADDED' },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(result).toEqual({
      kind: 'SKIPPED',
      warning: expect.objectContaining({
        pullRequestId: 'pr-1',
        filePath: 'src/broken.ts',
        reason: 'MALFORMED_SOURCE',
      }),
    });
  });

  it('reuses cached content within the run instead of requesting it twice', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('head-sha', 'src/shared.ts', 'export const x = 1;\n');
    const cache: ContentCache = new Map();

    await prepareChangedFile(
      pullRequest(),
      { path: 'src/shared.ts', changeType: 'ADDED' },
      repository,
      provider,
      analyzer,
      cache,
    );
    await prepareChangedFile(
      pullRequest(),
      { path: 'src/shared.ts', changeType: 'ADDED' },
      repository,
      provider,
      analyzer,
      cache,
    );

    expect(provider.requestedKeys).toEqual(['head-sha::src/shared.ts']);
  });
});

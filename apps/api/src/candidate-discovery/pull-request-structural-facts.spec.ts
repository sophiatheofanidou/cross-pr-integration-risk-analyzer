import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { FakeSourceControlProvider } from './__fixtures__/fake-source-control-provider.js';
import { prepareAllStructuralFacts } from './pull-request-structural-facts.js';

const repository = { owner: 'o', repo: 'r' };
const analyzer = new TypeScriptStructuralAnalyzer();

describe('prepareAllStructuralFacts', () => {
  it('prepares facts for every pull request and reuses each file once per pull request', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/a.ts', 'export function foo() { return 1; }\n');
    provider.setFile('b-head', 'src/b.ts', 'export function bar() { return 2; }\n');

    const pullRequestA: NormalizedPullRequest = {
      id: 'pr-a',
      sourceBranch: 'feature/a',
      targetBranch: 'main',
      headRevision: 'a-head',
      changeBaseRevision: 'a-base',
      changedFiles: [{ path: 'src/a.ts', changeType: 'ADDED' }],
    };
    const pullRequestB: NormalizedPullRequest = {
      id: 'pr-b',
      sourceBranch: 'feature/b',
      targetBranch: 'main',
      headRevision: 'b-head',
      changeBaseRevision: 'b-base',
      changedFiles: [{ path: 'src/b.ts', changeType: 'ADDED' }],
    };

    const { factsByPullRequestId, warnings } = await prepareAllStructuralFacts(
      [pullRequestA, pullRequestB],
      repository,
      provider,
      analyzer,
    );

    expect(warnings).toEqual([]);
    expect(factsByPullRequestId.get('pr-a')?.files.map((f) => f.filePath)).toEqual(['src/a.ts']);
    expect(factsByPullRequestId.get('pr-b')?.files.map((f) => f.filePath)).toEqual(['src/b.ts']);
    expect(provider.requestedKeys).toEqual(['a-head::src/a.ts', 'b-head::src/b.ts']);
  });

  it('collects warnings from every pull request, scoped to the affected pull request and file', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/a.ts', 'export function foo() { return 1; }\n');

    const pullRequestA: NormalizedPullRequest = {
      id: 'pr-a',
      sourceBranch: 'feature/a',
      targetBranch: 'main',
      headRevision: 'a-head',
      changeBaseRevision: 'a-base',
      changedFiles: [
        { path: 'src/a.ts', changeType: 'ADDED' },
        { path: 'src/deleted.ts', changeType: 'DELETED' },
      ],
    };
    const pullRequestB: NormalizedPullRequest = {
      id: 'pr-b',
      sourceBranch: 'feature/b',
      targetBranch: 'main',
      headRevision: 'b-head',
      changeBaseRevision: 'b-base',
      changedFiles: [{ path: 'src/styles.css', changeType: 'ADDED' }],
    };

    const { warnings } = await prepareAllStructuralFacts(
      [pullRequestA, pullRequestB],
      repository,
      provider,
      analyzer,
    );

    expect(warnings).toEqual([
      expect.objectContaining({ pullRequestId: 'pr-a', filePath: 'src/deleted.ts', reason: 'DELETED_FILE' }),
      expect.objectContaining({
        pullRequestId: 'pr-b',
        filePath: 'src/styles.css',
        reason: 'UNSUPPORTED_FILE_EXTENSION',
      }),
    ]);
  });

  it('never requests content for an unsupported or deleted/renamed file', async () => {
    const provider = new FakeSourceControlProvider();

    const pullRequest: NormalizedPullRequest = {
      id: 'pr-a',
      sourceBranch: 'feature/a',
      targetBranch: 'main',
      headRevision: 'a-head',
      changeBaseRevision: 'a-base',
      changedFiles: [
        { path: 'src/deleted.ts', changeType: 'DELETED' },
        { path: 'src/renamed.ts', previousPath: 'src/old.ts', changeType: 'RENAMED' },
        { path: 'README.md', changeType: 'ADDED' },
      ],
    };

    await prepareAllStructuralFacts([pullRequest], repository, provider, analyzer);

    expect(provider.requestedKeys).toEqual([]);
  });
});

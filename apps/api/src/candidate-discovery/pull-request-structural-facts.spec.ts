import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { FileContentResult, RepositoryRef } from '../source-control/source-control-provider.js';
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
      title: 'Pull request pr-a',
      webUrl: 'https://github.com/o/r/pull/pr-a',
      sourceBranch: 'feature/a',
      targetBranch: 'main',
      headRevision: 'a-head',
      changeBaseRevision: 'a-base',
      changedFiles: [{ path: 'src/a.ts', changeType: 'ADDED' }],
    };
    const pullRequestB: NormalizedPullRequest = {
      id: 'pr-b',
      title: 'Pull request pr-b',
      webUrl: 'https://github.com/o/r/pull/pr-b',
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
      title: 'Pull request pr-a',
      webUrl: 'https://github.com/o/r/pull/pr-a',
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
      title: 'Pull request pr-b',
      webUrl: 'https://github.com/o/r/pull/pr-b',
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
      title: 'Pull request pr-a',
      webUrl: 'https://github.com/o/r/pull/pr-a',
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

  it('prepares at most four pull requests concurrently', async () => {
    class DelayedProvider extends FakeSourceControlProvider {
      active = 0;
      maximumActive = 0;
      started = 0;
      readonly releases: (() => void)[] = [];

      override async getFileContent(
        repositoryRef: RepositoryRef,
        path: string,
        revision: string,
      ): Promise<FileContentResult> {
        this.active++;
        this.started++;
        this.maximumActive = Math.max(this.maximumActive, this.active);
        await new Promise<void>((resolve) => this.releases.push(resolve));
        this.active--;
        return super.getFileContent(repositoryRef, path, revision);
      }
    }

    const provider = new DelayedProvider();
    const pullRequests = Array.from({ length: 5 }, (_, index): NormalizedPullRequest => {
      const id = String(index + 1);
      const path = `src/file-${id}.ts`;
      provider.setFile(`head-${id}`, path, `export const value${id} = ${id};\n`);
      return {
        id,
        title: `Pull request ${id}`,
        webUrl: `https://github.com/o/r/pull/${id}`,
        sourceBranch: `feature/${id}`,
        targetBranch: 'main',
        headRevision: `head-${id}`,
        changeBaseRevision: 'base',
        changedFiles: [{ path, changeType: 'ADDED' }],
      };
    });
    const waitFor = async (expected: number): Promise<void> => {
      for (let attempt = 0; attempt < 100 && provider.started !== expected; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      expect(provider.started).toBe(expected);
    };

    const preparation = prepareAllStructuralFacts(pullRequests, repository, provider, analyzer);
    await waitFor(4);
    expect(provider.maximumActive).toBe(4);
    provider.releases.splice(0).forEach((release) => release());
    await waitFor(5);
    provider.releases.splice(0).forEach((release) => release());
    await preparation;

    expect(provider.maximumActive).toBe(4);
  });
});

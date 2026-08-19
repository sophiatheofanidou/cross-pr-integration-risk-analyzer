/**
 * Minimal in-memory `SourceControlProvider` fake for Candidate Discovery
 * and Context Retrieval tests. Not a fixture framework: it only stores
 * file content by revision and path so tests never make a live GitHub
 * call.
 */

import type { NormalizedPullRequest } from '../../domain/pull-request.js';
import type {
  FileContentResult,
  RepositoryRef,
  SourceControlProvider,
} from '../../source-control/source-control-provider.js';

export class FakeSourceControlProvider implements SourceControlProvider {
  private readonly contentByKey = new Map<string, FileContentResult>();
  private eligiblePullRequests: readonly NormalizedPullRequest[] | Error | undefined;
  readonly requestedKeys: string[] = [];

  private key(path: string, revision: string): string {
    return `${revision}::${path}`;
  }

  setFile(revision: string, path: string, content: string): void {
    this.contentByKey.set(this.key(path, revision), { status: 'AVAILABLE', content });
  }

  setUnavailable(revision: string, path: string, result: FileContentResult): void {
    this.contentByKey.set(this.key(path, revision), result);
  }

  /** Configures the result of `getEligiblePullRequests`; unused by default. */
  setEligiblePullRequests(pullRequests: readonly NormalizedPullRequest[] | Error): void {
    this.eligiblePullRequests = pullRequests;
  }

  async getEligiblePullRequests(): Promise<readonly NormalizedPullRequest[]> {
    if (this.eligiblePullRequests === undefined) {
      throw new Error('FakeSourceControlProvider.getEligiblePullRequests is not used by these tests');
    }
    if (this.eligiblePullRequests instanceof Error) {
      throw this.eligiblePullRequests;
    }
    return this.eligiblePullRequests;
  }

  async getFileContent(
    _repository: RepositoryRef,
    path: string,
    revision: string,
  ): Promise<FileContentResult> {
    const key = this.key(path, revision);
    this.requestedKeys.push(key);
    return this.contentByKey.get(key) ?? { status: 'UNAVAILABLE', reason: 'NOT_FOUND' };
  }
}

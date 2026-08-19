/**
 * Controlled TypeScript scenarios for Candidate Discovery and Context
 * Retrieval, developed together with the implementation
 * (docs/design/07-mvp-specification.md, Controlled Scenarios; ADR-015).
 *
 * Each scenario is a small, self-contained integration test against the
 * real `discoverCandidates` orchestration, the real Tree-sitter analyzer
 * and a fake `SourceControlProvider`, so no scenario requires live GitHub
 * or Claude access. These scenarios double as the project's regression
 * suite and the final demonstration baseline.
 */

import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import { TypeScriptStructuralAnalyzer } from '../structural-analysis/typescript/typescript-structural-analyzer.js';
import { retrieveContext } from '../context-retrieval/context-retrieval.js';
import { FakeSourceControlProvider } from './__fixtures__/fake-source-control-provider.js';
import { discoverCandidates } from './candidate-discovery.js';

const repository = { owner: 'o', repo: 'r' };
const analyzer = new TypeScriptStructuralAnalyzer();

function pullRequest(
  id: string,
  headRevision: string,
  changeBaseRevision: string,
  path: string,
  changeType: 'ADDED' | 'MODIFIED',
  patch?: string,
): NormalizedPullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    webUrl: `https://github.com/o/r/pull/${id}`,
    sourceBranch: `feature/${id}`,
    targetBranch: 'main',
    headRevision,
    changeBaseRevision,
    changedFiles: [{ path, changeType, ...(patch !== undefined ? { patch } : {}) }],
  };
}

describe('Controlled scenario: changed function signature plus a call in another changed file', () => {
  it('becomes a Candidate Pair via the changed signature name', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile(
      'a-head',
      'src/payment.service.ts',
      'export function processPayment(amount: number, currency: string): number {\n  return amount;\n}\n',
    );
    provider.setFile('b-head', 'src/checkout.service.ts', 'const total = processPayment(100, "USD");\n');

    const pullRequestA = pullRequest(
      'pr-a',
      'a-head',
      'a-base',
      'src/payment.service.ts',
      'MODIFIED',
      '@@ -1,3 +1,3 @@\n-export function processPayment(amount: number): number {\n+export function processPayment(amount: number, currency: string): number {\n   return amount;\n }',
    );
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/checkout.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    expect(
      run.result.candidatePairs[0]!.technicalTermMatches.some((m) => m.technicalTerm === 'processPayment'),
    ).toBe(true);
  });
});

describe('Controlled scenario: behaviour change associated with an enclosing function', () => {
  it('associates a body-only change with the enclosing function name, not just the changed lines', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile(
      'a-head',
      'src/payment.service.ts',
      'function processPayment(amount) {\n  return authorizeAndCapture(amount);\n}\n',
    );
    provider.setFile('b-head', 'src/checkout.service.ts', 'const result = processPayment(total);\n');

    const pullRequestA = pullRequest(
      'pr-a',
      'a-head',
      'a-base',
      'src/payment.service.ts',
      'MODIFIED',
      // Only the body line changed; "processPayment" itself is untouched.
      '@@ -1,3 +1,3 @@\n function processPayment(amount) {\n-  return charge(amount);\n+  return authorizeAndCapture(amount);\n }',
    );
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/checkout.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    expect(
      run.result.candidatePairs[0]!.technicalTermMatches.some((m) => m.technicalTerm === 'processPayment'),
    ).toBe(true);
  });
});

describe('Controlled scenario: multi-hunk file — hunk selection follows the actual changed region', () => {
  it('selects the later hunk that caused the match, not an earlier unrelated hunk', async () => {
    const provider = new FakeSourceControlProvider();
    const afterContent = [
      'function unrelatedHelper() {', // 1
      '  return 1;', // 2
      '}', // 3
      '', // 4
      'function processPayment(amount) {', // 5
      '  const step1 = amount;', // 6
      '  const step2 = step1 * 2;', // 7
      '  return authorizeAndCapture(step2);', // 8
      '}', // 9
      '',
    ].join('\n');
    provider.setFile('a-head', 'src/payment.service.ts', afterContent);
    provider.setFile('b-head', 'src/checkout.service.ts', 'const result = processPayment(total);\n');

    const patch = [
      // Hunk 1: an earlier, unrelated change (unrelatedHelper's return value).
      '@@ -1,3 +1,3 @@',
      ' function unrelatedHelper() {',
      '-  return 0;',
      '+  return 1;',
      ' }',
      // Hunk 2: a later, body-only change deep inside processPayment.
      // "processPayment" itself (line 5) is outside this hunk's own range.
      '@@ -7,3 +7,3 @@',
      '   const step2 = step1 * 2;',
      '-  return charge(step2);',
      '+  return authorizeAndCapture(step2);',
      ' }',
    ].join('\n');

    const pullRequestA = pullRequest(
      'pr-a',
      'a-head',
      'a-base',
      'src/payment.service.ts',
      'MODIFIED',
      patch,
    );
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/checkout.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    const candidatePair = run.result.candidatePairs[0]!;

    const matchFromA = candidatePair.technicalTermMatches.find(
      (m) => m.technicalTerm === 'processPayment' && m.changedRegionLocation.pullRequestId === 'pr-a',
    );
    expect(matchFromA).toBeDefined();
    // The changed-region location must point at the actual later change
    // (line 8, inside the hunk-2 range), not the declaration's own name
    // line (line 5) and not the earlier unrelated hunk (line 2).
    expect(matchFromA!.changedRegionLocation.range.start.line).toBe(8);

    const outcome = retrieveContext(candidatePair, run);
    expect(outcome.sufficientContext).toBe(true);
    if (outcome.sufficientContext) {
      const matchContext = outcome.context.matches.find((m) => m.match === matchFromA);
      expect(matchContext).toBeDefined();
      expect(matchContext!.changeHunk).toContain('authorizeAndCapture(step2)');
      expect(matchContext!.changeHunk).not.toContain('unrelatedHelper');
    }
  });
});

describe('Controlled scenario: changed model/property plus a matching occurrence', () => {
  it('matches a changed interface property against another PR reading it', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile(
      'a-head',
      'src/payment.model.ts',
      'export interface PaymentModel {\n  amount: string;\n}\n',
    );
    provider.setFile(
      'b-head',
      'src/receipt.service.ts',
      'function printReceipt(payment: PaymentModel) {\n  return payment.amount;\n}\n',
    );

    const pullRequestA = pullRequest(
      'pr-a',
      'a-head',
      'a-base',
      'src/payment.model.ts',
      'MODIFIED',
      '@@ -1,3 +1,3 @@\n export interface PaymentModel {\n-  amount: number;\n+  amount: string;\n }',
    );
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/receipt.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    expect(run.result.candidatePairs[0]!.technicalTermMatches.some((m) => m.technicalTerm === 'amount')).toBe(
      true,
    );
  });
});

describe('Controlled scenario: matching occurrence outside the other PR\'s patch', () => {
  it('finds the matching occurrence in the resulting content, not only inside the changed lines', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile(
      'a-head',
      'src/payment.service.ts',
      'export function processPayment(amount: number): number {\n  return amount;\n}\n',
    );
    // PR B's file already contains a call to processPayment, unrelated to
    // the line PR B actually changed in this same file.
    provider.setFile(
      'b-head',
      'src/checkout.service.ts',
      'const total = processPayment(100);\n\nfunction logCheckout() {\n  console.log("checkout started");\n}\n',
    );

    const pullRequestA = pullRequest('pr-a', 'a-head', 'a-base', 'src/payment.service.ts', 'ADDED');
    const pullRequestB = pullRequest(
      'pr-b',
      'b-head',
      'b-base',
      'src/checkout.service.ts',
      'MODIFIED',
      // Changed region is the logging line, far from the processPayment call.
      '@@ -4,1 +4,1 @@\n-  console.log("checkout begins");\n+  console.log("checkout started");',
    );

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    const match = run.result.candidatePairs[0]!.technicalTermMatches.find(
      (m) => m.technicalTerm === 'processPayment',
    );
    expect(match).toBeDefined();
    // The matching occurrence is on line 1, well outside PR B's changed line 4.
    expect(match!.matchingOccurrenceLocation.range.start.line).toBe(1);
  });
});

describe('Controlled scenario: missing provider patch recovered through bounded local diff', () => {
  it('still discovers the pair when a modified file carries no patch at all', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-base', 'src/payment.service.ts', 'function processPayment(amount) {\n  return charge(amount);\n}\n');
    provider.setFile(
      'a-head',
      'src/payment.service.ts',
      'function processPayment(amount) {\n  return authorizeAndCapture(amount);\n}\n',
    );
    provider.setFile('b-head', 'src/checkout.service.ts', 'const result = processPayment(total);\n');

    // No `patch` field at all.
    const pullRequestA = pullRequest('pr-a', 'a-head', 'a-base', 'src/payment.service.ts', 'MODIFIED');
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/checkout.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    expect(
      run.result.candidatePairs[0]!.technicalTermMatches.some((m) => m.technicalTerm === 'processPayment'),
    ).toBe(true);
    expect(run.result.warnings).toEqual([]);
  });
});

describe('Controlled scenario: insufficient provider patch recovered through bounded local diff', () => {
  it('still discovers the pair when the patch is present but truncated/inconsistent', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-base', 'src/payment.service.ts', 'function processPayment(amount) {\n  return charge(amount);\n}\n');
    provider.setFile(
      'a-head',
      'src/payment.service.ts',
      'function processPayment(amount) {\n  return authorizeAndCapture(amount);\n}\n',
    );
    provider.setFile('b-head', 'src/checkout.service.ts', 'const result = processPayment(total);\n');

    const pullRequestA = pullRequest(
      'pr-a',
      'a-head',
      'a-base',
      'src/payment.service.ts',
      'MODIFIED',
      // Header declares 3 new lines but the body supplies only 1: insufficient.
      '@@ -1,3 +1,3 @@\n+  return authorizeAndCapture(amount);',
    );
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/checkout.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toHaveLength(1);
    // PR B only calls `processPayment`, not `authorizeAndCapture` — the
    // match must come through the enclosing function name, which local
    // reconstruction still associates with the body-only change.
    expect(
      run.result.candidatePairs[0]!.technicalTermMatches.some((m) => m.technicalTerm === 'processPayment'),
    ).toBe(true);
  });
});

describe('Controlled scenario: coincidental same-name structural match', () => {
  it('still becomes a Candidate Pair; Candidate Discovery does not dismiss it', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/upload.service.ts', 'export function handler(file: Buffer) {\n  return file.length;\n}\n');
    provider.setFile('b-head', 'src/webhook.service.ts', 'export function handler(event: string) {\n  return event.length;\n}\n');

    const pullRequestA = pullRequest('pr-a', 'a-head', 'a-base', 'src/upload.service.ts', 'ADDED');
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/webhook.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    // Same name, unrelated purpose: Candidate Discovery still selects the
    // pair. Rejecting it is an AI Risk Analysis responsibility (M4).
    expect(run.result.candidatePairs).toHaveLength(1);
    expect(run.result.candidatePairs[0]!.technicalTermMatches.some((m) => m.technicalTerm === 'handler')).toBe(
      true,
    );
  });
});

describe('Controlled scenario: unrelated pull requests', () => {
  it('produces no Candidate Pair when the changes share no technical terms', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/payment.service.ts', 'export function processPayment(amount: number) {\n  return amount;\n}\n');
    provider.setFile('b-head', 'src/logging.service.ts', 'export function writeAuditLog(message: string) {\n  console.log(message);\n}\n');

    const pullRequestA = pullRequest('pr-a', 'a-head', 'a-base', 'src/payment.service.ts', 'ADDED');
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/logging.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);

    expect(run.result.candidatePairs).toEqual([]);
  });
});

describe('Controlled scenario: unsupported input warning', () => {
  it('reports an unsupported-extension warning and does not crash the run', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/component.tsx', '<div>not analyzed</div>');

    const pullRequestA = pullRequest('pr-a', 'a-head', 'a-base', 'src/component.tsx', 'ADDED');

    const run = await discoverCandidates([pullRequestA], repository, provider, analyzer);

    expect(run.result.candidatePairs).toEqual([]);
    expect(run.result.warnings).toEqual([
      expect.objectContaining({
        pullRequestId: 'pr-a',
        filePath: 'src/component.tsx',
        reason: 'UNSUPPORTED_FILE_EXTENSION',
      }),
    ]);
  });
});

describe('Controlled scenario: incomplete input warning', () => {
  it('reports an unreconstructable-changed-ranges warning when neither the patch nor the before content is usable', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile('a-head', 'src/payment.service.ts', 'export function processPayment(amount: number) {\n  return amount;\n}\n');
    // No before-content registered for 'a-base', and no patch supplied.

    const pullRequestA = pullRequest('pr-a', 'a-head', 'a-base', 'src/payment.service.ts', 'MODIFIED');

    const run = await discoverCandidates([pullRequestA], repository, provider, analyzer);

    expect(run.result.candidatePairs).toEqual([]);
    expect(run.result.warnings).toEqual([
      expect.objectContaining({
        pullRequestId: 'pr-a',
        filePath: 'src/payment.service.ts',
        reason: 'UNRECONSTRUCTABLE_CHANGED_RANGES',
      }),
    ]);
  });
});

describe('Controlled scenario: discovered Candidate Pair without sufficient context', () => {
  it('preserves the Candidate Pair and exposes an assessment-not-run warning instead of running AI', async () => {
    const provider = new FakeSourceControlProvider();
    provider.setFile(
      'a-head',
      'src/payment.service.ts',
      'export function processPayment(amount: number): number {\n  return amount;\n}\n',
    );
    provider.setFile('b-head', 'src/checkout.service.ts', 'const result = processPayment(10);\n');

    const pullRequestA = pullRequest('pr-a', 'a-head', 'a-base', 'src/payment.service.ts', 'ADDED');
    const pullRequestB = pullRequest('pr-b', 'b-head', 'b-base', 'src/checkout.service.ts', 'ADDED');

    const run = await discoverCandidates([pullRequestA, pullRequestB], repository, provider, analyzer);
    expect(run.result.candidatePairs).toHaveLength(1);
    const candidatePair = run.result.candidatePairs[0]!;

    // Bounds too tight for any match to retain complete context.
    const outcome = retrieveContext(candidatePair, run, {
      maxHunkLength: 0,
      maxSnippetLength: 0,
      maxTotalContextLength: 0,
    });

    // The pair is still visible in the discovery result...
    expect(run.result.candidatePairs).toContain(candidatePair);
    // ...but Context Retrieval reports it as not assessable, not as "no risk".
    expect(outcome.sufficientContext).toBe(false);
    if (!outcome.sufficientContext) {
      expect(outcome.warnings.some((warning) => warning.reason === 'ASSESSMENT_NOT_RUN')).toBe(true);
      expect(outcome.warnings.some((warning) => warning.reason === 'CONTEXT_OMITTED')).toBe(true);
    }
  });
});

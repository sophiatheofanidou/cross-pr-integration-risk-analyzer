import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from './pull-request.js';
import type { CandidatePair } from './candidate-evidence.js';

/**
 * Reconstructs the worked example from
 * docs/design/04-candidate-discovery.md (Modified Definition Referenced by
 * the Other PR): PR A modifies the `processPayment` definition, PR B adds a
 * call to it in a different file.
 */
describe('CandidatePair evidence', () => {
  it('connects the PR that changes a definition to the PR that references it', () => {
    const pullRequestA: NormalizedPullRequest = {
      id: 'pr-a',
      sourceBranch: 'feature/payment-contract',
      targetBranch: 'main',
      changedFiles: [
        { path: 'src/payments/payment.service.ts', changeType: 'MODIFIED' },
      ],
    };

    const pullRequestB: NormalizedPullRequest = {
      id: 'pr-b',
      sourceBranch: 'feature/checkout-flow',
      targetBranch: 'main',
      changedFiles: [
        { path: 'src/checkout/checkout.service.ts', changeType: 'MODIFIED' },
      ],
    };

    const candidatePair: CandidatePair = {
      pullRequestA,
      pullRequestB,
      evidence: [
        {
          ruleId: 'MODIFIED_DEFINITION_REFERENCED_BY_OTHER_PR',
          technicalResource: 'processPayment',
          pullRequestALocation: { filePath: 'src/payments/payment.service.ts' },
          pullRequestBLocation: { filePath: 'src/checkout/checkout.service.ts' },
        },
      ],
    };

    const [evidence] = candidatePair.evidence;

    expect(evidence).toBeDefined();
    expect(
      pullRequestA.changedFiles.some(
        (file) => file.path === evidence!.pullRequestALocation.filePath,
      ),
    ).toBe(true);
    expect(
      pullRequestB.changedFiles.some(
        (file) => file.path === evidence!.pullRequestBLocation.filePath,
      ),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  calculateEffectiveReviewState,
  isEligiblePullRequest,
  type NormalizedReview,
} from './pull-request-eligibility.js';

describe('calculateEffectiveReviewState', () => {
  it('is active-approval when an approval exists', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'APPROVED' },
    ];

    expect(calculateEffectiveReviewState(reviews)).toEqual({
      hasActiveApproval: true,
      hasActiveChangesRequested: false,
    });
  });

  it('does not remove an approval when the same reviewer later comments', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'APPROVED' },
      { reviewerKey: 'user:1', decision: 'COMMENTED' },
    ];

    expect(calculateEffectiveReviewState(reviews).hasActiveApproval).toBe(true);
  });

  it('replaces an approval with a later changes-requested decision from the same reviewer', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'APPROVED' },
      { reviewerKey: 'user:1', decision: 'CHANGES_REQUESTED' },
    ];

    expect(calculateEffectiveReviewState(reviews)).toEqual({
      hasActiveApproval: false,
      hasActiveChangesRequested: true,
    });
  });

  it('replaces a changes-requested decision with a later approval from the same reviewer', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'CHANGES_REQUESTED' },
      { reviewerKey: 'user:1', decision: 'APPROVED' },
    ];

    expect(calculateEffectiveReviewState(reviews)).toEqual({
      hasActiveApproval: true,
      hasActiveChangesRequested: false,
    });
  });

  it('treats an active changes-requested decision from any reviewer as blocking', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'APPROVED' },
      { reviewerKey: 'user:2', decision: 'CHANGES_REQUESTED' },
    ];

    expect(calculateEffectiveReviewState(reviews)).toEqual({
      hasActiveApproval: true,
      hasActiveChangesRequested: true,
    });
  });

  it('does not count dismissed or pending reviews as active decisions', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'DISMISSED' },
      { reviewerKey: 'user:2', decision: 'PENDING' },
    ];

    expect(calculateEffectiveReviewState(reviews)).toEqual({
      hasActiveApproval: false,
      hasActiveChangesRequested: false,
    });
  });

  it('reverts to the reviewer\'s remaining decisive review once a later one is dismissed', () => {
    // GitHub mutates a dismissed review's state in place instead of adding a
    // new event, so the dismissed review is simply skipped here.
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'APPROVED' },
      { reviewerKey: 'user:1', decision: 'DISMISSED' },
    ];

    expect(calculateEffectiveReviewState(reviews).hasActiveApproval).toBe(true);
  });

  it('keeps missing-reviewer-identity reviews from merging with each other', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'review:101', decision: 'APPROVED' },
      { reviewerKey: 'review:102', decision: 'CHANGES_REQUESTED' },
    ];

    expect(calculateEffectiveReviewState(reviews)).toEqual({
      hasActiveApproval: true,
      hasActiveChangesRequested: true,
    });
  });
});

describe('isEligiblePullRequest', () => {
  const approved: NormalizedReview[] = [
    { reviewerKey: 'user:1', decision: 'APPROVED' },
  ];

  it('is eligible when open, non-draft, targeting the branch and approved', () => {
    expect(
      isEligiblePullRequest(
        { state: 'open', draft: false, targetBranch: 'main', reviews: approved },
        'main',
      ),
    ).toBe(true);
  });

  it('requires at least one active approval', () => {
    expect(
      isEligiblePullRequest(
        { state: 'open', draft: false, targetBranch: 'main', reviews: [] },
        'main',
      ),
    ).toBe(false);
  });

  it('excludes a pull request with an active changes-requested decision', () => {
    const reviews: NormalizedReview[] = [
      { reviewerKey: 'user:1', decision: 'APPROVED' },
      { reviewerKey: 'user:2', decision: 'CHANGES_REQUESTED' },
    ];

    expect(
      isEligiblePullRequest(
        { state: 'open', draft: false, targetBranch: 'main', reviews },
        'main',
      ),
    ).toBe(false);
  });

  it('excludes draft pull requests', () => {
    expect(
      isEligiblePullRequest(
        { state: 'open', draft: true, targetBranch: 'main', reviews: approved },
        'main',
      ),
    ).toBe(false);
  });

  it('excludes closed pull requests', () => {
    expect(
      isEligiblePullRequest(
        { state: 'closed', draft: false, targetBranch: 'main', reviews: approved },
        'main',
      ),
    ).toBe(false);
  });

  it('excludes pull requests targeting a different branch', () => {
    expect(
      isEligiblePullRequest(
        { state: 'open', draft: false, targetBranch: 'develop', reviews: approved },
        'main',
      ),
    ).toBe(false);
  });
});

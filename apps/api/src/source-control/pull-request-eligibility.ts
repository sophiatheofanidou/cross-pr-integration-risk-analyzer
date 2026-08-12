/**
 * Deterministic effective-review-state calculation and Pull Request
 * Eligibility Selection.
 *
 * See docs/design/02-architecture.md (Pull Request Eligibility Selection)
 * and docs/design/07-mvp-specification.md (Pull Request Scope).
 *
 * This module is provider-neutral: it operates on normalized eligibility
 * input rather than raw GitHub JSON, so it has no GitHub-specific or Zod
 * dependency.
 */

/**
 * The review states a source-control provider may report for one review.
 * `COMMENTED`, `DISMISSED` and `PENDING` never establish or override an
 * active decision.
 */
export type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING';

/**
 * One normalized review, already reduced to what effective-review-state
 * calculation needs.
 *
 * `reviewerKey` identifies the reviewer for the purpose of tracking their
 * latest decisive review. When the provider cannot identify the reviewer
 * (e.g. a deleted GitHub account), the caller must supply a key unique to
 * that single review so it is never merged with another reviewer's
 * decisions.
 */
export interface NormalizedReview {
  readonly reviewerKey: string;
  readonly decision: ReviewDecision;
}

/**
 * The aggregated effective review state of a pull request. Kept as two
 * independent booleans, rather than one collapsed state, because
 * eligibility depends on both conditions separately (docs/design/
 * 02-architecture.md, Pull Request Eligibility Selection: "an active
 * changes-requested decision makes a pull request ineligible, and at least
 * one active approval is required").
 */
export interface EffectiveReviewState {
  readonly hasActiveApproval: boolean;
  readonly hasActiveChangesRequested: boolean;
}

/**
 * Calculates the current effective review state from a pull request's
 * reviews.
 *
 * `reviews` must already be in the chronological order guaranteed by the
 * source-control provider's list-reviews endpoint; this function does not
 * re-sort. For each reviewer, only their latest `APPROVED` or
 * `CHANGES_REQUESTED` review is active — a later decisive review from the
 * same reviewer replaces their previous decisive state. `COMMENTED` and
 * `PENDING` reviews never change a reviewer's active decision.
 *
 * `DISMISSED`: GitHub dismisses a review by mutating that same review's
 * state in place (its `submitted_at` does not change), rather than by
 * appending a new event. A dismissed review is therefore encountered here
 * exactly once and is simply skipped — it does not establish or override
 * anything — which correctly reverts the reviewer's active decision to
 * whichever of their still-undismissed reviews is chronologically latest,
 * or to no active decision if none remain. Verified against GitHub REST
 * API documentation for "List reviews for a pull request".
 */
export function calculateEffectiveReviewState(
  reviews: readonly NormalizedReview[],
): EffectiveReviewState {
  const activeDecisionByReviewer = new Map<
    string,
    'APPROVED' | 'CHANGES_REQUESTED'
  >();

  for (const review of reviews) {
    if (review.decision === 'APPROVED' || review.decision === 'CHANGES_REQUESTED') {
      activeDecisionByReviewer.set(review.reviewerKey, review.decision);
    }
  }

  let hasActiveApproval = false;
  let hasActiveChangesRequested = false;
  for (const decision of activeDecisionByReviewer.values()) {
    if (decision === 'APPROVED') {
      hasActiveApproval = true;
    } else {
      hasActiveChangesRequested = true;
    }
  }

  return { hasActiveApproval, hasActiveChangesRequested };
}

/** Normalized, provider-neutral input to the eligibility policy. */
export interface EligibilityInput {
  readonly state: 'open' | 'closed';
  readonly draft: boolean;
  readonly targetBranch: string;
  readonly reviews: readonly NormalizedReview[];
}

/**
 * Determines whether a pull request is eligible for analysis
 * (docs/design/07-mvp-specification.md, Pull Request Scope).
 *
 * A pull request is eligible only when it is open, is not a draft, targets
 * `selectedTargetBranch`, has at least one active approval and has no
 * active changes-requested decision.
 */
export function isEligiblePullRequest(
  input: EligibilityInput,
  selectedTargetBranch: string,
): boolean {
  if (input.state !== 'open') {
    return false;
  }
  if (input.draft) {
    return false;
  }
  if (input.targetBranch !== selectedTargetBranch) {
    return false;
  }

  const { hasActiveApproval, hasActiveChangesRequested } =
    calculateEffectiveReviewState(input.reviews);

  return hasActiveApproval && !hasActiveChangesRequested;
}

/**
 * Deterministic Candidate Discovery evidence.
 *
 * See docs/design/04-candidate-discovery.md (Evidence Model, ADR-006). This
 * evidence is factual and deterministic; it does not claim semantic symbol
 * identity or an integration risk.
 */

import type {
  ChangedRegionLocation,
  MatchingOccurrenceLocation,
} from './source-location.js';

/**
 * A single factual correlation connecting two pull requests: a relevant
 * named technical term associated with a changed region in one pull request
 * has a matching structural occurrence in a supported file changed by the
 * other pull request.
 *
 * Same-file and cross-file relationships use this same shape; the file
 * paths inside the locations remain evidence, not a separate match
 * category (docs/design/04-candidate-discovery.md, Same-File and
 * Cross-File Matching).
 */
export interface TechnicalTermMatch {
  readonly technicalTerm: string;
  readonly changedRegionLocation: ChangedRegionLocation;
  readonly matchingOccurrenceLocation: MatchingOccurrenceLocation;
}

/**
 * Language-neutral structural-analysis boundary.
 *
 * See docs/design/04-candidate-discovery.md (Language Independence,
 * Language-Aware Structural Analysis). A concrete analyzer (e.g. the
 * TypeScript Tree-sitter analyzer) parses bounded source locally and
 * returns these language-neutral facts. It must not expose parser-specific
 * node types outside its own implementation.
 */

import type { SourceRange } from '../domain/source-location.js';

/** Bounded input to one structural-analysis call for one file's resulting content. */
export interface StructuralAnalysisInput {
  readonly filePath: string;
  readonly content: string;
  /** Reliable changed ranges within `content`, already resolved by changed-file preparation. */
  readonly changedRanges: readonly SourceRange[];
}

/**
 * One named structural occurrence, together with a source range useful for
 * an enclosing snippet around it (docs/design/04-candidate-discovery.md,
 * Language-Aware Structural Analysis: the changed lines may not contain the
 * relevant name, e.g. an enclosing function).
 */
export interface StructuralTermOccurrence {
  readonly technicalTerm: string;
  readonly range: SourceRange;
  readonly enclosingRange: SourceRange;
}

/**
 * A technical term associated with a changed region. Distinguishes the
 * term's own syntax range (`range`) from the actual changed range that
 * caused the association (`changedRange`): for an enclosing declaration
 * whose name lies outside the changed lines, these differ, and
 * `changedRange` is the one that must drive hunk selection
 * (docs/design/04-candidate-discovery.md, Language-Aware Structural
 * Analysis).
 */
export interface ChangedTermAssociation extends StructuralTermOccurrence {
  readonly changedRange: SourceRange;
}

export interface StructuralAnalysisResult {
  /**
   * Technical terms associated with `changedRanges`: occurrences
   * intersecting a changed range, plus the name of a relevant enclosing
   * declaration when the changed lines fall inside its body or signature
   * without touching the declaration's own name.
   */
  readonly changedTerms: readonly ChangedTermAssociation[];
  /**
   * Every relevant named occurrence throughout the resulting content,
   * searched for matching occurrences from the other pull request
   * (docs/design/04-candidate-discovery.md, Resulting-Content Search).
   */
  readonly occurrences: readonly StructuralTermOccurrence[];
  /**
   * True when the parse could not provide reliable structural facts for a
   * required changed region. A recoverable parser error elsewhere in the
   * file does not by itself set this
   * (docs/design/04-candidate-discovery.md, Analysis Warnings).
   */
  readonly malformed: boolean;
}

export interface StructuralAnalyzer {
  analyze(input: StructuralAnalysisInput): StructuralAnalysisResult;
}

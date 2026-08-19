import { describe, expect, it } from 'vitest';
import type { NormalizedPullRequest } from '../domain/pull-request.js';
import type { ChangedTermAssociation, StructuralTermOccurrence } from '../structural-analysis/structural-analyzer.js';
import type { PreparedFileFacts } from './prepare-changed-file.js';
import type { PullRequestStructuralFacts } from './pull-request-structural-facts.js';
import { computeTechnicalTermMatches } from './technical-term-matching.js';

function term(name: string, line: number): StructuralTermOccurrence {
  return {
    technicalTerm: name,
    range: { start: { line, column: 1 }, end: { line, column: name.length + 1 } },
    enclosingRange: { start: { line, column: 1 }, end: { line: line + 1, column: 1 } },
  };
}

/** A changed term whose own syntax range and changed range coincide (the common case). */
function changedTerm(name: string, line: number): ChangedTermAssociation {
  const occurrence = term(name, line);
  return { ...occurrence, changedRange: occurrence.range };
}

function pullRequest(id: string): NormalizedPullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    webUrl: `https://github.com/o/r/pull/${id}`,
    sourceBranch: `feature/${id}`,
    targetBranch: 'main',
    headRevision: `${id}-head`,
    changeBaseRevision: `${id}-base`,
    changedFiles: [],
  };
}

function facts(
  id: string,
  files: readonly Pick<PreparedFileFacts, 'filePath' | 'changedTerms' | 'occurrences'>[],
): PullRequestStructuralFacts {
  return {
    pullRequest: pullRequest(id),
    files: files.map((file) => ({ ...file, content: '', changeRepresentation: '' })),
  };
}

describe('computeTechnicalTermMatches', () => {
  it('matches PR A changed terms against PR B occurrences', () => {
    const factsA = facts('pr-a', [
      { filePath: 'src/payment.service.ts', changedTerms: [changedTerm('processPayment', 1)], occurrences: [] },
    ]);
    const factsB = facts('pr-b', [
      { filePath: 'src/checkout.service.ts', changedTerms: [], occurrences: [term('processPayment', 5)] },
    ]);

    const matches = computeTechnicalTermMatches(factsA, factsB);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      technicalTerm: 'processPayment',
      changedRegionLocation: {
        pullRequestId: 'pr-a',
        filePath: 'src/payment.service.ts',
        range: changedTerm('processPayment', 1).changedRange,
      },
      matchingOccurrenceLocation: {
        pullRequestId: 'pr-b',
        filePath: 'src/checkout.service.ts',
        range: term('processPayment', 5).range,
      },
    });
  });

  it('matches PR B changed terms against PR A occurrences (the reverse direction)', () => {
    const factsA = facts('pr-a', [
      { filePath: 'src/a.ts', changedTerms: [], occurrences: [term('handler', 2)] },
    ]);
    const factsB = facts('pr-b', [
      { filePath: 'src/b.ts', changedTerms: [changedTerm('handler', 9)], occurrences: [] },
    ]);

    const matches = computeTechnicalTermMatches(factsA, factsB);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.changedRegionLocation.pullRequestId).toBe('pr-b');
    expect(matches[0]!.matchingOccurrenceLocation.pullRequestId).toBe('pr-a');
  });

  it('produces the same match shape for a same-file relationship as a cross-file one', () => {
    const factsA = facts('pr-a', [
      { filePath: 'src/a.ts', changedTerms: [changedTerm('foo', 1)], occurrences: [] },
    ]);
    const factsB = facts('pr-b', [{ filePath: 'src/a.ts', changedTerms: [], occurrences: [term('foo', 2)] }]);

    const matches = computeTechnicalTermMatches(factsA, factsB);

    expect(matches[0]!.changedRegionLocation.filePath).toBe('src/a.ts');
    expect(matches[0]!.matchingOccurrenceLocation.filePath).toBe('src/a.ts');
  });

  it('produces no matches for unrelated pull requests', () => {
    const factsA = facts('pr-a', [
      { filePath: 'src/a.ts', changedTerms: [changedTerm('foo', 1)], occurrences: [] },
    ]);
    const factsB = facts('pr-b', [{ filePath: 'src/b.ts', changedTerms: [], occurrences: [term('bar', 1)] }]);

    expect(computeTechnicalTermMatches(factsA, factsB)).toEqual([]);
  });

  it('removes exact duplicate matches deterministically', () => {
    const sharedTerm = changedTerm('foo', 1);
    const factsA = facts('pr-a', [
      { filePath: 'src/a.ts', changedTerms: [sharedTerm], occurrences: [] },
    ]);
    const factsB = facts('pr-b', [
      { filePath: 'src/b.ts', changedTerms: [], occurrences: [term('foo', 5)] },
    ]);

    const first = computeTechnicalTermMatches(factsA, factsB);
    const second = computeTechnicalTermMatches(factsA, factsB);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
  });

  it('produces stable ordering across repeated runs regardless of insertion order', () => {
    const factsA = facts('pr-a', [
      { filePath: 'src/z.ts', changedTerms: [changedTerm('zeta', 1)], occurrences: [] },
      { filePath: 'src/a.ts', changedTerms: [changedTerm('alpha', 1)], occurrences: [] },
    ]);
    const factsB = facts('pr-b', [
      { filePath: 'src/other.ts', changedTerms: [], occurrences: [term('alpha', 1), term('zeta', 2)] },
    ]);

    const first = computeTechnicalTermMatches(factsA, factsB);
    const second = computeTechnicalTermMatches(factsA, factsB);

    expect(first.map((m) => m.technicalTerm)).toEqual(second.map((m) => m.technicalTerm));
    expect(first.map((m) => m.technicalTerm)).toEqual(['alpha', 'zeta']);
  });

  it('does not collapse two distinct changed regions associated with the same enclosing declaration', () => {
    // The same declaration name (same `range`) can be associated with two
    // separate changed regions in its body (different `changedRange`s).
    // Deduplication/ordering identity must include full start+end
    // positions so these remain two distinct matches.
    const declarationRange = term('processPayment', 1).range;
    const firstBodyChange = {
      ...term('processPayment', 1),
      range: declarationRange,
      changedRange: { start: { line: 3, column: 1 }, end: { line: 4, column: 1 } },
    };
    const secondBodyChange = {
      ...term('processPayment', 1),
      range: declarationRange,
      changedRange: { start: { line: 7, column: 1 }, end: { line: 8, column: 1 } },
    };

    const factsA = facts('pr-a', [
      {
        filePath: 'src/payment.service.ts',
        changedTerms: [firstBodyChange, secondBodyChange],
        occurrences: [],
      },
    ]);
    const factsB = facts('pr-b', [
      { filePath: 'src/checkout.service.ts', changedTerms: [], occurrences: [term('processPayment', 20)] },
    ]);

    const matches = computeTechnicalTermMatches(factsA, factsB);

    expect(matches).toHaveLength(2);
    const changedStartLines = matches.map((m) => m.changedRegionLocation.range.start.line).sort();
    expect(changedStartLines).toEqual([3, 7]);
  });
});

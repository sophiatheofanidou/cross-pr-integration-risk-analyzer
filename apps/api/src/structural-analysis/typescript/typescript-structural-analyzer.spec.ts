import { describe, expect, it } from 'vitest';
import type { SourceRange } from '../../domain/source-location.js';
import { TypeScriptStructuralAnalyzer } from './typescript-structural-analyzer.js';

function range(startLine: number, startColumn: number, endLine: number, endColumn: number): SourceRange {
  return { start: { line: startLine, column: startColumn }, end: { line: endLine, column: endColumn } };
}

function termNames(occurrences: readonly { technicalTerm: string }[]): string[] {
  return occurrences.map((occurrence) => occurrence.technicalTerm);
}

describe('TypeScriptStructuralAnalyzer', () => {
  const analyzer = new TypeScriptStructuralAnalyzer();

  it('associates a change inside a function body with the enclosing function name', () => {
    const content = [
      'function processPayment(amount) {',
      '  return authorizeAndCapture(amount);',
      '}',
      '',
    ].join('\n');
    // Only line 2 (the body) changed; "processPayment" itself is on line 1.
    const changedRanges = [range(2, 1, 2, 39)];

    const result = analyzer.analyze({ filePath: 'payment.service.ts', content, changedRanges });

    expect(termNames(result.changedTerms)).toContain('processPayment');
    expect(termNames(result.changedTerms)).toContain('authorizeAndCapture');
    expect(result.malformed).toBe(false);
  });

  it('preserves the actual changed range separately from the enclosing declaration name range', () => {
    const content = [
      'function processPayment(amount) {',
      '  return authorizeAndCapture(amount);',
      '}',
      '',
    ].join('\n');
    const bodyChangedRange = range(2, 1, 2, 39);

    const result = analyzer.analyze({ filePath: 'payment.service.ts', content, changedRanges: [bodyChangedRange] });

    const enclosingAssociation = result.changedTerms.find((term) => term.technicalTerm === 'processPayment');
    expect(enclosingAssociation).toBeDefined();
    // The term's own syntax range is the declaration name on line 1...
    expect(enclosingAssociation!.range.start.line).toBe(1);
    // ...but the actual changed range that caused the association is the body on line 2.
    expect(enclosingAssociation!.changedRange).toEqual(bodyChangedRange);
  });

  it('finds occurrences throughout the resulting content, not only inside changed ranges', () => {
    const content = [
      'function processPayment(amount) {',
      '  return amount;',
      '}',
      '',
      'const result = processPayment(10);',
      '',
    ].join('\n');

    const result = analyzer.analyze({ filePath: 'payment.service.ts', content, changedRanges: [] });

    const callOccurrence = result.occurrences.find(
      (occurrence) => occurrence.technicalTerm === 'processPayment' && occurrence.range.start.line === 5,
    );
    expect(callOccurrence).toBeDefined();
  });

  it('captures classes, methods, interfaces, types, properties and parameters as technical terms', () => {
    const content = [
      'class PaymentService {',
      '  private total: number = 0;',
      '  charge(amount: number): void {',
      '    this.total = amount;',
      '  }',
      '}',
      '',
      'interface PaymentModel {',
      '  amount: number;',
      '}',
      '',
      'type PaymentId = string;',
      '',
    ].join('\n');

    const result = analyzer.analyze({ filePath: 'payment.ts', content, changedRanges: [] });
    const names = new Set(termNames(result.occurrences));

    expect(names.has('PaymentService')).toBe(true);
    expect(names.has('charge')).toBe(true);
    expect(names.has('total')).toBe(true);
    expect(names.has('amount')).toBe(true);
    expect(names.has('PaymentModel')).toBe(true);
    expect(names.has('PaymentId')).toBe(true);
  });

  it('does not turn comments or string contents into technical terms', () => {
    const content = [
      '// processPayment is mentioned here only in a comment',
      'const message = "processPayment failed";',
      'const x = 1;',
      '',
    ].join('\n');

    const result = analyzer.analyze({ filePath: 'notes.ts', content, changedRanges: [] });

    expect(termNames(result.occurrences)).not.toContain('processPayment');
  });

  it('finds a matching occurrence inside an object property value without treating the value text as a term', () => {
    const content = ['const config = {', '  handler: processPayment,', '};', ''].join('\n');

    const result = analyzer.analyze({ filePath: 'config.ts', content, changedRanges: [] });

    expect(termNames(result.occurrences)).toContain('processPayment');
  });

  it('produces a zero-width changed range that still associates with the enclosing function for a deletion-only edit', () => {
    const content = ['function processPayment(amount) {', '  return amount;', '}', ''].join('\n');
    // A deletion-only edit inside the body is represented as a zero-width anchor.
    const deletionAnchor = range(2, 17, 2, 17);

    const result = analyzer.analyze({
      filePath: 'payment.service.ts',
      content,
      changedRanges: [deletionAnchor],
    });

    expect(termNames(result.changedTerms)).toContain('processPayment');
  });

  it('reports malformed when the changed region cannot provide reliable structural facts', () => {
    // Deliberately unparseable content at the changed region.
    const content = ['function {{{ broken syntax', ''].join('\n');
    const changedRanges = [range(1, 1, 1, 28)];

    const result = analyzer.analyze({ filePath: 'broken.ts', content, changedRanges });

    expect(result.malformed).toBe(true);
  });

  it('does not mark the whole file malformed when only an unrelated region has a parser error', () => {
    const content = [
      'function processPayment(amount) {',
      '  return amount;',
      '}',
      '',
      'function {{{ broken',
      '',
    ].join('\n');
    // Changed range is inside the well-formed function, not the broken one.
    const changedRanges = [range(2, 3, 2, 16)];

    const result = analyzer.analyze({ filePath: 'partial.ts', content, changedRanges });

    expect(termNames(result.changedTerms)).toContain('processPayment');
    expect(result.malformed).toBe(false);
  });

  it('gives every occurrence a usable enclosing range for a focused snippet', () => {
    const content = [
      'function processPayment(amount) {',
      '  const total = amount;',
      '  return total;',
      '}',
      '',
    ].join('\n');

    const result = analyzer.analyze({ filePath: 'payment.ts', content, changedRanges: [] });
    const totalReference = result.occurrences.find(
      (occurrence) => occurrence.technicalTerm === 'total' && occurrence.range.start.line === 3,
    );

    expect(totalReference).toBeDefined();
    // The enclosing range should be the tight "return total;" statement, not the whole function.
    expect(totalReference!.enclosingRange.start.line).toBe(3);
    expect(totalReference!.enclosingRange.end.line).toBe(3);
  });
});

/**
 * TypeScript structural analyzer, implemented with Tree-sitter and the
 * `tree-sitter-typescript` grammar (TypeScript only, not TSX).
 *
 * See docs/design/04-candidate-discovery.md (Language-Aware Structural
 * Analysis, Technical Term). This module is the only place that touches
 * Tree-sitter parser nodes or TypeScript-specific syntax-node names; it
 * translates them into the language-neutral `StructuralAnalysisResult`
 * shape defined in ../structural-analyzer.js.
 */

import Parser from 'tree-sitter';
import TypeScriptBinding from 'tree-sitter-typescript';
import type { SourcePosition, SourceRange } from '../../domain/source-location.js';
import { rangesEqual, rangesOverlap } from '../../shared/source-range.js';
import type {
  ChangedTermAssociation,
  StructuralAnalysisInput,
  StructuralAnalysisResult,
  StructuralAnalyzer,
  StructuralTermOccurrence,
} from '../structural-analyzer.js';

/**
 * Leaf syntax-node types that carry a name: declarations, parameters,
 * properties and references/calls all surface as one of these
 * (docs/design/04-candidate-discovery.md, Technical Term: "functions,
 * methods, classes, interfaces and types, variables and parameters,
 * properties, and matching calls or references"). Keywords, comments and
 * string contents never produce one of these node types, so they are
 * excluded structurally rather than by text filtering.
 */
const NAME_NODE_TYPES = new Set([
  'identifier',
  'property_identifier',
  'type_identifier',
  'shorthand_property_identifier',
  'shorthand_property_identifier_pattern',
]);

/**
 * Named declaration node types whose `name` field identifies a relevant
 * enclosing construct (docs/design/04-candidate-discovery.md example:
 * associating a change with the enclosing `processPayment` function even
 * when the changed lines do not contain its name).
 */
const DECLARATION_NODE_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_signature',
  'class_declaration',
  'abstract_class_declaration',
  'method_definition',
  'method_signature',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'public_field_definition',
  'property_signature',
  'variable_declarator',
]);

/**
 * Standard-library globals are not repository-owned integration contracts.
 * They are ignored only when the file does not declare a same-named symbol,
 * so a project is still free to define (for example) its own `String`.
 */
const STANDARD_LIBRARY_GLOBALS = new Set([
  'Array',
  'BigInt',
  'Boolean',
  'Date',
  'Error',
  'Intl',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'Reflect',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'URL',
  'URLSearchParams',
  'WeakMap',
  'WeakSet',
]);

const STANDARD_LIBRARY_MEMBER_NAMES = new Set([
  'padEnd',
  'padStart',
]);

/**
 * Node types that bound how far an occurrence's enclosing snippet grows.
 * Walking up from an occurrence stops just below the nearest one of these,
 * so a top-level declaration's enclosing range is itself, while a
 * reference nested in a block or literal keeps a tight enclosing
 * statement rather than the whole file.
 */
const ENCLOSING_BOUNDARY_TYPES = new Set([
  'program',
  'statement_block',
  'class_body',
  'interface_body',
  'enum_body',
  'object',
  'object_type',
  'array',
]);

function toSourcePosition(point: Parser.Point): SourcePosition {
  return { line: point.row + 1, column: point.column + 1 };
}

function toSourceRange(node: Parser.SyntaxNode): SourceRange {
  return {
    start: toSourcePosition(node.startPosition),
    end: toSourcePosition(node.endPosition),
  };
}

function toPoint(position: SourcePosition): Parser.Point {
  return { row: position.line - 1, column: position.column - 1 };
}

function collectNameNodes(
  node: Parser.SyntaxNode,
  results: Parser.SyntaxNode[],
): void {
  if (NAME_NODE_TYPES.has(node.type) && !node.isMissing) {
    results.push(node);
  }
  for (const child of node.namedChildren) {
    collectNameNodes(child, results);
  }
}

function isDeclarationName(node: Parser.SyntaxNode): boolean {
  const parent = node.parent;
  return parent !== null &&
    DECLARATION_NODE_TYPES.has(parent.type) &&
    parent.childForFieldName('name')?.id === node.id;
}

function isUnshadowedStandardLibraryGlobal(
  node: Parser.SyntaxNode,
  declaredNames: ReadonlySet<string>,
): boolean {
  return node.type === 'identifier' &&
    STANDARD_LIBRARY_GLOBALS.has(node.text) &&
    !declaredNames.has(node.text);
}

function isStandardLibraryMember(
  node: Parser.SyntaxNode,
  declaredNames: ReadonlySet<string>,
): boolean {
  if (
    node.type !== 'property_identifier' ||
    !STANDARD_LIBRARY_MEMBER_NAMES.has(node.text) ||
    declaredNames.has(node.text)
  ) {
    return false;
  }
  const memberExpression = node.parent;
  const receiver = memberExpression?.type === 'member_expression'
    ? memberExpression.childForFieldName('object')
    : null;
  if (receiver === null) {
    return false;
  }
  if (receiver.type === 'string') {
    return true;
  }
  return [...STANDARD_LIBRARY_GLOBALS].some(
    (globalName) => !declaredNames.has(globalName) && receiver.text.startsWith(`${globalName}(`),
  );
}

function findEnclosingRange(node: Parser.SyntaxNode): Parser.SyntaxNode {
  let current = node;
  while (current.parent !== null && !ENCLOSING_BOUNDARY_TYPES.has(current.parent.type)) {
    current = current.parent;
  }
  return current;
}

function findEnclosingDeclaration(
  rootNode: Parser.SyntaxNode,
  changedRange: SourceRange,
): Parser.SyntaxNode | null {
  let current: Parser.SyntaxNode | null = rootNode.descendantForPosition(
    toPoint(changedRange.start),
  );
  while (current !== null) {
    if (DECLARATION_NODE_TYPES.has(current.type)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Whether a changed range sits inside a parser-error recovery subtree, by
 * walking from the smallest containing node up to the root
 * (docs/design/04-candidate-discovery.md, Analysis Warnings). Scoping the
 * check to each changed range's own ancestor chain, rather than the whole
 * tree's `hasError`, means a recoverable parser error elsewhere in the file
 * does not by itself make an unrelated changed region malformed.
 */
function sitsInsideErrorSubtree(node: Parser.SyntaxNode | null): boolean {
  let current = node;
  while (current !== null) {
    if (current.type === 'ERROR' || current.isMissing) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function hasUnreliableChangedRegion(
  rootNode: Parser.SyntaxNode,
  changedRanges: readonly SourceRange[],
): boolean {
  return changedRanges.some((changedRange) => {
    const startNode = rootNode.descendantForPosition(toPoint(changedRange.start));
    const endNode = rootNode.descendantForPosition(toPoint(changedRange.end));
    return sitsInsideErrorSubtree(startNode) || sitsInsideErrorSubtree(endNode);
  });
}

export class TypeScriptStructuralAnalyzer implements StructuralAnalyzer {
  private readonly parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(TypeScriptBinding.typescript);
  }

  analyze(input: StructuralAnalysisInput): StructuralAnalysisResult {
    const tree = this.parser.parse(input.content);
    const rootNode = tree.rootNode;

    const nameNodes: Parser.SyntaxNode[] = [];
    collectNameNodes(rootNode, nameNodes);

    const declaredNames = new Set(
      nameNodes.filter(isDeclarationName).map((node) => node.text),
    );
    const repositoryNameNodes = nameNodes.filter(
      (node) =>
        !isUnshadowedStandardLibraryGlobal(node, declaredNames) &&
        !isStandardLibraryMember(node, declaredNames),
    );

    const occurrences: StructuralTermOccurrence[] = repositoryNameNodes.map((node) => ({
      technicalTerm: node.text,
      range: toSourceRange(node),
      enclosingRange: toSourceRange(findEnclosingRange(node)),
    }));

    // Each occurrence keeps the specific changed range that caused its
    // inclusion, distinct from its own syntax range, so callers can select
    // the hunk/snippet around the actual change rather than around the
    // term's declaration site.
    const changedTerms: ChangedTermAssociation[] = [];
    for (const occurrence of occurrences) {
      const overlappingChangedRange = input.changedRanges.find((changedRange) =>
        rangesOverlap(occurrence.range, changedRange),
      );
      if (overlappingChangedRange !== undefined) {
        changedTerms.push({ ...occurrence, changedRange: overlappingChangedRange });
      }
    }

    for (const changedRange of input.changedRanges) {
      const enclosingDeclaration = findEnclosingDeclaration(rootNode, changedRange);
      if (enclosingDeclaration === null) {
        continue;
      }
      const nameNode = enclosingDeclaration.childForFieldName('name');
      if (nameNode === null) {
        continue;
      }
      const nameRange = toSourceRange(nameNode);
      const alreadyPresent = changedTerms.some(
        (term) =>
          term.technicalTerm === nameNode.text &&
          rangesEqual(term.range, nameRange) &&
          rangesEqual(term.changedRange, changedRange),
      );
      if (!alreadyPresent) {
        changedTerms.push({
          technicalTerm: nameNode.text,
          range: nameRange,
          changedRange,
          enclosingRange: toSourceRange(enclosingDeclaration),
        });
      }
    }

    const malformed =
      input.changedRanges.length > 0 && hasUnreliableChangedRegion(rootNode, input.changedRanges);

    return { changedTerms, occurrences, malformed };
  }
}

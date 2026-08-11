# Repository Context Retrieval

## Purpose

Repository Context Retrieval prepares the information required to evaluate a selected Candidate Pair.

Candidate Discovery establishes that two pull requests have an objective technical relationship.

Repository Context Retrieval then asks:

> What additional code context is useful for understanding that relationship?

The goal is to provide enough relevant information for meaningful AI reasoning while avoiding unnecessary repository content and token usage.

---

## Input

Repository Context Retrieval receives:

- Candidate Pair
- Pull Request A diff
- Pull Request B diff
- Candidate Discovery Evidence[]
- Structural information produced during Candidate Discovery, when available
- Access to selected repository file contents

The stage does not independently decide which pull request pairs should be analyzed.

---

## Source-Content Acquisition Boundary

Repository Context Retrieval determines what additional source context is relevant to a Candidate Pair.

The actual retrieval of repository contents is performed through the Source Control Integration. Repository Context Retrieval does not call provider-specific APIs directly.

Content already retrieved during Candidate Discovery is reused when it satisfies the context request. The same file version should not be retrieved repeatedly within one analysis run without a specific reason.

Available diff hunks remain the primary change context.

When a diff hunk does not contain enough context to identify an enclosing function, method, class, definition or reference, Repository Context Retrieval may request the relevant bounded file version.

The retrieved file is used locally to select the smallest useful context unit. Retrieving a file does not mean that the complete file is automatically included in the Context Bundle or sent to the AI.

When relevant content is binary, oversized, unavailable or otherwise unsupported, the limitation is recorded explicitly. Missing content must not be silently represented as an absence of relevant code.

---

## Retrieval Principles

Repository context should be:

- relevant,
- focused,
- bounded,
- explainable,
- reusable.

The retrieval strategy should follow the technical evidence that caused the pair to become a candidate rather than retrieve unrelated repository content.

---

## Context Construction

The base Context Bundle combines information from both pull requests with selected repository context.

Conceptually:

```text
Candidate Pair
      ↓
Candidate Evidence
      ↓
Relevant Context Selection
      ↓
Context Bundle
```

The Context Bundle may contain:

```text
Context Bundle
├── PR A metadata
├── PR A relevant diff hunks
├── PR B metadata
├── PR B relevant diff hunks
├── Candidate Evidence[]
├── Relevant Code Context[]
└── Coverage Limitations[]
```

---

## Pull Request Changes

The diffs of both pull requests are the primary source of context.

The system should prefer relevant changed hunks rather than automatically sending every changed line when a pull request is very large.

Useful information includes:

- changed file path,
- change type,
- relevant diff hunk,
- nearby changed code.

---

## Context Derived from Candidate Evidence

The evidence rule ID determines what additional context is useful.

### Same Changed File

If both PRs modify the same file, relevant context may include:

- both changed regions,
- their enclosing functions or methods,
- nearby code when required to understand the relationship.

---

### Shared Identifier

If both PRs contain the same relevant identifier, context may include:

- the relevant occurrences,
- enclosing code structures,
- the surrounding changed hunks.

---

### Modified Definition Referenced by the Other PR

If one PR modifies a definition and another references it, the Context Bundle may include:

```text
modified definition
+
relevant call/reference
+
enclosing method/function context
```

This provides the AI with more useful information than sending two isolated matching lines.

---

## Structural Context

Where structural analysis is available, Repository Context Retrieval can reuse information already extracted during Candidate Discovery.

Examples include:

- enclosing function or method,
- enclosing class,
- changed definition body,
- location of a relevant call or reference.

Structural information should be reused rather than reparsed unnecessarily.

---

## Bounded Code Context

The system should avoid automatically providing entire large files.

Preferred context units include:

- relevant diff hunks,
- enclosing function or method,
- bounded line ranges around a relevant reference.

A full file may be included when it is small and directly relevant, but full-file retrieval is not the default strategy.

---

## Retrieval Reasons

Every additional repository snippet should have a clear reason for being included.

Examples:

```text
Reason:
Contains the method definition modified by PR A.
```

```text
Reason:
Contains the call identified by Candidate Discovery in PR B.
```

This preserves explainability and makes it easier to understand why specific context was sent to the AI.

---

## Context Deduplication

The same code may be relevant to multiple pieces of evidence.

Duplicate snippets should be removed before the Context Bundle is sent to later stages.

This reduces unnecessary context and token usage without changing the available information.

---

## Output

Repository Context Retrieval produces a structured Context Bundle.

Conceptually:

```text
Context Bundle
├── Pull Request A
│   └── Relevant Changes
│
├── Pull Request B
│   └── Relevant Changes
│
├── Evidence[]
├── Repository Context[]
│   ├── File / Symbol
│   ├── Code Snippet
│   └── Retrieval Reason
│
└── Coverage Limitations[]
```

This Context Bundle becomes the input to AI Risk Analysis.

---

## System Boundaries

Repository Context Retrieval is responsible for:

- selecting relevant repository information,
- expanding Candidate Discovery evidence with useful code context,
- bounding the amount of retrieved content,
- removing duplicate context,
- preserving the reason for each retrieved snippet,
- preparing structured AI input.

Repository Context Retrieval is not responsible for:

- selecting Candidate Pairs,
- deciding whether an integration risk exists,
- assigning severity,
- estimating confidence,
- generating reviewer recommendations,
- performing AI reasoning.

---

## Future Evolution

The retrieval strategy may later evolve through:

- richer structural indexes,
- cross-file symbol resolution,
- semantic retrieval,
- retrieval-augmented generation,
- agentic repository search,
- an external Repository Context Provider.

These strategies may replace or enrich the retrieval implementation without changing the responsibility of this stage.

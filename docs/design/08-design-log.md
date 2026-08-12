# Design Log

This document records the main architectural and product decisions made during the design of the Cross-PR Integration Risk Analyzer.

Its purpose is to preserve the reasoning behind important choices without repeating detailed design information from the component documents.

---

# Accepted Decisions

## ADR-001 — Deterministic Candidate Discovery Before AI

**Status:** Accepted

### Decision

Candidate Discovery performs inexpensive deterministic analysis before AI Risk Analysis.

### Reason

The deterministic stage:

- reduces unnecessary AI usage,
- produces explainable Candidate Pair evidence,
- remains reproducible,
- is straightforward to test.

The system does not attempt to solve semantic integration risk deterministically.

Semantic interpretation remains the responsibility of AI Risk Analysis.

---

## ADR-002 — Human-in-the-Loop

**Status:** Accepted

### Decision

The system never automatically approves, rejects or merges pull requests.

### Reason

The objective is to improve reviewer awareness and prioritization rather than replace engineering judgement.

---

## ADR-003 — Approved Pull Requests as the Primary Analysis Scope

**Status:** Accepted

### Decision

The primary workflow analyzes open, non-draft, approved pull requests targeting the same selected branch.

### Reason

The project focuses on changes that have already passed normal individual code review and are realistic candidates for integration.

---

## ADR-004 — Cross-PR Integration Risk, Not Git Merge Conflict Detection

**Status:** Accepted

### Decision

Git-detectable textual merge conflicts are outside the responsibility of the analyzer.

### Reason

Existing source-control tooling already identifies textual merge conflicts.

The project focuses on changes that can coexist textually but may still be semantically or behaviourally incompatible.

---

## ADR-005 — Lightweight Candidate Evidence Instead of Full Static Analysis

**Status:** Accepted

### Decision

Candidate Discovery uses lightweight technical evidence rather than attempting complete static-program analysis.

### Reason

The deterministic stage only needs to identify which PR pairs deserve semantic analysis.

Complete dependency and semantic resolution would significantly increase implementation complexity without being necessary for the portfolio MVP.

---

## ADR-006 — No Interaction Score in the Initial Design

**Status:** Accepted

### Decision

Candidate Pair selection does not initially depend on weighted evidence or a numeric Interaction Score.

A pair becomes a candidate when at least one configured meaningful technical evidence rule matches.

### Reason

The previous scoring model introduced arbitrary weights and thresholds before there was evidence that ranking was necessary.

If candidate volume later becomes excessive, evidence ranking can be introduced based on measured behaviour.

---

## ADR-007 — Structural Analysis Through a Replaceable Analyzer

**Status:** Accepted

### Decision

Candidate Discovery may enrich basic file/diff evidence through language-aware structural analysis.

The initial implementation uses Tree-sitter.

### Reason

Structural parsing provides stronger evidence than raw string matching while remaining deterministic and inexpensive.

The architecture does not depend permanently on Tree-sitter; structural analysis remains a replaceable capability.

---

## ADR-008 — Tree-sitter Provides Structural, Not Full Semantic, Analysis

**Status:** Accepted

### Decision

Tree-sitter is used to identify syntactic structures such as:

- functions,
- methods,
- classes,
- calls,
- changed enclosing structures.

It is not treated as a complete symbol-resolution engine.

### Reason

Complete resolution across imports, aliases, overloads, inheritance and dynamic behaviour would substantially increase complexity.

The AI stage can evaluate uncertain structural relationships.

---

## ADR-009 — Focused Repository Context

**Status:** Accepted

### Decision

AI Risk Analysis receives a focused Context Bundle rather than the complete repository.

### Reason

Focused context:

- reduces token usage,
- reduces irrelevant information,
- improves explainability,
- makes AI cost easier to control.

---

## ADR-010 — Tiered AI Analysis

**Status:** Accepted

### Decision

AI Risk Analysis separates:

1. inexpensive screening,
2. detailed reasoning for suspicious or uncertain candidates.

### Reason

Not every technically related Candidate Pair requires the strongest available AI model.

Tiered analysis provides an explicit cost-control mechanism while preserving deeper reasoning where necessary.

---

## ADR-011 — Uncertain Screening Results Are Escalated

**Status:** Accepted

### Decision

The screening model should escalate uncertain Candidate Pairs rather than dismiss them.

### Reason

Screening exists to remove clearly uninteresting relationships, not to aggressively optimize cost at the expense of obvious recall loss.

---

## ADR-012 — Application-Level Result Caching

**Status:** Accepted

### Decision

AI analysis results are cached when the relevant pull request versions and analysis inputs remain unchanged.

### Reason

Repeated analysis of unchanged PR pairs should not result in repeated AI cost.

A valid cached result can be reused without making another AI request.

---

## ADR-013 — Prompt Caching as an Additional Optimization

**Status:** Accepted

### Decision

Provider-level prompt caching may be used when available to reuse repeated stable prompt content across different analyses.

### Reason

The same PR or shared instructions may appear in multiple AI requests.

Prompt caching can reduce repeated input processing while remaining independent from application-level result caching.

---

## ADR-014 — Portfolio MVP Over Exhaustive Detection

**Status:** Accepted

### Decision

The first implementation prioritizes a complete, explainable and demonstrable workflow rather than exhaustive semantic coverage.

### Reason

The purpose of the project is to demonstrate strong engineering and AI-integration decisions within a reasonable portfolio implementation scope.

---

## ADR-015 — Bounded On-Demand Repository Content Retrieval

**Status:** Accepted

### Decision

Available pull-request diffs are the primary representation of change.

When Candidate Discovery or Repository Context Retrieval requires more source context, the system retrieves only selected repository file versions through the Source Control Integration.

For bounded supported text files, before-and-after versions may be used to construct a local diff when the provider-supplied patch is unavailable or insufficient.

The before version is the immutable comparison base used to identify the changes introduced by the pull request; the after version is the immutable pull-request head. This decision does not define the current target-branch tip as the before version and does not introduce simulated-merge analysis.

Retrieved contents are reused within the analysis run.

Binary, unsupported, unavailable or oversized content is handled gracefully and produces explicit coverage information when its exclusion may affect the result.

Analysis-coverage information is diagnostic metadata and does not introduce an additional Candidate Discovery evidence rule.

### Reason

Provider-supplied patches may not contain enough syntactic or enclosing context for structural analysis and focused retrieval.

Targeted source retrieval supports accurate deterministic analysis without sending the complete repository to the AI or introducing repository-wide indexing.

Keeping retrieval behind the Source Control Integration preserves the ability to support additional Git platforms through provider-specific adapters.

---

## ADR-016 — Zod for External Runtime Validation

**Status:** Accepted

### Decision

Zod is the single primary runtime-schema validation approach for the MVP.

Runtime validation is applied where external structured data enters the application. `M2` validates focused subsets of GitHub REST responses inside the GitHub adapter before normalization. `M6` applies the same approach to AI-generated screening and detailed-analysis output before constructing the corresponding domain results.

Boundary types are inferred from Zod schemas where practical and remain local to their provider adapters. The provider-neutral domain contracts remain hand-written and separate from provider response shapes.

Runtime schemas validate data shape, primitive types, required fields, nullability and allowed values. Provider-specific normalization and application business rules remain separate responsibilities.

Malformed external payloads are rejected explicitly and are not treated as valid domain data, dismissals or no-risk results. Recovery behaviour is decided within the milestone that implements the relevant provider integration.

Internal objects are not revalidated between every pipeline stage, and a second schema system is not introduced without a concrete approved need.

### Reason

The MVP needs one understandable validation approach for nested GitHub data in `M2` and structured Claude output in `M6`. Zod provides TypeScript-oriented schema composition, inferred boundary types, structured validation errors and direct support for discriminated unions without requiring the application to build and maintain handwritten validation infrastructure.

Zod can convert schemas to JSON Schema, including an OpenAPI-compatible target. This preserves a practical path toward later OpenAPI tooling without deciding the `M8` HTTP framework, API surface or contract-sharing strategy now.

JSON Schema with TypeBox and handwritten type guards remain viable techniques, but neither offers a proportionate advantage for these MVP boundaries. TypeBox would prioritize a JSON Schema-oriented authoring model before OpenAPI is a confirmed requirement, while handwritten guards would require repetitive nested validation and custom error reporting across both provider boundaries.

---

# Superseded Decisions

## Previous Language-Agnostic-Only Candidate Discovery

**Status:** Superseded

### Previous Decision

Language-specific parsing was originally deferred entirely.

### Revised Decision

The architecture retains a generic deterministic fallback but now supports optional structural analysis.

The MVP will demonstrate Tree-sitter structural parsing for selected languages.

---

## Previous Interaction Evidence Score

**Status:** Superseded

### Previous Decision

Candidate evidence would contribute to a weighted Interaction Score used for ranking and threshold selection.

### Revised Decision

The first implementation selects Candidate Pairs directly from meaningful evidence.

Numeric ranking may be reconsidered only if candidate volume creates a practical need.

---

## Parser-Assisted Retrieval as Future-Only Work

**Status:** Superseded

### Previous Decision

Language-specific parsing was considered future work.

### Revised Decision

Structural parsing now participates directly in Candidate Discovery and can also support focused context retrieval.

---

# Open Questions

## OQ-001 — Candidate Volume

How many Candidate Pairs will the selected deterministic evidence rules produce on realistic repositories?

**Status:** To be observed during implementation.

A formal benchmark is not required before the MVP is completed.

---

## OQ-002 — Concrete AI Models

Which specific models should be used for:

- Screening,
- Detailed Analysis?

**Status:** Implementation configuration.

The architecture defines the roles rather than fixed model names.

---

## OQ-003 — Context Size

How much code context should be included before additional information stops improving analysis quality?

**Status:** Tune during implementation.

Formal optimization is deferred.

---

## OQ-004 — Reviewer Scope Filtering

Should the first UI version support filtering PR relationships by reviewer, author or responsible engineer?

**Status:** Optional MVP enhancement.

---

# Future Investigations

## IDEA-001 — Controlled Benchmark Repository

Create controlled pull request scenarios with known outcomes for measuring:

- recall,
- false positives,
- candidate reduction,
- AI cost,
- regression behaviour.

---

## IDEA-002 — Additional Structural Languages

Extend structural analysis to additional languages such as:

- Java,
- Kotlin.

---

## IDEA-003 — Richer Symbol Resolution

Evaluate more accurate cross-file symbol resolution if simple structural matching produces too many false positives or misses important relationships.

---

## IDEA-004 — Repository-Wide Structural Index

Evaluate whether indexing definitions and references across the repository improves Candidate Discovery enough to justify additional complexity.

---

## IDEA-005 — Agentic Candidate Discovery

Compare the deterministic approach against a tool-using AI agent capable of performing repository searches dynamically.

---

## IDEA-006 — Repository Context Provider / RAG

Investigate a standalone repository-context or RAG system that could later integrate through a replaceable Repository Context Provider abstraction.

---

## IDEA-007 — Cost and Recall Benchmarking

After the MVP is complete, compare:

- deterministic discovery,
- hybrid approaches,
- agentic discovery,
- different screening models,
- different detailed-analysis models.

Measure:

- recall,
- false positives,
- input tokens,
- output tokens,
- total AI cost,
- latency.

---

## IDEA-008 — Incremental Analysis

Explore continuous or event-driven analysis in which newly approved or updated pull requests are analyzed against the existing active PR set without repeating unnecessary work.

---

## IDEA-009 — Additional Providers

Future versions may support:

- GitLab,
- Azure Repos,
- additional AI providers.

These integrations should not require redesigning the central analysis responsibilities.

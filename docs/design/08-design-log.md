# Design Log

This document records the major product and architecture decisions of the Cross-PR Integration Risk Analyzer. It distinguishes decisions required by the simplified MVP from valuable improvements intentionally deferred until the core workflow is demonstrated.

---

# Accepted MVP Decisions

## ADR-001 — Deterministic Candidate Discovery Before AI

**Status:** Accepted

Candidate Discovery performs deterministic structural analysis before AI Risk Analysis.

This reduces unnecessary AI calls, produces reproducible evidence and preserves the product's set-level discovery value. Semantic risk interpretation remains the responsibility of AI.

---

## ADR-002 — Human-in-the-Loop

**Status:** Accepted

The system never automatically approves, rejects or merges pull requests. It provides evidence, explanations and reviewer actions.

---

## ADR-003 — Approved Pull Requests as the Primary Scope

**Status:** Accepted

The primary workflow analyzes open, non-draft, actively approved pull requests targeting the same selected branch.

These changes have already passed normal individual review and are realistic integration candidates.

---

## ADR-004 — Cross-PR Risk, Not Git Conflict Detection

**Status:** Accepted

Git-detectable textual merge conflicts are outside the analyzer's responsibility.

The project focuses on changes that can coexist textually but may still be semantically or behaviourally incompatible.

---

## ADR-005 — Language-Aware Structural Candidate Discovery

**Status:** Accepted

Candidate Discovery uses bounded language-aware structural analysis behind a replaceable analyzer boundary.

Concrete language support belongs to a release specification, not the architecture. The MVP does not add a lexical fallback merely to claim generic language coverage.

Structural parsing is lightweight evidence extraction, not full static or semantic program analysis.

---

## ADR-006 — Technical Term Matches as Candidate Evidence

**Status:** Accepted

Candidate Discovery represents evidence directly as Technical Term Matches.

A match contains:

- the technical term,
- the changed-region location,
- the matching-occurrence location.

Each unordered PR pair is evaluated in both directions. Same-file and cross-file locations use the same match shape.

A pair becomes a Candidate Pair when its match collection is non-empty:

```text
isCandidate = technicalTermMatches.length > 0
```

The contract stores neither a fixed evidence-rule ID nor a redundant candidate boolean.

Matching names do not prove semantic symbol identity. AI evaluates whether the structural relationship matters.

---

## ADR-007 — No Numeric Candidate Score

**Status:** Accepted

The MVP does not assign arbitrary weights or an Interaction Score to Candidate Discovery evidence.

Ranking may be reconsidered only when measured Candidate Pair volume demonstrates a practical need.

---

## ADR-008 — Context Retrieval Without Repository-Wide Retrieval

**Status:** Accepted

AI Risk Analysis receives relevant change hunks, Technical Term Matches, bounded enclosing snippets and explicit warnings rather than the complete repository. Match-centered material is selected before input limits are applied.

Context Retrieval remains a separate responsibility but is implemented as a small builder in the MVP, not as a standalone repository-context subsystem.

The provider is invoked only when at least one match retains sufficient change and source context. A discovered but unassessable pair remains visible with an explicit warning and no AI risk status.

---

## ADR-009 — One AI Assessment per Candidate Pair in the MVP

**Status:** Accepted

The MVP uses one validated Claude assessment per Candidate Pair with sufficient context.

Candidate Discovery already provides the first cost-control filter. A second AI screening tier is deferred until measurements justify its extra prompts, schemas and orchestration.

---

## ADR-010 — No Persistent Cache in the MVP

**Status:** Accepted

The MVP does not require persistent analysis caching. Each unique Candidate Pair is assessed once within one analysis run.

Persistent caching is an optimization of a repeated workflow, not a prerequisite for demonstrating the workflow itself.

---

## ADR-011 — Provider Patches with Bounded Local-Diff Fallback

**Status:** Accepted

Usable provider patches are the preferred MVP source for changed ranges. Resulting changed-file content is retrieved at the immutable pull-request head when structural occurrence search or enclosing context requires it.

For a modified file with a missing or insufficient provider patch, the MVP retrieves bounded versions of that selected file at the immutable change-base and head revisions and reconstructs a local line diff. The file is skipped with an explicit warning only if neither source can provide reliable changed ranges and resulting content. Added files treat their complete resulting content as changed.

This fallback protects the core one-language detection path from provider diff limits without introducing repository-wide retrieval or sending large patches to AI.

---

## ADR-012 — Explicit Warnings Instead of a Coverage Subsystem

**Status:** Accepted

Unavailable, oversized, unsupported or insufficient inputs produce simple structured analysis warnings.

The MVP must distinguish incomplete analysis from a completed analysis with no match, but it does not require a broad coverage taxonomy or dedicated subsystem.

---

## ADR-013 — Zod at External Structured-Data Boundaries

**Status:** Accepted

Zod validates focused GitHub responses and structured Claude output before normalization. Provider-neutral internal contracts remain hand-written and are not revalidated between every pipeline stage.

---

## ADR-014 — Synchronous MVP Analysis Operation

**Status:** Accepted

The first end-to-end application exposes one simple synchronous analysis operation. Background jobs, persisted run status and distributed orchestration are deferred.

---

## ADR-015 — Controlled Scenarios Developed with Candidate Discovery

**Status:** Accepted

Known related, unrelated and unsupported scenarios for the MVP's configured source language are implemented together with Candidate Discovery rather than postponed until final hardening.

The scenarios act as regression tests and as the foundation of the final product demonstration.

---

## ADR-016 — Portfolio MVP Over Exhaustive Detection

**Status:** Accepted

The first implementation prioritizes a complete, explainable and demonstrable workflow rather than production-scale coverage or optimization.

---

## ADR-017 — Reviewer-Facing Risk Result Contract

**Status:** Accepted

Each assessable Candidate Pair returns exactly one validated result. An identified risk contains a bounded `potentialIntegrationProblem`, one concrete `reviewerAction`, severity and confidence. A no-risk result contains a bounded `noRiskExplanation` and confidence.

The risk explanation must connect both pull requests, describe the plausible incompatibility or risky combined behavior and identify the potentially affected behavior or flow. It does not presume that either pull request necessarily changed an assumption. The reviewer action is imperative and grounded in supplied evidence when possible; it is not a remediation proposal.

Provider failures are represented as assessment-not-run for only the affected pair, while pair-relevant context warnings remain visible. Unexpected internal failures still fail the request instead of being mislabeled as provider failures.

---

# Planned Post-MVP Improvements

The decisions in this section are intentionally preserved. They are deferred from the first vertical slice, not rejected or forgotten.

## FUTURE-001 — Tiered AI Analysis

**Status:** Planned after MVP validation

Add inexpensive screening before detailed analysis when measured Candidate Pair volume and AI cost justify it.

The intended flow remains:

```text
Candidate Pair
      ↓
Cheap Screening
      ├── Dismiss
      └── Escalate to Detailed Analysis
```

Uncertain and materially incomplete cases should escalate. Before implementation, evaluate screening precision, recall loss, model cost and orchestration complexity.

---

## FUTURE-002 — SQLite Result Caching

**Status:** Planned after MVP validation

Add application-level persistent caching when repeated analyses of unchanged PR pairs become part of the workflow.

The cache key should include immutable PR revisions, retrieved context, prompt/schema versions and relevant model configuration. A valid hit avoids the AI request entirely.

SQLite remains the preferred local portfolio option because it provides durable storage without separate database infrastructure. The implementation should remain behind a replaceable cache interface.

If tiered analysis is introduced, screening and detailed results may be cached independently.

---

## FUTURE-003 — Provider Prompt Caching

**Status:** Planned when supported and measurable

Use provider prompt caching when repeated stable prompt prefixes produce meaningful savings.

Prompt caching reduces repeated input processing for new requests; it does not replace SQLite result caching, which can eliminate an unchanged request entirely.

This optimization stays inside the AI-provider adapter and does not change provider-neutral risk contracts.

---

## FUTURE-004 — Broader Structural Coverage

**Status:** Planned investigation

Evaluate:

- additional structural languages,
- deleted and renamed file analysis,
- richer symbol resolution,
- a bounded lexical fallback only if measured value exceeds noise.

---

## FUTURE-005 — Richer Repository Context

**Status:** Planned investigation

Evaluate repository indexes, semantic retrieval, RAG, agentic exploration and external Repository Context Providers when focused changed-file context proves insufficient.

One future experiment is to use the Claude API to propose affected technical terms from pull-request changes and selected context, then request bounded read-only search or snippet tools. The repository remains outside the model context and only selected occurrences or snippets are returned. Compare its recall, precision, cost and reproducibility with the Tree-sitter approach before considering adoption.

---

## FUTURE-006 — Operational and Product Evolution

**Status:** Planned investigation

Possible extensions include asynchronous jobs, persistent run history, continuous monitoring, richer reviewer filters, multiple providers and production deployment infrastructure.

---

# Superseded Decisions

## Previous Five-Rule Candidate Evidence Model

**Status:** Superseded

The earlier design defined separate IDs for same-file, shared-identifier, changed-identifier, shared-symbol and modified-definition evidence.

The categories overlapped relationship, detection method and syntactic role. They are replaced by the single `TechnicalTermMatch` evidence shape described in ADR-006.

---

## Previous Language-Agnostic Lexical MVP Fallback

**Status:** Superseded

The earlier MVP treated lexical matching as a generic fallback.

The revised MVP supports one structural language well and reports unsupported input explicitly. A lexical fallback remains only a measured future investigation.

---

## Previous Tiered-AI MVP Requirement

**Status:** Deferred, not rejected

Screening plus detailed analysis was previously required for the first version. It is now preserved as FUTURE-001 and will be added when candidate volume demonstrates the need.

---

## Previous Persistent-Cache MVP Requirement

**Status:** Deferred, not rejected

SQLite result caching and provider prompt caching were previously part of the first version. They are now preserved as FUTURE-002 and FUTURE-003.

---

# Open Questions to Measure

## OQ-001 — Candidate Volume

How many Candidate Pairs do Technical Term Matches produce in realistic repositories?

The answer determines whether ranking or tiered AI analysis becomes worthwhile.

## OQ-002 — Candidate Quality

Which extracted term kinds provide useful recall without excessive coincidental matches?

Controlled scenarios guide the first implementation; broader benchmarking follows the MVP.

## OQ-003 — Context Sufficiency

When are patches and enclosing changed-file snippets insufficient for reliable AI assessment?

The answer determines whether richer repository context should be introduced.

## OQ-004 — Repeated-Analysis Value

How often are unchanged PR pairs analyzed again across application runs?

The answer determines the practical value and priority of SQLite result caching.

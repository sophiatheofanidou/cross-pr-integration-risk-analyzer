# MVP Specification

## Purpose

This document defines the concrete scope and implementation boundaries of the first portfolio version of the Cross-PR Integration Risk Analyzer.

The objective is to build a complete and technically defensible end-to-end workflow within a limited implementation scope.

The MVP is not intended to prove the optimal candidate-discovery strategy or provide production-grade semantic analysis.

More extensive cost, recall and scalability benchmarking is considered future work.

---

## MVP Goals

The MVP should demonstrate that the system can:

- retrieve a set of approved pull requests from a real source-control platform,
- discover technically related pull request pairs without invoking AI for every possible pair,
- use structural code analysis to improve candidate evidence,
- construct focused repository context,
- use tiered AI reasoning to identify plausible cross-PR integration risks,
- avoid unnecessary repeated AI cost through caching,
- present explainable reviewer-facing findings through a usable interface.

---

## End-to-End MVP Workflow

```text
GitHub Repository
       ↓
Eligibility Selection
       ↓
Candidate Discovery
       ↓
Repository Context Retrieval
       ↓
AI Risk Analysis
       ↓
Risk Report
       ↓
Angular Dashboard
```

The detailed workflow is:

1. The user selects a GitHub repository.
2. The system retrieves eligible pull requests.
3. Eligible PRs are grouped by target branch.
4. Candidate Discovery generates unique PR pairs.
5. Basic deterministic evidence is evaluated.
6. Tree-sitter enriches supported files with structural evidence.
7. Pairs with meaningful technical evidence become Candidate Pairs.
8. Focused Context Bundles are constructed.
9. Existing cached AI results are reused when valid.
10. Remaining candidates are evaluated by the screening model.
11. Suspicious or uncertain candidates are escalated to detailed AI analysis.
12. Findings are presented in the Angular dashboard.

---

# Technology Choices

| Area | MVP Choice |
|---|---|
| Frontend | Angular |
| Backend | Node.js + TypeScript |
| Test Runner | Vitest |
| Source Control | GitHub |
| Source-Control API | GitHub REST API |
| Structural Parsing | Tree-sitter |
| Structural Languages | TypeScript and C# |
| AI Provider | Claude |
| AI Strategy | Screening tier + detailed-analysis tier |
| Result Cache | SQLite |
| Repository Context | Focused deterministic retrieval |
| RAG | Not included |
| Vector Database | Not included |

These are implementation choices for the first version rather than permanent architectural constraints.

---

# Pull Request Scope

The MVP analyzes pull requests that:

- are open,
- are not drafts,
- are approved,
- target the selected branch.

Pull requests that have not yet reached approved state are outside the primary analysis workflow.

For the GitHub MVP, eligibility uses the current effective review state:

- review comments do not override an approval decision,
- an active changes-requested decision makes a pull request ineligible,
- and at least one active approval is required.

---

# Source-Content Retrieval Scope

The GitHub MVP retrieves:

- pull request metadata and effective review state,
- changed-file metadata,
- available diff hunks,
- selected repository file versions when required by structural analysis or focused context retrieval.

Repository file contents are retrieved on demand rather than by downloading the complete repository.

A provider-supplied patch is the preferred initial representation of a file change.

When a patch is unavailable or insufficient for required structural or context analysis, the MVP may retrieve bounded before-and-after versions of the selected text file and construct the required diff locally.

This fallback is limited to relevant files and does not introduce repository-wide retrieval or indexing.

Binary, generated, unsupported or oversized files:

- may contribute file-level evidence,
- are not passed to Tree-sitter,
- are not automatically included in AI context,
- and produce an explicit coverage limitation when their exclusion may affect the analysis.

Concrete file-size and content limits are implementation configuration.

---

# Candidate Discovery Scope

Candidate Discovery includes a small set of explainable technical evidence.

### Basic Evidence

- same changed file,
- shared relevant identifier,
- identifier changed by one PR appearing in a file modified by another PR.

### Structural Evidence

Tree-sitter is used for:

- TypeScript,
- C#.

Structural information includes:

- function/method definitions,
- classes,
- calls/references,
- enclosing code structures.

### Required MVP Evidence Rules

The MVP implements exactly these five Candidate Discovery evidence rules:

- `SAME_CHANGED_FILE`,
- `SHARED_IDENTIFIER`,
- `CHANGED_IDENTIFIER_IN_OTHER_CHANGED_FILE`,
- `SHARED_CHANGED_SYMBOL`,
- `MODIFIED_DEFINITION_REFERENCED_BY_OTHER_PR`.

The MVP does not implement a numeric Interaction Score.

A pair becomes a Candidate Pair when at least one configured meaningful evidence rule matches.

---

# Tree-sitter Scope

The MVP uses Tree-sitter as lightweight structural parsing.

It does not attempt full semantic symbol resolution.

The implementation does not need to correctly resolve every case involving:

- imports,
- aliases,
- overloads,
- inheritance,
- dynamic dispatch.

The objective is to generate useful candidate evidence, not build a complete compiler or static-analysis platform.

Unsupported file types fall back to the basic language-independent Candidate Discovery rules.

---

# Repository Context Scope

Context Retrieval focuses on:

- relevant diff hunks,
- enclosing functions or methods,
- relevant call/reference snippets,
- Candidate Discovery evidence,
- selected directly related code.

The system does not automatically send complete repositories to the AI.

Large unrelated files and repository-wide historical information are outside the initial scope.

---

# AI Scope

The MVP uses two AI analysis roles.

## Screening

Every uncached Candidate Pair is first evaluated by a cheaper model.

Output:

```text
DISMISS
```

or:

```text
ESCALATE
```

with a short rationale.

Uncertain cases are escalated.

## Detailed Analysis

Escalated pairs are evaluated by a stronger model.

Detailed output includes:

- possible integration-risk scenario,
- explanation,
- supporting evidence,
- inferred assumption,
- confidence,
- severity,
- recommended reviewer check.

Specific model names remain configuration choices.

---

# Caching Scope

The MVP includes two different caching mechanisms where supported.

## Result Caching

The application stores previous analysis results using a key based on the analyzed PR versions and relevant analysis configuration.

If the same unchanged analysis is requested again, the stored result is returned without another AI request.

## Prompt Caching

When supported by the selected AI provider, repeated stable prompt content may be reused across related analyses to reduce repeated input cost.

Prompt caching is an optimization rather than a dependency of the core workflow.

---

# UI Scope

The Angular interface should allow the user to:

- select or provide a repository,
- select the target branch,
- start an analysis,
- view the number of eligible PRs and Candidate Pairs,
- view identified cross-PR findings,
- inspect the evidence connecting each pair,
- inspect severity and confidence,
- inspect the recommended reviewer check.

Filtering by reviewer, author or responsibility may be included if implementation time permits, but it is not required for the first complete workflow.

---

# Explicit Non-Goals

The MVP does not include:

- Git textual merge-conflict detection,
- automatic merge decisions,
- automatic PR approval or rejection,
- build execution,
- automated test execution,
- full static-program analysis,
- complete semantic symbol resolution,
- repository-wide symbol indexing,
- RAG,
- vector databases,
- support for multiple source-control platforms,
- support for multiple AI providers,
- continuous repository monitoring,
- production-grade authentication or billing.

---

# Cost-Efficiency Mechanisms

The MVP controls AI usage through:

```text
Deterministic Candidate Discovery
              ↓
       Focused Context
              ↓
       Cheap Screening
              ↓
 Detailed Analysis only if needed
```

Additional savings come from:

- result caching,
- prompt caching when supported,
- ignoring irrelevant/generated files,
- reusing structural-analysis results.

The MVP does not claim a fixed percentage of candidate reduction or a fixed per-repository AI cost.

---

# Canonical MVP Terminology

The following terms are used consistently across the MVP design and implementation:

| Term | Canonical meaning | MVP example |
|---|---|---|
| Candidate Discovery Evidence Rule | A deterministic check that can establish a meaningful technical relationship between two pull requests. | Both pull requests modify the same file. |
| Evidence Rule ID | The stable identifier of the evidence rule that matched. | `SAME_CHANGED_FILE` |
| Candidate Evidence | The structured record produced when an evidence rule matches. | An Evidence Rule ID, Technical Resource and locations in both pull requests. |
| Technical Resource | The file path, identifier or structural symbol connected by Candidate Evidence. | `processPayment` |
| File Change Type | How a changed file was affected. | `ADDED`, `MODIFIED`, `DELETED` or `RENAMED` |
| Retrieval Reason | Why a repository context snippet was included in a Context Bundle. | Contains the method definition modified by PR A. |
| Coverage Limitation | Relevant analysis coverage that is missing, unavailable or unsupported. It may be file-specific or apply to the wider analysis context. | An oversized relevant file was excluded from structural analysis. |
| Detailed Analysis Result | The structured outcome of Detailed Analysis with one of two Risk Status values. | `RISK_IDENTIFIED` or `NO_RISK_IDENTIFIED` |
| Risk Finding | The finding details present only when a Detailed Analysis Result has the `RISK_IDENTIFIED` status. | Explanation, supporting evidence, inferred assumption, confidence, severity and Recommended Reviewer Check. |
| Recommended Reviewer Check | What the human reviewer should verify. It does not perform or prescribe an automatic pull-request action. | Verify whether PR B still relies on the previous method contract. |

The complete allowed set of five Evidence Rule IDs is defined in **Required MVP Evidence Rules**.

Example Candidate Evidence:

```text
Evidence Rule ID:
MODIFIED_DEFINITION_REFERENCED_BY_OTHER_PR

Technical Resource:
processPayment

PR A Location:
src/payments/payment.service.ts

PR B Location:
src/checkout/checkout.service.ts
```

Detailed Analysis Result relationship:

```text
Detailed Analysis Result
├── RISK_IDENTIFIED
│   └── Risk Finding
└── NO_RISK_IDENTIFIED
    └── Explanation
```

---

# Success Criteria

The MVP is considered successful if it demonstrates the complete workflow and can:

- retrieve approved PRs from GitHub,
- generate Candidate Pairs using deterministic evidence,
- produce structural evidence from TypeScript and C# examples,
- identify designed cross-PR risks that are not ordinary Git conflicts,
- dismiss unrelated Candidate Pairs through screening,
- generate detailed explainable findings for escalated pairs,
- reuse cached results when PRs remain unchanged,
- reuse selected file contents across Candidate Discovery and Context Retrieval within one analysis run,
- handle missing patches without silently treating them as empty changes,
- continue gracefully when binary or oversized content cannot be analyzed,
- expose material analysis-coverage limitations to the reviewer,
- present the findings clearly in the Angular UI.

The primary success criterion is a credible and demonstrable engineering workflow rather than exhaustive detection accuracy.

---

# Future Work

After the portfolio MVP is complete, future evaluation may investigate:

- Java and Kotlin Tree-sitter support,
- richer symbol resolution,
- repository-wide indexing,
- agentic Candidate Discovery,
- different AI model tiers,
- deterministic versus AI-first discovery,
- cost versus recall benchmarking,
- additional Git providers,
- additional AI providers,
- continuous/incremental analysis.

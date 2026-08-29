# MVP Specification

## Purpose

This document defines the smallest complete portfolio version of the Cross-PR Integration Risk Analyzer.

The MVP must demonstrate the product's core value end to end: automatically discover approved pull-request pairs that have a concrete structural relationship, use focused AI reasoning to identify plausible non-textual integration risks, and present an explainable reviewer-facing result.

---

## MVP Workflow

```text
GitHub Repository and Target Branch
                ↓
Approved Pull Request Retrieval
                ↓
Unique Pull Request Pairs
                ↓
TypeScript Structural Candidate Discovery
                ↓
Context Retrieval
                ↓
Single Claude Risk Assessment
                ↓
Reviewer Dashboard
```

The workflow is:

1. The user provides a GitHub repository and target branch.
2. The backend retrieves open, non-draft, actively approved pull requests.
3. Every unordered pair targeting that branch is generated once.
4. Changed TypeScript files are analyzed structurally.
5. Pairs with at least one Technical Term Match become Candidate Pairs.
6. Relevant change hunks and enclosing snippets are prepared for each candidate.
7. Claude performs one structured risk assessment per Candidate Pair with sufficient context.
8. The Angular interface displays findings, evidence and warnings.

---

## Technology Choices

| Area | MVP Choice |
|---|---|
| Frontend | Angular |
| Backend | Node.js + TypeScript |
| Test Runner | Vitest |
| Runtime Validation | Zod at external-data boundaries |
| Source Control | GitHub REST API |
| Structural Parsing | Tree-sitter |
| Analyzed Source Language | TypeScript `.ts` files |
| AI Provider | Claude |
| AI Strategy | One structured assessment per Candidate Pair with sufficient context |
| Repository Context | Focused change hunks and source snippets |

These choices define the first implementation, not permanent architectural constraints.

---

## Pull Request Scope

The MVP analyzes pull requests that:

- are open,
- are not drafts,
- target the selected branch,
- have at least one active approval,
- have no active changes-requested decision.

Review comments do not replace a reviewer's latest decisive approval or changes-requested state.

---

## Candidate Discovery Scope

The MVP parses supported changed files once per pull request and records:

- technical terms associated with changed ranges,
- structural occurrences throughout each resulting changed file,
- source ranges needed for focused snippets.

For every unordered pair, it evaluates both directions:

```text
PR A changed terms ∩ PR B occurrences
PR B changed terms ∩ PR A occurrences
```

Each intersection produces a Technical Term Match:

```text
Technical Term Match
├── Technical Term
├── Changed-Region Location
└── Matching-Occurrence Location
```

A pair becomes a Candidate Pair when:

```text
technicalTermMatches.length > 0
```

The contract has no fixed evidence-rule ID and no separately stored candidate boolean.

Same-file and cross-file matches use the same shape. The matching occurrence may be outside the other pull request's patch, but it must be inside the resulting content of a file changed by that pull request.

Tree-sitter provides syntax, not complete semantic symbol resolution. Matching names remain evidence for AI investigation rather than proof of dependency.

---

## Supported File Cases

The first implementation structurally analyzes:

- added `.ts` files with an available resulting file,
- modified `.ts` files with an available resulting file and changed ranges obtained from either a usable provider patch or a bounded local diff between the immutable change-base and head versions.

The MVP reports a warning and skips structural matching for:

- deleted files,
- renamed files,
- modified files for which neither the provider patch nor bounded local reconstruction can provide reliable changed ranges,
- unavailable or oversized content,
- binary or non-UTF-8 content,
- malformed source that cannot be parsed reliably,
- source languages other than the supported MVP language.

Provider patches are preferred. Local reconstruction is performed only for the selected modified file when its patch is missing or insufficient; it does not clone, diff or index the complete repository. Unsupported cases reduce coverage but do not silently become “no relationship found”.

---

## Context Retrieval

For each Candidate Pair, Context Retrieval provides:

- concise PR metadata,
- Technical Term Matches,
- relevant provider or locally reconstructed change hunks,
- enclosing snippets around changed regions,
- bounded snippets around matching occurrences,
- analysis warnings relevant to either pull request in the pair.

Context Retrieval selects match-centered hunks and snippets before applying context limits; it does not blindly truncate a complete patch. The complete repository is never sent to Claude. The implementation reuses file contents and syntax ranges already obtained during Candidate Discovery.

Claude is invoked when at least one Technical Term Match retains its relevant change hunk and both required source contexts. If no match satisfies that minimum, the Candidate Pair remains visible with an assessment-not-run warning and no AI risk status is produced.

---

## AI Scope

Each Candidate Pair with sufficient context receives one Claude assessment.

The validated result contains:

- `RISK_IDENTIFIED` or `NO_RISK_IDENTIFIED`,
- a likely outcome, separate contribution from each pull request, combined effect and evidence-backed relevant code when a risk is identified,
- a relationship summary, independence reason and optional material coverage limitation when no risk is identified,
- confidence,
- severity when a risk is identified,
- one concrete verification action when a risk is identified, without prescribing an implementation fix.

The AI distinguishes deterministic evidence from semantic inference. It does not confirm defects or make merge decisions.

The provider adapter uses a flat structured-output schema and a 2,048-token output limit. The application validates relevant-code references against deterministic evidence, promotes objectively severe build/type-check/deployment or financial/security/data impact, isolates provider failures per pair and assesses no more than four Candidate Pairs concurrently. Source-control PR enrichment and resulting-content preparation also use bounded four-worker pools, preserving deterministic output order while reducing network wall time.

The MVP does not include a separate screening model.

---

## API and UI Scope

The backend exposes one simple analysis operation that accepts a repository and target branch and returns the completed report synchronously.

The MVP does not require background jobs, distributed queues, persisted analysis status or continuous monitoring.

The Angular interface provides:

- repository and branch input,
- an analysis action,
- eligible-PR and Candidate-Pair counts,
- risk results,
- Technical Term Match evidence,
- confidence and severity,
- reviewer actions,
- visible analysis warnings,
- a clear empty state when no Candidate Pairs are found.

Filtering, reviewer ownership views and advanced dashboards are deferred.

---

## Controlled Demo

The completed public demo uses eight open, approved pull requests created from the same base commit in the [Cross-PR Risk Demo Online Store](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store).

The four selected Candidate Pairs demonstrate:

- two independently valid contract changes that fail build/type-check when their intended pairs coexist,
- one cents-to-euros semantic mismatch that still builds but can under-authorize payment,
- one coincidental pair of module-local `formatReference` helpers that is correctly dismissed,
- one unsupported HTML file that produces a visible coverage warning.

The run produced 8 eligible PRs, 28 possible pairs, 4 Candidate Pairs, 24 pairs filtered before Claude, 3 risks, 1 no-risk result, no unassessed Candidate Pairs and 1 warning. Detailed expected-versus-actual evidence and provider usage belong in `docs/demo-evaluation.md`, not in this specification.

Automated controlled tests continue to cover additional boundaries such as resulting-content occurrences, provider-patch fallback, bounded local-diff reconstruction and insufficient-context handling.

---

## Explicit MVP Non-Goals

The MVP does not include:

- Git textual merge-conflict detection,
- builds or test execution for analyzed pull requests,
- automatic approval, rejection or merging,
- lexical Candidate Discovery fallback,
- additional structural languages,
- complete semantic symbol resolution,
- deleted or renamed file structural analysis,
- repository-wide indexing or RAG,
- tiered AI analysis,
- SQLite result caching,
- provider prompt caching,
- multiple source-control or AI providers,
- asynchronous job infrastructure,
- production authentication, billing or deployment infrastructure.

---

## Success Criteria

The MVP is successful when it can demonstrate that:

- real approved PRs can be retrieved from GitHub,
- TypeScript Technical Term Matches reduce the possible PR-pair set,
- a critical cross-file occurrence outside the other PR's patch is found,
- a modified file with a missing or insufficient provider patch can still participate through bounded local diff reconstruction,
- Claude identifies a designed integration-risk scenario that is not an ordinary Git conflict,
- Claude dismisses a structurally related but semantically unrelated pair,
- deterministic evidence, risk explanations, no-risk reasoning and reviewer actions are understandable in the UI,
- unsupported analysis is visible rather than silently ignored,
- a completed analysis with no Candidate Pairs is presented as a valid result,
- the complete workflow runs without repository-wide retrieval.

The controlled demo has met these behavioural criteria and validates the complete `v0.1.0` workflow against known ground truth.

---

## Planned Future Improvements

The canonical roadmap and its evidence gates are maintained under [Planned Post-MVP Improvements](08-design-log.md#planned-post-mvp-improvements) in the Design Log; this specification remains the source of truth for the implemented `v0.1.0` boundary.

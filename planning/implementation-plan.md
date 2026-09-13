# Cross-PR Integration Risk Analyzer — Implementation Plan

## Purpose

This plan implements the smallest credible end-to-end minimum viable product (MVP) before adding cost, scale or coverage optimizations.

The design documents in [`docs/design`](../docs/design/) define product responsibilities. This plan records implementation order, verification and coherent commit points.

---

## Working Method

For each milestone:

1. confirm the exact scope and scenarios,
2. produce a file-level implementation plan,
3. implement only the approved vertical slice,
4. add focused tests with the behaviour,
5. run test, type-check and lint verification,
6. review the complete diff before committing.

Optional infrastructure is introduced only when the milestone uses it.

---

## Current Checkpoint

**Status:** Released as `v0.1.0`

All planned MVP milestones (`M1`–`M6`) are complete and the release is published.

The `v0.1.0` release includes:

- the complete deterministic Candidate Discovery and bounded Context Retrieval pipeline,
- pair-scoped AI Risk Assessment,
- the synchronous API and Angular reviewer workspace,
- opt-in operational metrics and the local performance report,
- a reproducible controlled demonstration with documented expected and actual results,
- automated build, type-check, test and lint verification through GitHub Actions.

The controlled demonstration and operational measurements are documented in the [Controlled Demo Evaluation](../docs/demo-evaluation.md).

The `v0.1.0` tag marks the completed MVP baseline. Material findings discovered after this release belong in the post-MVP roadmap or a follow-up release rather than being described here as pre-tag work.

---

# Completed Milestones

## M1 — Initial Domain Contracts and Test Harness

**Status:** Complete under the previous design

The repository contains provider-neutral pull-request, candidate-evidence, context and AI-result contracts together with the Vitest harness.

Some contracts are now broader than the simplified MVP. M3 will replace the old evidence-rule model and remove obsolete context and AI-result types rather than preserving abstractions tied to the previous design.

Commit already completed:

```text
feat: add analysis domain contracts and minimal test harness
```

---

## M2 — GitHub Integration and Pull Request Eligibility

**Status:** Complete and retained

Implemented capabilities include:

- GitHub REST request handling and pagination,
- focused Zod response validation,
- effective review-state calculation,
- approved-PR eligibility,
- changed-file normalization,
- immutable comparison-base and head revisions,
- bounded selected-file retrieval,
- explicit unavailable-content results.

The robust provider boundary remains useful to the simplified MVP and is not redesigned.

Commit already completed:

```text
feat: retrieve and normalize eligible GitHub pull requests
```

---

## M3 — Controlled Scenarios and Structural Candidate Discovery

**Status:** Complete

### Goal

Produce explainable Technical Term Matches for changed TypeScript files and prepare the focused source material needed by the later AI assessment.

### Scope

1. Simplify the domain contracts:
   - remove `CandidateEvidenceRuleId`,
   - replace `CandidateEvidence` with `TechnicalTermMatch`,
   - define changed-region and matching-occurrence locations,
   - derive Candidate Pair selection from a non-empty match collection,
   - replace broad coverage types with simple analysis warnings,
   - remove obsolete screening and detailed-analysis contracts tied to the previous evidence/context model; M4 introduces the replacement Risk Assessment contract.

2. Add controlled TypeScript scenarios before or together with the analyzer:
   - changed function signature plus call in another changed file,
   - behaviour change associated with an enclosing function,
   - model/property change plus matching occurrence,
   - occurrence outside the other PR's patch,
   - missing or insufficient provider patch recovered through local diff reconstruction,
   - coincidental same-name match,
   - unrelated PRs,
   - unsupported input warning.

3. Generate each unordered same-target-branch PR pair exactly once.

4. Parse supported files once per pull request and extract:
   - technical terms associated with changed ranges,
   - structural occurrences in the resulting file,
   - source ranges useful for enclosing snippets.

5. Match both directions:

```text
PR A changed terms ∩ PR B occurrences
PR B changed terms ∩ PR A occurrences
```

6. Support added `.ts` files from their complete resulting content. For modified `.ts` files, prefer a usable provider patch and fall back to a bounded line diff between the selected file's immutable change-base and head versions.

7. Produce warnings for deleted, renamed, unreconstructable, unavailable, oversized, unsupported or malformed inputs, identifying the affected pull request and file where applicable.

8. Implement Context Retrieval by selecting relevant change hunks and snippets before applying size limits. Invoke AI later only when at least one match retains its minimum required context; otherwise preserve an assessment-not-run warning for the Candidate Pair.

### Deliberately Excluded

- lexical fallback,
- additional languages,
- deleted or renamed file structural analysis,
- semantic symbol resolution,
- repository-wide context retrieval,
- numeric evidence scores.

### Likely Components

- pair generator,
- patch hunk/range parser,
- bounded selected-file line-diff reconstructor,
- structural-analyzer interface,
- TypeScript Tree-sitter analyzer,
- per-PR structural facts,
- term-match evaluator,
- context retrieval builder,
- analysis-warning contract,
- controlled fixtures.

### Verification

- every unordered pair is generated once,
- supported files are parsed once and reused,
- both match directions are covered,
- enclosing names outside changed lines are found,
- occurrences outside the other patch are found,
- missing or insufficient provider patches use bounded local reconstruction,
- same-file and cross-file matches share one shape,
- unsupported cases produce warnings,
- no AI-ready input is produced when every match lacks critical context,
- no fixed rule ID or stored candidate boolean remains,
- normal tests require no live GitHub or Claude access.

### Commit Point

```text
feat: add TypeScript structural candidate discovery
```

---

## M4 — Single Claude Risk Assessment

**Status:** Complete

### Goal

Interpret each Candidate Pair with sufficient context through one structured Claude assessment.

### Scope

- define a small provider-neutral `RiskAnalysisProvider`,
- build one focused prompt from the retrieved context,
- do not invoke the provider for a Candidate Pair whose context failed the minimum-context check,
- define one Zod-validated output schema,
- return `RISK_IDENTIFIED` or `NO_RISK_IDENTIFIED`,
- include separate bounded relationship, independence and optional coverage-limitation reasoning with confidence for compatible or coincidental pairs,
- include a bounded likely outcome, each pull request's contribution, combined effect, relevant code, severity, confidence and concrete reviewer action for identified risks,
- preserve analysis warnings,
- use a fake provider in normal tests,
- provide one opt-in real-provider smoke test.

### Deliberately Excluded

- screening and escalation tiers,
- SQLite result caching,
- provider prompt caching,
- multiple providers,
- agentic repository retrieval,
- multiple findings per pair.

### Verification

- valid structured outputs are normalized,
- malformed outputs fail explicitly,
- evidence and inference remain distinguishable,
- warnings affect uncertainty rather than disappearing,
- critical missing input is surfaced as assessment not run rather than no risk,
- related-but-compatible scenarios can return no risk,
- normal tests make no paid provider calls.

### Commit Point

```text
feat: add Claude cross-PR risk assessment
```

---

# Completed Application and Release Milestones

## M5 — Minimal End-to-End Application

**Status:** Complete — M5A, M5B and M5C verified

### Goal

Expose the working pipeline through one backend operation and one useful Angular page.

### Backend Scope

- select a small HTTP framework at the start of the milestone,
- expose one synchronous repository/branch analysis operation,
- compose the GitHub provider, Candidate Discovery and Claude assessment,
- return counts, assessments and warnings,
- validate external request and response boundaries,
- map errors without exposing credentials.

### Frontend Scope

- repository and target-branch input,
- analysis action and loading state,
- eligible-PR and Candidate-Pair counts,
- risk/no-risk results,
- assessment-not-run state for discovered pairs without sufficient context,
- Technical Term Match evidence,
- confidence, severity and reviewer actions,
- visible analysis warnings,
- empty and error states.

### Deliberately Excluded

- background jobs and polling,
- persisted run history,
- authentication and user accounts,
- advanced filters,
- production deployment infrastructure.

### Verification

- API integration tests use fake external providers,
- Angular tests cover the primary states,
- a key-free manual browser walkthrough covers the complete UI state set at desktop and narrow widths,
- a live browser walkthrough through Angular, the production backend and GitHub returns the expected successful empty-scope report for a real repository with no open pull requests,
- the opt-in real Claude provider smoke test returns one schema-validated structured Risk Result,
- the complete repository is never sent to Claude,
- no persistent cache or tiered AI orchestration appears implicitly.

### Commit Points

```text
feat: expose synchronous analysis API
feat: add reviewer analysis dashboard
fix: complete live provider integration
```

---

## M6 — Reproducible Demo and MVP Hardening

**Status:** Complete — released as `v0.1.0`

### Goal

Demonstrate the product reliably with known cross-PR scenarios and clear setup documentation.

The demonstration must optimize for immediate reviewer comprehension as well as technical validity. A reader with no prior knowledge of the demo repository should be able to understand the designed integration risk from the PR titles, small diffs and displayed result without first studying the complete codebase.

### Completed Scope

- created a separate public, runnable TypeScript online-store demo repository,
- created eight manual scenario pull requests from the same base commit and kept them open and approved,
- established separate controlled ground truth for two build/type-check failures, one semantic financial failure and one no-risk pair,
- reproduced exactly four Candidate Pairs from 28 possible pairs and filtered the remaining 24 before Claude,
- exposed one unsupported HTML file as a visible warning,
- completed repeated bounded four-call live runs with three risk results, one no-risk result and no pair-level failures,
- recorded readable per-run and per-call latency, token, cost and failure diagnostics without retaining prompts or source content,
- compared observed Claude Sonnet 5 and Claude Opus 5 averages and selected Opus for the recorded demo,
- captured the application overview, build-failure, semantic-risk, no-risk and complete-result views for the final documentation,
- hardened the provider boundary and reviewer evidence only where the live walkthrough exposed concrete defects,
- preserved the self-hosted, bring-your-own-key and human-review boundaries,
- retained simulated operation and UI-only states in the key-free visual fixture.

### Completed Portfolio and Release Scope

- added a secret-free GitHub Actions workflow for clean install, build, type-check, normal tests and lint,
- presented the problem, architecture, safety boundaries, controlled evidence and limitations in the root README,
- recorded detailed expected-versus-actual evidence and bounded provider metrics in `docs/demo-evaluation.md`,
- updated the repository's source-of-truth documents without duplicating their responsibilities,
- completed local clean-install and fresh-clone verification,
- verified CI on GitHub-hosted infrastructure.

### Explicitly Deferred

- public cloud deployment, Docker packaging and Azure infrastructure remain a separate post-M6 decision,
- a public hosted service that accepts arbitrary repositories is out of scope,
- Claude-authored or GitHub-Actions-authored scenario PRs are unnecessary under the approved two-account workflow,
- automated LLM evaluation infrastructure, statistical dashboards and persistent evaluation storage are unnecessary for the first controlled demonstration,
- the live repository does not need to reproduce every visual-fixture-only interaction or operational state, such as simulated failure/retry or artificially long text, unless the approved realistic scenarios produce it naturally.

### Verification

- a designed non-textual cross-PR risk is identified,
- a coincidental structural match is dismissed,
- an unrelated pair is filtered before AI,
- unsupported input produces a visible warning,
- the live evaluation records expected versus actual behaviour and bounded provider usage without exposing credentials,
- CI verifies the repository on GitHub-hosted infrastructure without invoking paid external-provider tests,
- the primary README communicates the value, architecture, AI-safety choices and demonstrated outcomes without requiring readers to traverse the full design set,
- the complete UI workflow is reproducible.

### Commit Points

```text
docs: define M6 demonstration plan              # 668f52a
ci: add automated project verification
docs: complete reproducible MVP demonstration
```

---

# Planned Post-MVP Roadmap

The canonical roadmap and the measurements required to justify post-MVP work are maintained under [Planned Post-MVP Improvements](../docs/design/08-design-log.md#planned-post-mvp-improvements) in the Design Log. This implementation plan preserves completed milestone and verification history without duplicating those future proposals.

---

# Testing Strategy

Tests are added with the behaviour they protect.

Priority areas are:

- GitHub eligibility and normalization,
- controlled Candidate Discovery scenarios,
- Technical Term Match production,
- provider-patch and bounded local-diff changed-range extraction,
- context bounds and warnings,
- Claude output validation,
- one end-to-end application flow.

Use small synthetic fixtures and fakes at external boundaries. Normal tests must not require live GitHub or paid Claude access. No coverage percentage, large fixture framework or broad browser E2E suite is required for the MVP.

---

# Scope-Control Rules

Do not add during the MVP without an explicit design revision:

- Git textual conflict detection,
- build or test execution for analyzed repositories,
- numeric candidate scoring,
- full semantic symbol resolution,
- repository-wide indexes or RAG,
- tiered AI analysis,
- persistent result caching,
- prompt-caching orchestration,
- multiple source-control or AI providers,
- asynchronous job infrastructure.

These exclusions control the first implementation only. The post-MVP roadmap preserves the intended evolution paths.

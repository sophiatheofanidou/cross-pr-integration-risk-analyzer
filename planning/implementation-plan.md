# Cross-PR Integration Risk Analyzer — Implementation Plan

## Purpose

This plan implements the smallest credible end-to-end MVP before adding cost, scale or coverage optimizations.

The design documents in `docs/design/` define product responsibilities. This plan records implementation order, verification and coherent commit points.

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

Completed:

- [x] project vision and initial design,
- [x] repository foundation,
- [x] `M1` initial domain contracts and test harness,
- [x] `M2` GitHub integration and pull-request eligibility,
- [x] `M3` controlled scenarios, structural Candidate Discovery and Context Retrieval,
- [x] `M4` single Claude Risk Assessment.

Current checkpoint:

- the simplified MVP design and execution plan are approved by the project owner,
- `M3` is implemented and committed as `be419c6 feat: add TypeScript structural candidate discovery`,
- the bounded AI code-search investigation is recorded in the following documentation commit `586c280`,
- `M4` is implemented, independently reviewed and fully verified; its repository changes are awaiting the project owner's commit,
- the next implementation milestone is `M5 — Minimal End-to-End Application`.

M3 replaced the obsolete M1 evidence and context contracts with the current `TechnicalTermMatch`, `CandidatePair`, source-location and `AnalysisWarning` model.

---

## Confirmed MVP Technology

| Area | Decision |
|---|---|
| Frontend | Angular |
| Backend | Node.js + TypeScript |
| Test Runner | Vitest |
| Runtime Validation | Zod at GitHub and Claude boundaries |
| Source Control | GitHub REST API |
| Structural Parser | Tree-sitter |
| Analyzed Source | TypeScript `.ts` files |
| AI Provider | Claude |
| AI Strategy | One structured assessment per Candidate Pair with sufficient context |
| API Style | One synchronous analysis operation |
| Persistent Cache | Deferred |

The existing npm workspace, supported Node.js release line and root verification commands remain unchanged.

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
- include explanation and confidence,
- include changed assumption, severity and reviewer check for identified risks,
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

# Remaining MVP Milestones

## M5 — Minimal End-to-End Application

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
- confidence, severity and reviewer checks,
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
- a manual browser walkthrough completes the flow,
- the complete repository is never sent to Claude,
- no persistent cache or tiered AI orchestration appears implicitly.

### Commit Points

```text
feat: expose synchronous analysis API
feat: add reviewer analysis dashboard
```

---

## M6 — Reproducible Demo and MVP Hardening

### Goal

Demonstrate the product reliably with known cross-PR scenarios and clear setup documentation.

### Scope

- create or configure a controlled GitHub demo repository,
- connect the M3 scenarios to the end-to-end demonstration,
- document token and provider configuration,
- complete error messages and visible limitations,
- record the expected walkthrough and outputs,
- verify fresh-clone setup.

### Verification

- a designed non-textual cross-PR risk is identified,
- a coincidental structural match is dismissed,
- an unrelated pair is filtered before AI,
- unsupported input produces a visible warning,
- the complete UI workflow is reproducible.

### Commit Point

```text
docs: complete reproducible MVP demonstration
```

---

# Planned Post-MVP Roadmap

These improvements remain part of the product direction. They are implemented only after the first workflow provides measurements and real usage evidence.

## R1 — Tiered AI Analysis

Add cheap screening plus detailed escalation when Candidate Pair volume makes one full assessment per candidate too expensive. Measure cost savings and false dismissals before making screening a hard filter.

## R2 — SQLite Result Cache

Add durable cache entries keyed by PR revisions, retrieved context and analysis configuration. Keep the cache behind a replaceable interface. If R1 exists, cache screening and detailed results independently where useful.

## R3 — Provider Prompt Caching

Enable provider prompt caching for stable repeated prompt prefixes when supported and when token/cost measurements demonstrate value.

## R4 — Broader Candidate Coverage

Add deleted and renamed file analysis, additional languages, richer symbol resolution and a lexical fallback only if benchmarks justify it.

## R5 — Richer Context and Operations

Evaluate repository indexes, semantic retrieval, RAG, agentic investigation, asynchronous jobs, persistent run history, continuous monitoring and additional providers.

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

---

# Immediate Next Step

Commit the reviewed M4 change set, then begin M5 by agreeing the HTTP/application composition boundary and the smallest useful end-to-end API slice.

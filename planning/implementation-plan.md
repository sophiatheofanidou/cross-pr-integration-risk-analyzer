# Cross-PR Integration Risk Analyzer — Implementation Plan

## Purpose

This document is the execution guide for the portfolio MVP.

The approved design documents in `docs/design/` remain the source of truth for product and architecture decisions. This plan does not redesign the system. It records:

- the order in which the system will be implemented,
- why each implementation step is needed,
- which decisions must be made before a step begins,
- which files or components are expected to change,
- how each step will be verified,
- and when a commit represents a useful checkpoint.

This is a living implementation document. It should be updated when a milestone is completed or when an implementation choice materially changes the execution plan.

---

## How We Will Work

The project will be implemented one small milestone at a time.

Before each milestone:

1. Read only the design documents relevant to that milestone.
2. Explain the technical concepts and proposed choices in plain language.
3. Resolve decisions that materially affect the implementation.
4. Produce a file-level plan before changing application code.

During each milestone:

1. Implement only the approved scope.
2. Add tests together with the implementation.
3. Keep external services behind replaceable interfaces.
4. Avoid unrelated refactoring and optional features.

After each milestone:

1. Run the relevant tests, type-check and lint checks.
2. Review the complete diff.
3. Explain what changed and why.
4. Record known limitations.
5. Commit only when the milestone is coherent and verifiable.

Claude Code may assist with exploration, planning, implementation and review, but generated code is not accepted without diff review and verification.

---

## Current Checkpoint

Completed:

- [x] Project vision and problem definition
- [x] Conceptual architecture
- [x] Candidate Discovery design
- [x] Repository Context Retrieval design
- [x] Tiered AI Risk Analysis design
- [x] MVP scope and design log
- [x] Bounded on-demand source-content retrieval clarification

Current phase:

- [x] `P0 repository foundation` — Confirm the implementation defaults required before `M1` and establish the workspace
- [x] `M1` — Domain Contracts and Minimal Test Harness

Each remaining implementation decision must be understood and confirmed before the first milestone that depends on it. `M1` is complete. Runtime validation from `P0.4` is the next decision gate and must be confirmed before `M2` consumes external untrusted data.

---

## Confirmed Technology Decisions

| Area | Confirmed MVP decision | Reason |
|---|---|---|
| Frontend | Angular | Matches professional experience and the structured dashboard workflow |
| Backend runtime | Node.js | Suitable for API orchestration and asynchronous I/O |
| Backend language | TypeScript | Strong domain contracts and a shared language across frontend and backend |
| Source-control provider | GitHub REST API | Delivers a real MVP while the core remains provider-neutral |
| Structural analysis | Tree-sitter | Deterministic structural parsing without AI cost |
| Structural languages | TypeScript and C# | Bounded MVP coverage with a generic fallback |
| AI provider | Claude | Selected provider for screening and detailed analysis |
| Persistent result cache | SQLite | Durable local cache without separate database infrastructure |
| UI/API relationship | Separate Angular frontend and backend API | Keeps presentation separate from analysis responsibilities |

---

## P0 — Implementation Decisions to Confirm

These are implementation choices rather than conceptual architecture changes. They will be discussed one at a time, before the first implementation step that depends on each choice.

Decision timing:

- `P0.1` repository and package organization — confirmed before workspace scaffolding,
- `P0.2` supported Node.js version — confirmed before dependency installation and workspace scaffolding,
- `P0.3` test runner — decide before `M1`,
- `P0.4` runtime validation — decide before `M2`, the first milestone that consumes external untrusted data,
- `P0.5` SQLite driver — decide before `M7`,
- `P0.6` HTTP framework — decide before `M8`.

Deferring a decision until its stated gate does not block earlier milestones.

### P0.1 — Repository and Package Organization

**Status:** Confirmed

Decision:

- use one Git repository with npm workspaces,
- create only the deployable applications initially: `apps/api` and `apps/web`,
- keep one root `package-lock.json`,
- provide root commands for install, build, type-check, test and lint,
- do not create a shared contracts package before a real HTTP contract and frontend consumer exist.

Initial structure:

```text
Cross-PR Integration Risk Analyzer/
├── apps/
│   ├── api/
│   └── web/
├── docs/
│   └── design/
├── planning/
│   └── implementation-plan.md
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

Reason:

- npm workspaces provide one installation and a consistent set of root commands for both TypeScript applications,
- `apps` clearly identifies deployable applications,
- an empty `shared-contracts` package would add configuration before it has a real consumer,
- a new workspace package can be added later without restructuring the two applications.

Deferred decision:

- before implementing `M8` and `M9`, compare a shared `packages/contracts` workspace with frontend types generated from an OpenAPI specification,
- choose only after the actual HTTP schemas and frontend needs are known.

### P0.2 — Supported Node.js Version

**Status:** Confirmed

Decision:

- use the Node.js 24 LTS release line for development and CI,
- require Node.js `24.15.0` or later within that major line,
- declare root workspace compatibility as `>=24.15.0 <25.0.0`,
- use the same current Node.js 24 patch version in local development and CI when the workspace is initialized.

Reason:

- Angular 22 supports Node.js `^24.15.0`,
- Node.js 24 provides a materially longer support runway than Node.js 22 for a new project,
- the bounded compatibility review found no verified Node.js 24 blocker in the planned Angular, npm workspace, Claude SDK or Tree-sitter usage,
- choosing the current LTS line reduces the likelihood of a runtime-major upgrade during the MVP.

Local development setup:

- Node.js `24.19.0` is installed and verified as the active runtime from `C:\Program Files\nodejs`,
- the older Node.js `22.20.0` installation remains at `C:\NodeJS` after the active installation in `PATH`,
- no version manager is currently detected; `C:\Program Files\nodejs` is the authoritative local installation for this project,
- do not remove an existing Node.js installation without a separate cleanup decision.

Verification to defer until the relevant packages are introduced:

- run a small Windows installation smoke check for the exact Tree-sitter Node binding and TypeScript/C# grammar packages,
- treat a failed native build as a dependency compatibility finding to investigate, not as permission to silently change the supported Node.js line.

### P0.3 — Test Runner

**Status:** Confirmed

Decision:

- use Vitest for backend tests and the Angular testing setup,
- use `*.spec.ts` as the repository-wide test-file naming convention,
- run Angular tests through the Angular CLI and backend tests directly through Vitest,
- keep TypeScript type-checking as a separate command,
- begin backend testing without a `vitest.config.ts` file and introduce configuration only when a concrete need appears.

Reason:

- one testing vocabulary reduces unnecessary context switching across the two applications,
- Vitest is the default test runner used by the Angular CLI testing setup,
- Vitest's default Node.js environment and test-file discovery are sufficient for the minimal backend harness,
- deferring speculative configuration keeps `M1` proportionate to the MVP.

Initial implementation boundary:

- configure only what is required to run one small initial scenario,
- do not add a coverage target, broad mock system, large fixture library or extensive browser E2E suite,
- add further test configuration alongside relevant implementation needs rather than in advance.

### P0.4 — Runtime Validation

Decision to make:

- select one primary runtime-schema validation approach before the application consumes external untrusted data.

Candidates to compare:

- Zod or JSON Schema/TypeBox for runtime validation.

Current direction:

- prefer one understandable validation approach,
- do not introduce multiple schema systems without a concrete reason,
- consider whether the approach can support practical OpenAPI specification generation later, without selecting the contract-sharing strategy prematurely.

### P0.5 — SQLite Driver

Decision to make:

- select the Node.js driver through which the cache adapter uses SQLite.

Candidates to compare:

- `better-sqlite3`,
- the built-in `node:sqlite` API.

Current direction:

- prefer a mature, simple driver behind an `AnalysisResultCache` interface;
- do not introduce an ORM for the initial cache tables.

### P0.6 — Backend HTTP Framework

Decision to make:

- select the small HTTP framework used to expose the backend API.

Candidates to compare:

- Fastify,
- Express,
- NestJS.

Current direction:

- prefer a small framework proportionate to the MVP orchestration API,
- consider integration with the validation approach selected in `P0.4` and practical OpenAPI specification generation,
- do not select the later contract-sharing strategy prematurely.

### P0 Repository-Foundation Exit Criteria

The repository-foundation part of `P0` is complete when:

- [x] repository and package organization is understood and recorded,
- [x] the supported Node.js version is understood and recorded,
- [x] the test runner needed by `M1` is understood and recorded,
- [x] the project directory is initialized as a Git repository,
- [x] the approved design documents have a baseline commit,
- [x] the minimal workspace structure exists,
- [x] install, build, type-check, test and lint commands can run,
- [x] a concise project `CLAUDE.md` documents the locked boundaries and commands,
- [x] no feature implementation has been added.

Runtime validation, the SQLite driver and the HTTP framework remain tracked `P0` implementation decisions, but they are confirmed at their later milestone gates and do not block `M1`.

Suggested commit:

```text
chore: initialize project workspace
```

---

# Implementation Milestones

## M1 — Domain Contracts and Minimal Test Harness

### 1. What We Implement

Define the core TypeScript data contracts for normalized pull requests, changed files, Candidate Evidence, Candidate Pairs, Context Bundles, screening results, Detailed Analysis Results and Coverage Limitations.

Configure only the minimal test runner and add one small initial test scenario. Introduce a test-data builder or fixture only if that first scenario becomes clearer or less repetitive with it.

### 2. Why We Need It

Every later stage exchanges these objects. Defining them first prevents GitHub response shapes, Tree-sitter details or Claude responses from becoming the internal domain model.

The minimal test harness provides a repeatable verification method without designing a broad test system before application behaviour exists.

### 3. Design Decisions Implemented

- provider-neutral normalized inputs,
- separation of deterministic evidence from AI reasoning,
- explainable evidence and coverage limitations.

### 4. Likely Components

- backend domain types,
- shared API DTOs only where the frontend genuinely needs them,
- minimal test-runner configuration,
- one small initial test scenario,
- a test-data builder or fixture only when the initial scenario benefits from it.

### 5. Verification

- TypeScript compilation succeeds,
- schemas accept valid examples and reject invalid examples where runtime validation is required,
- one small scenario can be constructed without GitHub or Claude access.

### 6. Commit Point

```text
feat: add analysis domain contracts and minimal test harness
```

---

## M2 — GitHub Integration and Pull Request Eligibility

### 1. What We Implement

Implement the GitHub REST adapter for pull-request metadata, review history, changed-file metadata, available patches and selected file versions.

Normalize the effective review state and select open, non-draft, actively approved pull requests for the selected target branch.

### 2. Why We Need It

The analysis pipeline needs real pull-request inputs without depending directly on GitHub-specific response formats.

### 3. Design Decisions Implemented

- GitHub-only MVP with provider-neutral core,
- effective approval state,
- bounded on-demand file retrieval.

### 4. Likely Components

- `SourceControlProvider` interface,
- GitHub REST client/adapter,
- eligibility service,
- normalized mapping functions,
- stored GitHub response fixtures.

### 5. Verification

- pagination tests,
- approval/comment/changes-requested scenarios,
- draft and target-branch filtering,
- added, modified, deleted and renamed file cases,
- missing-patch and unavailable-content behaviour,
- no live GitHub dependency in normal unit tests.

### 6. Commit Point

```text
feat: retrieve and normalize eligible GitHub pull requests
```

---

## M3 — Basic Candidate Discovery

### 1. What We Implement

Generate every unique PR pair within the same target branch and implement:

- `SAME_CHANGED_FILE`,
- `SHARED_IDENTIFIER`,
- `CHANGED_IDENTIFIER_IN_OTHER_CHANGED_FILE`.

### 2. Why We Need It

This is the first deterministic reduction of the possible PR pair set and provides evidence without AI cost.

### 3. Design Decisions Implemented

- deterministic Candidate Discovery before AI,
- explainable selection,
- no numeric Interaction Score.

### 4. Likely Components

- pair generator,
- relevant-identifier extractor,
- basic evidence evaluators,
- evidence deduplication.

### 5. Verification

- exactly one result for each unique pair,
- focused unit tests for each evidence rule,
- noise filtering tests,
- stable evidence output,
- unsupported-file fallback tests.

### 6. Commit Point

```text
feat: add basic candidate discovery evidence
```

---

## M4 — Tree-sitter Structural Analysis

### 1. What We Implement

Create a replaceable structural-analyzer interface and Tree-sitter implementations for TypeScript and C#.

Implement:

- `SHARED_CHANGED_SYMBOL`,
- `MODIFIED_DEFINITION_REFERENCED_BY_OTHER_PR`.

### 2. Why We Need It

Structural parsing distinguishes definitions, calls, classes and enclosing structures from plain textual identifier occurrences.

### 3. Design Decisions Implemented

- lightweight structural analysis,
- Tree-sitter as a replaceable analyzer,
- structural rather than complete semantic resolution,
- exactly five total MVP evidence rules.

### 4. Likely Components

- language detection,
- normalized structural facts,
- TypeScript queries,
- C# queries,
- structural evidence evaluators,
- real `.ts` and `.cs` fixture files.

### 5. Verification

- definitions and calls are recognized in both supported languages,
- malformed source fails gracefully,
- same-name but different structural-role scenarios are covered,
- binary, oversized and unsupported files bypass Tree-sitter,
- no sixth evidence rule is introduced.

### 6. Commit Points

```text
feat: add TypeScript structural analysis
feat: complete C# structural candidate evidence
```

---

## M5 — Focused Repository Context Retrieval

### 1. What We Implement

Build Context Bundles from relevant diff hunks, evidence, enclosing structures, selected definitions/calls, bounded snippets, retrieval reasons and coverage limitations.

Reuse file contents already retrieved during Candidate Discovery. Construct a local diff for bounded text files when the provider patch is unavailable or insufficient and the operation requires it.

### 2. Why We Need It

Claude needs enough context to reason correctly, but sending complete files or repositories would add cost, noise and unexplained data.

### 3. Design Decisions Implemented

- focused deterministic context,
- explainable retrieval reasons,
- bounded on-demand content retrieval,
- explicit partial-analysis coverage.

### 4. Likely Components

- context-selection rules,
- snippet range calculation,
- enclosing-structure lookup,
- deduplication,
- per-analysis content reuse,
- local diff fallback,
- Context Bundle serializer.

### 5. Verification

- every extra snippet has a retrieval reason,
- duplicate snippets are removed,
- configured bounds are respected,
- unavailable content becomes a visible limitation,
- complete repositories are never added to the Context Bundle.

### 6. Commit Point

```text
feat: build focused repository context bundles
```

---

## M6 — Tiered Claude Risk Analysis

### 1. What We Implement

Define the AI-provider boundary, screening and detailed-analysis schemas, prompt templates, Claude adapter and output validation.

### 2. Why We Need It

Candidate Discovery identifies technical relationships but cannot decide whether they represent plausible changed assumptions or integration risks.

### 3. Design Decisions Implemented

- Claude as the MVP provider,
- cheap screening before detailed analysis,
- `DISMISS` or `ESCALATE`,
- uncertainty and material missing context cause escalation,
- evidence is separated from inference,
- structured confidence, severity and reviewer checks.

### 4. Likely Components

- `RiskAnalysisProvider` interface,
- Claude SDK adapter,
- screening and detailed prompt builders,
- runtime output schemas,
- fake provider for deterministic tests.

### 5. Verification

- valid outputs are parsed,
- malformed outputs fail safely,
- uncertainty escalates,
- missing critical context does not cause dismissal,
- normal tests make no paid Claude calls,
- a small opt-in provider smoke test can be run separately.

### 6. Commit Points

```text
feat: add tiered AI analysis contracts
feat: integrate Claude risk analysis
```

---

## M7 — SQLite Result Cache

### 1. What We Implement

Implement independent screening and detailed-result cache entries using a deterministic key derived from PR revisions, relevant analysis input and analysis configuration versions.

### 2. Why We Need It

Unchanged analyses should not repeat paid AI requests.

### 3. Design Decisions Implemented

- application-level result caching,
- result caching remains separate from provider prompt caching,
- cache storage is replaceable.

### 4. Likely Components

- `AnalysisResultCache` interface,
- SQLite adapter,
- schema migration or initialization,
- cache-key builder,
- in-memory fake for tests.

### 5. Verification

- cache hit avoids the AI provider,
- changed PR revision invalidates the key,
- changed prompt/schema/configuration version invalidates the key,
- screening and detailed results are stored independently,
- corrupted data fails safely.

### 6. Commit Point

```text
feat: cache AI analysis results in SQLite
```

---

## M8 — Backend Analysis API

### 1. What We Implement

Expose the complete workflow through HTTP endpoints for repository/branch selection, analysis execution, status and findings.

Before implementation begins, decide how the Angular application will consume the public HTTP contracts:

- a shared `packages/contracts` workspace, or
- frontend types generated from an OpenAPI specification.

Base the decision on the HTTP framework selected in `P0.6`, the validation approach selected in `P0.4` and the actual request/response schemas. Do not expose backend domain types directly merely to avoid defining explicit API contracts.

### 2. Why We Need It

The Angular frontend needs one stable API that orchestrates the already-tested components.

### 3. Design Decisions Implemented

- separate backend API and frontend,
- orchestration without merging component responsibilities,
- human-readable errors and coverage limitations.

### 4. Likely Components

- HTTP routes,
- request/response schemas,
- analysis application service,
- composition root for real adapters,
- error mapping and logging.

### 5. Verification

- API integration tests use fake external providers,
- invalid requests are rejected,
- the complete deterministic-to-AI workflow is exercised,
- errors do not expose credentials or raw sensitive data.

### 6. Commit Point

```text
feat: expose cross-PR analysis API
```

---

## M9 — Angular Reviewer Dashboard

### 1. What We Implement

Create the repository and branch input workflow, analysis action, summary counts, findings list, evidence details, confidence, severity, reviewer checks and coverage warnings.

### 2. Why We Need It

The portfolio result must make the cross-PR analysis understandable and useful to a human reviewer.

### 3. Design Decisions Implemented

- human-in-the-loop workflow,
- explainable findings,
- no automatic approval, rejection or merging.

### 4. Likely Components

- Angular pages and components,
- typed API client,
- analysis state service,
- loading, empty and error states,
- findings and evidence presentation.

### 5. Verification

- component tests,
- API-client tests,
- manual browser walkthrough,
- visible partial-analysis warnings,
- no numeric Candidate Pair ranking is introduced.

### 6. Commit Points

```text
feat: add analysis dashboard workflow
feat: display explainable risk findings
```

---

## M10 — Controlled Demo and MVP Hardening

### 1. What We Implement

Create a small controlled demonstration with known related and unrelated PR scenarios. Complete setup documentation, error handling and the final end-to-end walkthrough.

### 2. Why We Need It

A portfolio project needs a repeatable demonstration of the engineering workflow, not only source code.

### 3. Design Decisions Implemented

- complete and credible MVP over exhaustive detection,
- designed risk scenarios,
- explicit limitations and human review.

### 4. Likely Components

- controlled repository or scenario set,
- opt-in end-to-end configuration,
- README setup and architecture walkthrough,
- demo screenshots or recording notes.

### 5. Verification

- fresh-clone setup succeeds,
- the success criteria in `07-mvp-specification.md` are demonstrated,
- unrelated pairs can be dismissed,
- designed cross-PR risks produce explainable findings,
- unchanged analyses reuse cached results.

### 6. Commit Point

```text
docs: complete reproducible MVP demonstration
```

---

## Testing Strategy Across the Milestones

Tests are added alongside the implementation of the relevant behaviour. They are not designed in bulk before the application code exists.

Automated tests prioritize critical deterministic behaviour and meaningful regression risk. In particular, they protect:

- GitHub approval and eligibility rules,
- all five approved Candidate Discovery evidence rules,
- focused-context selection, configured bounds and coverage limitations,
- screening and detailed-analysis response validation and escalation behaviour,
- cache hits and invalidation behaviour.

Testing uses the smallest useful form of controlled data:

- inline objects for small pure unit tests,
- a builder only when repeated setup makes a relevant scenario harder to read,
- small `.diff`, `.ts` and `.cs` fixtures only when real formatting matters,
- small stored provider responses only when the GitHub response shape matters,
- focused fakes at external boundaries for a small number of integration or application-flow tests.

Selected Angular component and API-client tests remain part of the MVP. A small number of opt-in checks may exercise the real GitHub and Claude providers outside the normal test suite. Manual testing is retained for the real GitHub, Claude and Angular workflow, including a manual browser walkthrough.

The MVP does not require a coverage percentage or a test for every function. It does not introduce an extensive browser E2E suite, a broad mock system or a large fixture library.

Fixtures are test inputs, not a second implementation of the application. When needed, they remain small, readable, synthetic and free of private company code or secrets.

---

## Scope-Control Rules

The following are not added during the MVP unless the approved design is explicitly revised:

- Git textual merge-conflict detection,
- build or test execution for analyzed pull requests,
- numeric Interaction Score,
- full semantic symbol resolution,
- repository-wide symbol indexing,
- RAG or vector databases,
- autonomous repository exploration,
- multiple source-control or AI-provider implementations,
- distributed queues or production-scale deployment infrastructure.

Implementation details should remain implementation details unless they materially change component responsibilities, system boundaries or the MVP contract.

---

## Immediate Next Step

Confirm `P0.4 — Runtime Validation` before beginning `M2 — GitHub Integration and Pull Request Eligibility`.

The decision should select one proportionate runtime-schema validation approach for external GitHub data while considering later AI-response validation and practical OpenAPI generation. The SQLite driver and HTTP framework remain deferred until their stated milestone gates.

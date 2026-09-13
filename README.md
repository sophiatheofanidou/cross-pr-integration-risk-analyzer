# Cross-PR Integration Risk Analyzer

**Engineering focus:** Generative AI · Hybrid deterministic and AI analysis ·
LLM integration · Prompt engineering · Controlled LLM evaluation and safeguards ·
TypeScript · Angular

[![CI](https://github.com/sophiatheofanidou/cross-pr-integration-risk-analyzer/actions/workflows/ci.yml/badge.svg)](https://github.com/sophiatheofanidou/cross-pr-integration-risk-analyzer/actions/workflows/ci.yml)

<p align="center">
  <a href="#example-result-a-payment-unit-mismatch">Example result</a> ·
  <a href="#explore-the-ui-without-credentials">Explore the UI</a> ·
  <a href="docs/demo-evaluation.md">Evaluation</a> ·
  <a href="docs/design/02-architecture.md">Architecture</a>
</p>

## Overview

### The problem

Modern software teams often develop, review, and approve multiple pull requests in parallel. As teams and codebases grow, independently developed changes can affect related contracts, behaviour, data, or system assumptions without their authors and reviewers being aware of one another. Git may merge the files cleanly and both PRs may pass their individual checks, while their combination introduces a build failure or incorrect runtime behaviour.

### Why it matters

Discovering these interactions after merge adds debugging, repeated validation, and release delays.

### The solution

The Cross-PR Integration Risk Analyzer provides a cost-aware, AI-assisted workflow for finding which approved pull-request combinations deserve joint investigation before merge. It systematically examines the approved change set, uses deterministic structural analysis to reduce the search space, applies focused AI reasoning only to technically related combinations, and presents the result as explainable evidence and targeted reviewer actions.

### Who it is for

The primary users are code reviewers, senior engineers, and tech leads working with several concurrently approved changes against the same branch. The tool supports their judgment; it does not make merge decisions for them.

For deeper product background, see the [Project Vision](docs/design/00-project-vision.md) and [Problem Analysis](docs/design/01-problem-analysis.md).

## Example result: a payment unit mismatch

In the controlled demo, one PR changes an order total from cents to euros while another passes that value to payment authorization under the earlier cents assumption. The combined code remains type-correct, but an intended **€25 payment could be authorized as €0.25**. The analyzer connects both changes and identifies the contract a reviewer should verify.

<p align="center">
  <img src="docs/assets/semantic-risk-result.png" alt="Semantic integration risk showing a cents-versus-euros contract mismatch, combined effect, reviewer action, and supporting source locations">
</p>

<p align="center"><em>A controlled result showing each PR's contribution, their combined effect, and a targeted reviewer action.</em></p>

## Why this workflow is needed

The project originated from a real engineering scenario where independently approved pull requests caused unexpected integration issues after merge.

Existing tools address adjacent parts of the problem:

- Git identifies textual conflicts but does not explain behaviourally incompatible changes that merge cleanly.
- CI validates the code states it is configured to build and test, but does not tell a reviewer which independent pending PRs should be examined together before merge.
- AI coding assistants can compare two PRs selected by a person, but the person must already know which pair is worth investigating.

This project focuses on the discovery gap between independently reviewed changes. Its value is not merely asking an AI model to compare two changes that a person has already selected. It systematically identifies which pairs deserve joint investigation, applies semantic reasoning only where deterministic evidence justifies it, and reports what the reviewer should inspect.

The [Current Solution Landscape](docs/design/03-current-solution-landscape.md) provides an optional research and positioning deep dive across adjacent tools.

## How the analyzer works

1. **Collect the review scope.** Retrieve the approved pull requests targeting the selected branch.
2. **Find the pairs worth investigating.** Compare the changes and retain combinations connected by a concrete structural code relationship.
3. **Analyze only relevant context.** For each shortlisted pair, prepare the related changes and source locations and use focused AI reasoning to assess their combined effect.
4. **Explain the result.** Show what each PR contributes, the likely outcome if both are merged, the supporting code locations, and what the reviewer should verify.

The initial filtering is deterministic and repeatable: it decides which pairs deserve deeper investigation, not whether a risk already exists. Unrelated pairs cause no AI call, and the complete repository is never sent to the AI provider.

<p align="center">
  <img src="docs/assets/application-overview.png" alt="Application overview showing the controlled analysis totals and visible coverage warning">
</p>

<p align="center"><em>The reviewer workspace keeps the full analysis scope visible: 8 eligible pull requests produce 28 possible pairs, deterministic Candidate Discovery retains 4 for assessment, and unsupported input remains explicit.</em></p>

For a technical review, start with [Architecture](docs/design/02-architecture.md), then follow the implemented pipeline through [Candidate Discovery](docs/design/04-candidate-discovery.md), [Context Retrieval](docs/design/05-context-retrieval.md), and [AI Risk Analysis](docs/design/06-ai-risk-analysis.md).

## Controlled Demo Evaluation

The minimum viable product (MVP) was evaluated against known ground truth in a public [controlled demo repository](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store): 8 independently valid, approved PRs created from the same base commit. From 28 possible pairs, deterministic Candidate Discovery retained the 4 designed technical relationships and filtered 24 before AI. The AI Risk Assessment identified all 3 known risks and correctly dismissed the no-risk control.

| Controlled scenario | Ground truth | Analyzer outcome |
|---|---|---|
| Function signature changes while another PR adds a caller using the previous contract | Build/type-check failure | High-risk contract mismatch identified |
| A synchronous function becomes asynchronous while another PR consumes its result synchronously | Build/type-check failure | High-risk return-contract mismatch identified |
| A numeric result changes unit while another PR still assumes the previous unit | Type-correct but materially incorrect runtime behaviour | High-risk semantic mismatch identified |
| Separate modules contain unrelated local helpers with the same name | No integration problem | Coincidental match correctly dismissed |

An unsupported file type also produced an explicit coverage warning instead of being silently treated as negative evidence.

The complete expected-versus-actual evidence, result captures, and limitations are documented in the [Controlled Demo Evaluation](docs/demo-evaluation.md). These designed scenarios demonstrate the workflow; they do not estimate production-scale accuracy.

## Operational Performance

Four recorded runs compared Opus and Sonnet on the same controlled workload. Both produced the expected 3-risk/1-no-risk classification without operational failures. Opus averaged **13.16 seconds**, compared with **21.28 seconds** for Sonnet, and returned more concise responses; Sonnet's estimated cost was approximately half.

<p align="center">
  <img src="docs/assets/analysis-performance-report.png" alt="Analysis Performance Report comparing 4 recorded runs by stage latency, AI usage, failures, and estimated cost">
</p>

<p align="center"><em>The local report separates pipeline timing, AI usage, failures, and estimated cost.</em></p>

These are observations from a small controlled workload, not general performance guarantees. The [evaluation](docs/demo-evaluation.md#operational-performance) records the method, cost assumptions, and model-selection rationale.

## AI assessment safeguards

- **Prompt integrity.** Repository-provided content is treated as untrusted evidence and kept separate from trusted system instructions.
- **Grounded evidence.** The model selects from a closed set of evidence IDs; the application validates their PR ownership and resolves them to the original code locations.
- **Visible uncertainty and failures.** Critical missing context prevents assessment, and failed assessments remain visible per pair while other completed results remain available.

Assessments remain advisory and require human review. These controls reduce risk without guaranteeing correctness; the prompt requires conditional language for semantic inferences. See [AI Risk Analysis](docs/design/06-ai-risk-analysis.md#prompt-integrity-and-evidence-grounding) for the detailed controls.

## Current MVP implementation

The architecture separates source-control integration, structural analysis, Context Retrieval, and AI Risk Assessment behind focused boundaries so that future implementations can extend platforms, languages, and model providers without redefining the reviewer workflow.

The current portfolio MVP is an npm-workspace monorepo with a Node.js and TypeScript backend and an Angular frontend:

```text
apps/
├── api/    Node.js and TypeScript analysis backend
└── web/    Angular reviewer interface
```

The backend exposes one synchronous `POST /api/analysis` operation. The Angular application calls it through a local development proxy and renders the analysis inventory, warnings, Candidate Pairs and reviewer-facing Risk Results.

The complete implemented `v0.1.0` release boundary is defined in the [MVP Specification](docs/design/07-mvp-specification.md). Major architectural decisions, superseded alternatives, planned improvements, and open questions are recorded in the [Design Log](docs/design/08-design-log.md).

Key technologies:

- **Application:** [Angular](https://angular.dev/) frontend; [Node.js](https://nodejs.org/) and [TypeScript](https://www.typescriptlang.org/) backend.
- **Analysis:** [GitHub REST API](https://docs.github.com/en/rest); [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) for structural analysis of supported TypeScript files.
- **AI and validation:** [Claude API](https://platform.claude.com/docs/en/api/messages) through the official [TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript); [Zod](https://zod.dev/) at external data boundaries.
- **Quality:** [Vitest](https://vitest.dev/), [ESLint](https://eslint.org/), and [GitHub Actions](https://docs.github.com/en/actions).

## Run locally

The MVP is self-hosted and uses a bring-your-own-key model: the person running it supplies the source-control and AI-provider credentials used by the backend.

Requirements:

- Node.js `>=24.15.0 <25.0.0`
- npm `11.17.0`

Install and verify both workspaces:

```text
npm ci
npm run build
npm run type-check
npm test
npm run lint
```

### Explore the UI without credentials

After installing dependencies with `npm ci`, run the development-only UI preview from the repository root:

```text
npm run demo
```

Open `http://127.0.0.1:4200/` when Angular is ready. This mode uses explicit simulated fixture data for repeatable UI inspection, does not call source-control or AI providers, and is not evidence of live analysis accuracy. The controlled evaluation above records the real end-to-end workflow.

### Run the live application

The backend requires these environment variables:

- `GITHUB_TOKEN` — a GitHub token that can read the analyzed repository;
- `ANTHROPIC_API_KEY` — an Anthropic API key;
- `ANTHROPIC_MODEL` — the Claude model ID used for assessment.

Keep credentials out of source files, frontend configuration, and Git.

Build and start the backend from the repository root:

```text
npm run build --workspace @cross-pr-risk-analyzer/api
npm run start --workspace @cross-pr-risk-analyzer/api
```

In a second terminal, start the Angular development server:

```text
npm run start --workspace web
```

Open `http://127.0.0.1:4200/`. The Angular development proxy sends relative `/api` requests to the backend at `http://127.0.0.1:3000`.

The optional real-provider smoke test may incur Anthropic charges and is excluded from normal tests:

```text
npm run test:claude-smoke --workspace @cross-pr-risk-analyzer/api
```

## Tests and CI

Automated unit, integration, and Angular component tests cover pair generation, Candidate Discovery, bounded Context Retrieval, source-control and AI-provider boundaries, AI-output normalization, failure isolation, the HTTP API, and primary reviewer-interface states. The [GitHub Actions CI workflow](.github/workflows/ci.yml) runs clean install, production builds, type-checking, normal tests, and lint without secrets or paid AI calls.

## Safety boundaries

The analyzer supports human review without taking repository decisions or actions. It does not:

- approve, reject, merge, or establish textual mergeability;
- check out, build, or test combined PR states;
- send the complete repository to the AI provider;
- treat a structural match as a confirmed risk or missing context as a no-risk result.

HTTP requests and structured responses from source-control and AI providers are validated when they enter the application. Provider credentials are loaded by the backend from environment variables, are never sent to the browser, and remain outside Git.

## Current MVP limitations

Version 0.1.0 has the following explicit scope limits:

- Structural Candidate Discovery currently supports changed TypeScript `.ts` files only.
- Deleted and renamed files are not structurally analyzed.
- Tree-sitter provides syntax-aware name correlation rather than complete semantic symbol resolution, so coincidental same-name relationships can become Candidate Pairs for semantic assessment.
- Analysis is synchronous and has no authentication, hosted service, persistent cache, or run history.

## Future direction

Planned directions include:

- additional languages, richer symbol resolution, source-control platforms, and AI providers;
- tiered AI assessment and caching to reduce repeated or unnecessary paid analysis;
- richer repository context when changed-file evidence is insufficient;
- asynchronous analysis, persistent history, continuous monitoring, and broader reviewer workflows.

The long-term architectural direction is provider-neutral and multi-language, while the current implemented release remains explicit and honest about its GitHub, TypeScript, and Claude scope.

## License

This project is licensed under the [MIT License](LICENSE).

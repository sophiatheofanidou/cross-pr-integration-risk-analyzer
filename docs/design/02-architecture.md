# Architecture

## Purpose

This document describes the high-level architecture of the Cross-PR Integration Risk Analyzer.

The system is organized as a sequence of independent responsibilities that transform a set of approved pull requests into an explainable integration-risk report for human reviewers.

The architecture defines the main components, their responsibilities and their boundaries. Detailed implementation strategies are described separately in the corresponding component design documents.

---

## Architectural Principles

The architecture is guided by the following principles:

- Separate factual evidence extraction from AI reasoning.
- Reduce unnecessary AI analysis before invoking more expensive reasoning.
- Use focused repository context rather than providing the complete repository to the AI.
- Preserve explainability throughout the workflow.
- Keep source-control, structural-analysis, context-retrieval and AI-provider concerns replaceable where practical.
- Keep the final engineering decision with the human reviewer.
- Avoid duplicating capabilities already provided by Git, such as textual merge-conflict detection.
- Allow individual stages to evolve without requiring the complete workflow to be redesigned.

---

## Conceptual Architecture

```mermaid
flowchart TD
    A[Source Control Integration]
    B[Pull Request Eligibility Selection]
    C[Candidate Discovery]
    D[Repository Context Retrieval]
    E[AI Risk Analysis]
    F[Risk Report Generation]
    G[Human Reviewer]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
```

---

## Core Components

### Source Control Integration

Provides access to the repository and pull request information required by the analysis workflow.

Its responsibilities include retrieving and normalizing:

- pull request metadata,
- review and approval state,
- source and target branches,
- changed files,
- diffs,
- and selected repository contents.

The component also supports bounded, on-demand retrieval of selected repository file versions when Candidate Discovery or Repository Context Retrieval requires more source context than the available diff provides.

For pull-request change reconstruction, the selected before/after versions represent the comparison base for the changes introduced by the pull request and the pull request head. Current-target versus simulated-merge analysis is a separate concern and is not implied by this retrieval boundary.

Repository content is identified by an immutable repository revision and normalized before it is provided to the rest of the workflow. Content already retrieved during an analysis run should be reused where practical.

The rest of the analysis workflow should not depend directly on provider-specific API responses.

Provider-specific review histories, revision identifiers and content-retrieval mechanisms remain inside the source-control adapter.

---

### Pull Request Eligibility Selection

Determines which pull requests participate in the analysis.

The system focuses on pull requests that are relevant merge candidates for the same target branch.

Eligibility rules are deterministic and remain separate from later technical or AI-assisted analysis.

The Source Control Integration normalizes provider-specific review histories into a current effective review state before eligibility rules are applied.

For the GitHub MVP:

- review comments do not override an approval decision,
- an active changes-requested decision makes a pull request ineligible,
- and at least one active approval is required.

---

### Candidate Discovery

Examines eligible pull requests and identifies combinations that show enough objective technical relationship to justify deeper analysis.

Candidate Discovery may use:

- file- and diff-based evidence,
- lexical relationships,
- structural code analysis where supported.

The stage does not determine whether an actual integration risk exists.

Its responsibility is only to reduce the possible pair set and provide explainable evidence for why each selected pair deserves further investigation.

Detailed evidence rules and structural-analysis strategies are defined in the Candidate Discovery design.

---

### Repository Context Retrieval

Retrieves focused repository information relevant to a selected Candidate Pair.

Its purpose is to provide enough context for meaningful AI reasoning without sending unnecessary repository content to the model.

The retrieval strategy is guided by the evidence produced during Candidate Discovery and may use structural information where available.

Detailed retrieval rules and context construction are defined in the Repository Context Retrieval design.

---

### AI Risk Analysis

Evaluates a Candidate Pair using:

- pull request changes,
- deterministic evidence,
- and focused repository context.

Its responsibility is to determine whether the technical relationship identified by Candidate Discovery may represent a meaningful cross-PR integration risk.

The AI should distinguish between:

- objective evidence,
- inferred assumptions,
- uncertainty,
- and missing information.

The analysis layer may use multiple reasoning tiers and caching or reuse mechanisms to control cost while preserving useful analysis quality.

Detailed model orchestration, screening behaviour and caching strategies are defined in the AI Risk Analysis design.

---

### Risk Report Generation

Transforms analysis results into a reviewer-facing report.

A report may include:

- the pull requests involved,
- evidence connecting them,
- the possible integration-risk scenario,
- severity,
- confidence,
- affected code areas,
- and recommended human checks.

The report supports reviewer prioritization.

It does not automatically approve, reject or merge pull requests.

---

## High-Level Workflow

1. Pull request and repository information is retrieved from the source-control platform.
2. Eligible approved pull requests are selected and grouped by target branch.
3. Candidate Discovery examines possible pull request combinations.
4. Pairs with meaningful technical evidence become Candidate Pairs.
5. Relevant repository context is gathered for each Candidate Pair.
6. AI Risk Analysis evaluates whether the identified relationship represents a plausible integration risk.
7. Findings are transformed into explainable reviewer-facing reports.
8. A human reviewer decides whether additional investigation or validation is required.

---

## Separation of Responsibilities

### Deterministic Processing

Responsible for:

- pull request eligibility,
- pair generation,
- objective evidence extraction,
- structural analysis where available,
- candidate selection,
- focused context preparation.

### AI Reasoning

Responsible for:

- interpreting the relationship between changes,
- identifying plausible integration-risk scenarios,
- reasoning about changed assumptions,
- estimating confidence and severity,
- recommending targeted reviewer checks.

This separation keeps factual analysis reproducible while reserving AI for semantic reasoning.

---

## Extension Points

The architecture intentionally allows several capabilities to evolve independently.

### Source Control Provider

Additional source-control platforms can be integrated without changing the analysis workflow.

### Structural Analyzer

Candidate Discovery may use different or additional language-aware structural-analysis implementations.

### Repository Context Provider

Context retrieval may evolve from lightweight deterministic retrieval to richer indexing, semantic retrieval or an external repository-context provider.

### AI Provider and Analysis Strategy

AI models, providers and orchestration strategies may evolve independently from Candidate Discovery and context retrieval.

### Caching Strategy

Different caching and reuse strategies may be introduced without changing the conceptual analysis workflow.

---

## Architectural Boundary

The system focuses on **cross-PR integration risks that are distinct from Git-detectable textual merge conflicts and may remain even when changes can coexist textually**.

Git-detectable textual merge conflicts are outside the responsibility of the analyzer. The analyzer does not itself establish or validate textual mergeability.

The system also does not attempt to provide complete static-program analysis or guarantee that a reported integration problem exists.

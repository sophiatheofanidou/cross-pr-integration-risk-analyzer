# Current Solution Landscape

## Purpose

This document examines the current ecosystem of tools that support pull request review, merge validation and software integration.

Its purpose is to understand:

- which problems existing solutions solve,
- where each solution provides value,
- and where the proposed project fits within the development workflow.

The goal is not to replace these tools, but to identify a workflow that is currently underrepresented.

The comparison focuses on documented primary workflows. It does not assume that a flexible product is incapable of an action merely because its public documentation does not mention it.

The landscape was reviewed in August 2026 and should be revisited as products evolve.

---

## Executive View

The proposed project does not replace merge queues, CI or AI pull request reviewers.

It occupies an earlier and narrower point in the workflow:

> From the eligible pull requests targeting the same branch, systematically discover which pairs have a meaningful structural relationship and produce a focused, reviewer-facing assessment of their plausible integration risk before merge-queue or CI validation.

Existing solutions cover important parts of this workflow:

- **merge queues and merge trains** validate combined future branch states through configured checks;
- **pending-PR discovery systems** identify related concurrent changes using file, line or historical overlap;
- **build-impact tools** determine whether queued changes can be tested independently;
- **AI reviewers** analyze individual pull requests with repository-wide or connected context;
- **semantic-conflict research** investigates known change pairs, often through speculative merge, build or test execution;
- **general coding agents** can explain the interaction between two pull requests once a human has selected the pair.

The remaining opportunity is the combination of:

1. systematic pair discovery across eligible pull requests;
2. structural evidence that can connect changes in different files;
3. focused AI reasoning about the selected pair;
4. an explanation intended for a reviewer;
5. analysis before merge, build or test execution.

The output is a prioritized investigation, not proof that a defect exists.

---

## Landscape Map

| Category | Representative solutions | Primary question |
|---|---|---|
| Merge coordination and combined-state validation | [GitHub Merge Queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), [GitLab Merge Trains](https://docs.gitlab.com/ci/pipelines/merge_trains/), [Mergify](https://docs.mergify.com/merge-queue/) | Can the queued changes pass the required checks in their expected merge state? |
| Pending-PR pair discovery | [ConE](https://arxiv.org/abs/2101.06542), [PR Conflict Detector](https://github.com/github-community-projects/pr-conflict-detector) | Which concurrent pull requests overlap enough to warrant attention? |
| Build-impact queue optimization | [Aviator affected targets](https://docs.aviator.co/mergequeue/concepts/affected-targets), [Trunk parallel queues](https://docs.trunk.io/merge-queue/optimizations/parallel-queues) | Which queued pull requests can be tested independently? |
| Repository-aware AI review | [GitHub Copilot Code Review](https://docs.github.com/en/copilot/concepts/agents/code-review), [CodeRabbit](https://docs.coderabbit.ai/guides/code-review-overview), [Qodo](https://docs.qodo.ai/code-review), [Greptile](https://www.greptile.com/docs/introduction) | What should be understood or corrected in this pull request? |
| Dependent-change coordination | [GitHub stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-stacked-pull-requests), [Graphite stacks](https://graphite.dev/docs), [Gerrit topics](https://gerrit-review.googlesource.com/Documentation/cross-repository-changes.html) | Which explicitly related changes must move or merge together? |
| Semantic-conflict research | [ConflictLens](https://ksiresearch.org/seke/seke25paper/paper012.pdf), [Crystal](https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-tse2013-abstract.html), [WeCode](https://doi.org/10.1109/ICSE.2012.6227180) | Do two known changes interfere after textual merging? |
| Ad-hoc agentic analysis | General coding agents with repository and PR access | How might these two already-selected pull requests interact? |
| **Proposed project** | **Cross-PR Integration Risk Analyzer** | **Which eligible pairs deserve joint review, and why?** |

---

## Broad Capability Comparison

Legend:

- <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> **Yes** — part of the documented workflow.
- <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> **Partial** — present, but narrower or used for a different objective.
- <img src="../assets/status-no.svg" width="18" height="18" alt="No"> **No** — the documented mechanism does not provide it.
- <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> **Unknown** — public documentation does not establish the answer.

Capabilities in the **Proposed project — planned MVP** row describe the approved design, not functionality already implemented.

| Solution | Discovers PR pairs | Deterministic selection | Pair analysis | AI reasoning | Merge/build/test execution | Reviewer explanation |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| [ConE](https://arxiv.org/abs/2101.06542) | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> |
| [PR Conflict Detector](https://github.com/github-community-projects/pr-conflict-detector) | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> |
| &nbsp; |  |  |  |  |  |  |
| [GitHub Merge Queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| [GitLab Merge Trains](https://docs.gitlab.com/ci/pipelines/merge_trains/) | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| [Mergify Merge Queue](https://docs.mergify.com/merge-queue/) | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| [Aviator MergeQueue](https://docs.aviator.co/mergequeue/concepts/affected-targets) | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| [Trunk Merge Queue](https://docs.trunk.io/merge-queue/optimizations/parallel-queues) | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| &nbsp; |  |  |  |  |  |  |
| [GitHub Copilot Code Review](https://docs.github.com/en/copilot/concepts/agents/code-review) | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> |
| [CodeRabbit](https://docs.coderabbit.ai/guides/code-review-overview) | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> |
| [CodeRabbit Multi-Repo Analysis](https://docs.coderabbit.ai/knowledge-base/multi-repo-analysis) | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> |
| [Qodo Code Review](https://docs.qodo.ai/code-review) | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> |
| [Greptile](https://www.greptile.com/docs/introduction) | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-unknown.svg" width="18" height="18" alt="Unknown"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> |
| Ad-hoc coding agent | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> |
| &nbsp; |  |  |  |  |  |  |
| [GitHub stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-stacked-pull-requests) | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| [Graphite stacks](https://graphite.dev/docs) | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| [Gerrit topics](https://gerrit-review.googlesource.com/Documentation/cross-repository-changes.html) | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> |
| &nbsp; |  |  |  |  |  |  |
| [ConflictLens](https://ksiresearch.org/seke/seke25paper/paper012.pdf) | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> |
| [Crystal](https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-tse2013-abstract.html) and [WeCode](https://doi.org/10.1109/ICSE.2012.6227180) research | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-partial.svg" width="18" height="18" alt="Partial"> |
| &nbsp; |  |  |  |  |  |  |
| **Proposed project — planned MVP** | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> | <img src="../assets/status-no.svg" width="18" height="18" alt="No"> | <img src="../assets/status-yes.svg" width="18" height="18" alt="Yes"> |

Rows remain ordered by the categories in the Landscape Map. Blank rows separate the groups without adding another category column. `Partial` for merge queues means that they can expose the effect of a combination through grouping or failed checks; it does not mean that they perform semantic pair discovery. `Unknown` records missing public evidence rather than assuming absence.

**Merge/build/test execution** means constructing or using a combined code state and running merge simulation, builds, tests or other executable checks against it. The planned MVP does not check out, merge or execute analyzed pull requests.

---

## Detailed Category Notes

<details>
<summary><strong>Merge queues and merge trains</strong></summary>

### What they do well

[GitHub Merge Queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), [GitLab Merge Trains](https://docs.gitlab.com/ci/pipelines/merge_trains/) and [Mergify Merge Queue](https://docs.mergify.com/merge-queue/) protect busy branches from changes that passed independently but fail in an expected combined state. They coordinate order, construct speculative states and run configured checks before merging.

GitLab describes the underlying problem directly: two merge requests may each pass their own pipeline while their combined changes still conflict. This is strong validation of the problem, but also a reminder that the project must not claim merge queues are blind to cross-PR issues.

### Boundary relative to this project

A merge queue answers:

> Does this combined state pass the checks required for merging?

The proposed project answers:

> Which pairs deserve attention before that stage, what changed relationship connects them, and what should a reviewer inspect?

The meaningful differences are:

- **timing** — before queue execution rather than during it;
- **selection** — technically related pairs rather than queue-neighbour combinations;
- **coverage** — plausible assumptions beyond what configured checks happen to assert;
- **output** — an explanation rather than only a status result.

The project should be positioned as a pre-queue complement, not a replacement.

</details>

<details>
<summary><strong>Pending-PR pair discovery: ConE and PR Conflict Detector</strong></summary>

### [ConE](https://arxiv.org/abs/2101.06542)

ConE is the closest conceptual precedent for Candidate Discovery. It examined concurrently open pull requests, measured overlap, used historical co-edit rarity to suppress weak recommendations and notified developers about potentially conflicting pairs.

Its published evaluation covered 234 repositories and approximately 26,000 pull requests. More than 70% of 775 recommendations were rated useful, and more than 90% of 48 interviewed developers intended to use the service daily.

ConE is important for two reasons:

1. it demonstrates that systematic discovery across concurrent pull requests has practical value;
2. its contribution depended heavily on suppressing false alarms, not merely finding more overlaps.

It did not perform AI semantic reasoning about the changed assumptions behind a pair.

### [PR Conflict Detector](https://github.com/github-community-projects/pr-conflict-detector)

The GitHub community PR Conflict Detector groups open pull requests by modified file, compares relevant line ranges and can optionally verify merge conflicts through the GitHub API.

It resembles the shape of Candidate Discovery, but its evidence is textual and location-based. It does not target the important case in which two pull requests change different files connected by a shared technical concept.

### Design lesson

The project should not present pair generation or deterministic pair filtering as novel. Its more specific contribution is structural cross-file selection followed by a focused reviewer explanation.

</details>

<details>
<summary><strong>Build-impact selection: Aviator and Trunk</strong></summary>

[Aviator affected targets](https://docs.aviator.co/mergequeue/concepts/affected-targets) and [Trunk parallel queues](https://docs.trunk.io/merge-queue/optimizations/parallel-queues) can use affected targets from systems such as Bazel or Nx to determine which queued pull requests are independent.

This is Candidate Discovery with a different objective:

- they determine what can safely be tested apart;
- this project determines what may need to be reviewed together.

Build-graph evidence can be highly useful in repositories that already maintain accurate dependency metadata. It may also be coarser than a structural source-code relationship because one build target can cover a large area.

The proposed project instead uses structural source-code evidence and does not depend on Bazel, Nx or other build-graph configuration.

</details>

<details>
<summary><strong>Repository-aware AI reviewers</strong></summary>

Modern AI reviewers such as [GitHub Copilot Code Review](https://docs.github.com/en/copilot/concepts/agents/code-review), [CodeRabbit](https://docs.coderabbit.ai/guides/code-review-overview), [Qodo](https://docs.qodo.ai/code-review) and [Greptile](https://www.greptile.com/docs/introduction) should not be described as diff-only tools. Their documented context can include repository structure, code definitions, history, guidelines, issues, organizational knowledge and linked repositories.

Their core workflow remains different from the proposed project:

- an AI reviewer normally starts with one pull request and evaluates that change;
- this project starts with the set of eligible pull requests and first discovers which pairs warrant analysis.

[CodeRabbit Multi-Repo Analysis](https://docs.coderabbit.ai/knowledge-base/multi-repo-analysis) deserves particular monitoring because it already provides repository-aware review, cross-repository impact analysis and semantic explanations. Its public documentation does not currently establish systematic discovery of sibling open pull requests targeting the same branch. That is a current documentation boundary, not a claim that the product could never implement it.

The same caution applies to Copilot, Qodo and Greptile: silence about open-PR context should be recorded as unknown rather than converted into a categorical `No`.

</details>

<details>
<summary><strong>Dependent-change coordination</strong></summary>

[GitHub stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-stacked-pull-requests), [Graphite stacks](https://graphite.dev/docs) and [Gerrit topics](https://gerrit-review.googlesource.com/Documentation/cross-repository-changes.html) coordinate changes that developers already know are related. They preserve dependencies, review order or joint submission behaviour.

They solve an important collaboration problem, but they assume the relationship has already been declared. They do not discover an undeclared semantic relationship between independently developed changes.

This distinction matters because the proposed project is most useful when no author or reviewer has already identified the counterpart pull request.

</details>

<details>
<summary><strong>Semantic-conflict research</strong></summary>

Semantic-conflict research investigates cases where branches merge textually but interfere behaviourally. Systems may use static analysis, speculative merging, generated tests, builds or test execution.

[ConflictLens](https://ksiresearch.org/seke/seke25paper/paper012.pdf) combines LLM-assisted localization with generated tests intended to confirm or reject a conflict hypothesis. Earlier systems such as [Crystal](https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-tse2013-abstract.html) and [WeCode](https://doi.org/10.1109/ICSE.2012.6227180) monitored concurrent work and speculatively merged, built or tested combinations.

These systems either begin with a known pair or perform substantially heavier validation than the proposed MVP.

The proposed project deliberately stops earlier. It identifies a plausible interaction and gives the reviewer an evidence-based question to investigate. It does not claim verified semantic-conflict detection.

</details>

<details>
<summary><strong>The ad-hoc coding-agent substitute</strong></summary>

A developer with repository access can ask a coding agent to compare two pull requests in under a minute. For a pair the developer already suspects, this may provide an explanation comparable to the proposed project's AI stage.

Therefore, AI reasoning alone is not the defensible value.

The project must justify itself through:

- systematic coverage of the eligible pair space;
- deterministic cost reduction before AI analysis;
- repeatable and bounded context construction;
- consistent evidence and limitation reporting;
- reviewer-facing results without requiring a human to identify every pair first.

For repositories with very few simultaneous eligible pull requests, manual analysis may remain sufficient.

</details>

---

## Where the Project Fits

No verified direct product was found whose documented primary workflow combines all of these characteristics:

1. starts from eligible pull requests targeting the same branch;
2. discovers which pairs merit investigation without a human naming them;
3. uses structural evidence capable of connecting different changed files;
4. performs focused semantic analysis of the selected pair;
5. produces an explanation designed for a reviewer;
6. operates before merge, build or test execution.

This is a genuine but narrow workflow gap. It should not be inflated into a broad novelty claim.

The most defensible product promise is:

> Find technically related pull-request pairs that reviewers are unlikely to inspect together by default, and explain the plausible changed assumption that connects them.

The strongest differentiation is not that the project can reason about two changes. It is that it can decide **which pairs deserve that reasoning**, using a bounded and repeatable process.

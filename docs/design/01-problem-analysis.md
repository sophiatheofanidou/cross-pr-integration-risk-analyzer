# Problem Analysis

## Background

The motivation for this project originated from a real software engineering scenario in which independently approved pull requests introduced unexpected integration issues after being merged.

While implementation details vary between organizations, the underlying problem is common in medium-to-large software projects developed by multiple engineers or teams in parallel.

---

## The Core Problem

Modern repositories may contain many pull requests that are open, reviewed and approved at the same time.

Each pull request is usually reviewed independently. This is practical for normal code review, but it means reviewers may have limited awareness of assumptions being changed by other approved work.

The challenge is therefore not evaluating a single pull request.

The challenge is understanding which independently approved pull requests should be reviewed **together** before they coexist in the integration branch.

A useful way to describe the target problem is:

> One pull request changes an assumption about the system that another independently developed pull request still relies on.

---

## What the Project Means by Cross-PR Integration Risk

The project focuses on interactions that may not be visible as normal Git merge conflicts.

Two pull requests may be textually mergeable while still introducing an incompatible combined result.

Typical forms include:

- **Contract incompatibility** — one pull request changes how an existing component must be used while another relies on the previous contract.
- **Behavioural incompatibility** — one pull request changes the behaviour or semantics of an existing component while another relies on its previous behaviour.
- **Shared model or state incompatibility** — one pull request changes shared data or possible system states while another relies on the previous model.

These are guiding examples rather than an exhaustive taxonomy.

The analyzer does not attempt to detect textual merge conflicts already handled by Git, nor does it establish or validate that a pull-request pair is textually mergeable.

---

## Why This Happens

Several characteristics of larger software projects contribute to the problem:

- Multiple engineers or teams work in parallel.
- Different reviewers approve different pull requests.
- Pull requests may be reviewed hours or days apart.
- The target branch continues to evolve.
- Reviewers cannot continuously reason about every other approved change waiting to be merged.

As a result, two individually reasonable changes may deserve additional investigation when considered together.

---

## The Combinatorial Problem

With **N** approved pull requests targeting the same branch, the number of possible pairs is:

```text
N × (N - 1) / 2
```

For example, 30 approved pull requests produce 435 possible pairs.

A reviewer can easily ask an AI assistant to compare two selected pull requests. The harder workflow problem is deciding which combinations among many approved pull requests are worth comparing in the first place, while keeping analysis effort and AI cost under control.

---

## Why Traditional Code Review Is Not Enough

This is not a problem of reviewer quality.

Traditional code review intentionally focuses on one change at a time. Expecting a reviewer to manually discover and investigate every potentially related approved pull request is unrealistic as concurrency grows.

The opportunity is therefore to provide tooling that:

- discovers technically related pull request pairs,
- prioritizes where AI reasoning is worth paying for,
- and presents the result as a repeatable reviewer workflow.

---

## Typical Consequences

When an important interaction is missed, consequences may include:

- broken application behaviour,
- runtime failures,
- failed validation after integration,
- release delays,
- additional debugging effort,
- emergency fixes.

The objective is not to eliminate every possible integration issue.

The objective is to identify combinations that deserve additional human investigation before merge.

---

## Existing Development Workflow

A simplified workflow is:

1. A developer implements a change.
2. A pull request is created.
3. The pull request is reviewed.
4. The pull request is approved.
5. Multiple approved pull requests accumulate against the same target branch.
6. The pull requests are merged.
7. Cross-PR issues may become visible only after the changes coexist.

Current review processes primarily evaluate individual pull requests rather than the interaction between the current set of approved changes.

---

## Opportunity

A focused tool can automate the repetitive parts of this workflow:

- retrieving the current approved PR set,
- finding technically connected PR combinations,
- preparing compact evidence and context,
- applying AI reasoning only where useful,
- generating a consistent risk report.

This provides value beyond manually uploading two diffs to a general AI assistant because the application manages the **set-level workflow**, not only the reasoning for one manually selected pair.

---

## Scope of the Problem

The problem is most relevant where there are:

- medium-to-large repositories,
- multiple parallel developers or teams,
- several approved pull requests targeting the same branch,
- costly integration or validation pipelines,
- reviewers with responsibility for only part of the active change set.

Smaller repositories with very few concurrent pull requests generally have less need for dedicated cross-PR discovery.

---

## Summary

Existing tools already provide strong support for individual pull request review, Git merge conflict detection, CI/CD validation and repository governance.

The project addresses a narrower gap:

> Automatically identify and explain which independently approved changes may deserve additional review together because of integration risks that are distinct from Git-detectable textual merge conflicts.

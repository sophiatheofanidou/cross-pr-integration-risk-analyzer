# Candidate Discovery

## Purpose

Candidate Discovery identifies pull request pairs that deserve deeper contextual and AI-assisted analysis.

It receives pull requests that have already passed Eligibility Selection and asks a deliberately narrow question:

> Do the changes in these two pull requests contain a matching technical term that gives the system a concrete reason to inspect them together?

Candidate Discovery does not determine whether an integration risk exists. It does not classify a change as a contract, parameter, behaviour, model or state incompatibility. Those are semantic conclusions for AI Risk Analysis.

Its responsibility is to reduce the possible PR-pair set, identify the relevant files and locations, and preserve factual evidence explaining why each selected pair receives deeper analysis.

---

## Language Independence

Candidate Discovery is language-aware but not tied to one programming language.

Each supported language is handled through a replaceable structural analyzer. The analyzer understands how that language represents declarations, references, named structures and source locations. Adding another language analyzer extends coverage without changing the Candidate Pair or Technical Term Match contracts.

The languages supported by a particular release belong in that release's specification and implementation plan, not in the general architecture.

The design does not require:

- language-agnostic lexical matching,
- deterministic risk classification,
- complete semantic symbol resolution,
- repository-wide retrieval or indexing,
- or a numeric Interaction Score.

---

## Inputs

Candidate Discovery receives normalized information for each eligible pull request, including:

- pull request ID,
- target branch,
- immutable change-base and head revisions,
- changed file paths and change types,
- provider-supplied patches when available,
- bounded resulting file contents when structural analysis requires them.

Only files supported by an available structural analyzer participate in technical-term matching. Other relevant files may produce analysis warnings, but they do not produce speculative lexical matches.

---

## Pair Generation

Eligible pull requests targeting the same branch are grouped together.

For each group, every unordered pair is considered exactly once. The pair `{A, B}` is the same pair as `{B, A}`.

For **N** eligible pull requests, the number of possible pairs is:

```text
N x (N - 1) / 2
```

For example:

```text
30 PRs -> 435 possible pairs
```

Pair generation is deterministic. Candidate Discovery exists to prevent every possible pair from requiring AI analysis.

---

## Candidate Selection Criterion

A possible PR pair becomes a Candidate Pair when structural analysis produces at least one Technical Term Match.

A Technical Term Match exists when the analysis:

1. associates a relevant named technical term with a changed region in one pull request, and
2. finds the same named structural term in the resulting content of a supported file changed by the other pull request.

The matching locations may be:

- in the same file or in different files,
- in changed or unchanged regions of the other pull request's resulting changed file.

Same-file location is therefore context, not a separate selection criterion.

The pair is unordered, but match collection evaluates the relationship in both directions:

```text
PR A changed terms -> PR B resulting changed files
PR B changed terms -> PR A resulting changed files
```

The direction explains which location supplied the changed-region term and which supplied the matching occurrence. It does not create a different kind of Candidate Pair.

Selection is derived from the collection:

```text
isCandidate = technicalTermMatches.length > 0
```

The model does not store a fixed rule ID or a separate boolean because neither contains information beyond the matches themselves.

---

## Technical Term

A technical term is a relevant name identified through the source language's syntax and used to connect two pull-request changes. It is not an arbitrary repeated word.

Examples may include names of:

- functions,
- methods,
- classes,
- interfaces and types,
- variables and parameters,
- properties,
- and matching calls or references.

Keywords, comments and ordinary string contents do not become technical terms merely because the same text appears elsewhere. Each structural analyzer decides which syntax nodes supply declaration or reference names and which names are associated with a changed region. These extraction details stay internal and may evolve without changing the shared evidence contract.

A change to a parameter type, parameter count or function behaviour can therefore be associated with the surrounding function name and with relevant names inside the changed syntax. Candidate Discovery records those correlations; AI Risk Analysis decides what the change means.

The technical term is a deterministic correlation key. Matching a name does not prove that two occurrences resolve to the same semantic symbol.

---

## Language-Aware Structural Analysis

A structural analyzer parses bounded source locally. It does not send code to an external service and does not use AI tokens.

The analyzer uses pull-request change ranges together with the parsed syntax tree to identify relevant named structures associated with the change. This includes cases where the name itself is outside the changed lines.

Example:

```diff
function processPayment(amount) {
-  return charge(amount);
+  return authorizeAndCapture(amount);
}
```

The changed lines do not contain `processPayment`. Structural analysis can nevertheless associate the change with the enclosing `processPayment` function.

Candidate Discovery may then find a matching structural occurrence in a file changed by another pull request:

```text
result = processPayment(total)
```

This produces factual evidence that the pair deserves deeper analysis. It does not determine whether the behaviour, parameters or contract are incompatible.

Structural parsing provides syntactic structure, not complete semantic resolution. Depending on the language and analyzer, it may not reliably resolve every case involving:

- imports and re-exports,
- aliases,
- scopes,
- overloads,
- inheritance,
- dynamic dispatch.

Same-named constructs may therefore be unrelated. AI Risk Analysis evaluates that uncertainty using focused context.

---

## Same-File and Cross-File Matching

Technical-term matching does not distinguish same-file and cross-file relationships as separate categories.

```text
PR A changed region -> technical term processPayment
PR B relevant occurrence -> technical term processPayment
```

The same kind of match is produced whether both locations are in one file or each location is in a different file.

File paths and source locations remain part of the match so later stages can retrieve the correct context.

---

## Resulting-Content Search

Searching only the other pull request's patch is insufficient.

The important cross-PR scenario may contain the matching occurrence in an unchanged region of a file that the other pull request modifies:

```text
PR A changes processPayment.

PR B changes another region of a file that still contains processPayment.
```

Candidate Discovery therefore examines the bounded resulting content of relevant supported files at the other pull request's immutable `headRevision`.

For a modified file, a usable provider patch is the preferred source of changed ranges on the side whose change is being analyzed. If the patch is unavailable or cannot provide reliable changed ranges, Candidate Discovery retrieves bounded versions of that selected file at the pull request's immutable `changeBaseRevision` and `headRevision` and reconstructs a local line diff. The file is skipped with an explicit warning only when neither path can provide reliable changed ranges and resulting content.

For an added file, the complete resulting content is the changed range and no patch or local reconstruction is required.

This is selected-file retrieval only. It does not download, parse or index the complete repository.

Retrieved content is reused within the current analysis run where practical.

---

## Changed-File Support

Each release defines which change types its available analyzers support. Unsupported cases are reported explicitly rather than silently interpreted as having no match.

The minimum useful implementation supports added and modified source files. Modified-file support includes bounded local before/after diff reconstruction when the provider patch is unavailable or insufficient. Deleted-file analysis and complex rename handling remain optional extensions rather than requirements of the shared match model.

These cases do not introduce different match categories.

---

## Evidence Model

Every selected pair preserves one or more Technical Term Matches.

Conceptually:

```text
Candidate Pair
├── Pull Request A
├── Pull Request B
└── Technical Term Matches[]
    ├── Technical Term
    ├── Changed-Region Location
    └── Matching-Occurrence Location
```

Example:

```text
Technical Term:
processPayment

Changed-Region Location:
src/payments/payment.service

Matching-Occurrence Location:
src/checkout/checkout.service
```

A match explains why the pair was selected. It does not claim that:

- the two occurrences are definitively the same semantic symbol,
- one pull request depends on the other,
- the changes are incompatible,
- or an integration risk exists.

Duplicate matches for the same technical term and locations are removed deterministically. Useful source ranges already identified during structural analysis may be retained so focused context retrieval does not need to rediscover them.

---

## Analysis Warnings

Candidate Discovery must distinguish:

```text
analysis completed and no match was found
```

from:

```text
the relevant structural analysis could not be completed
```

Material warnings include:

- changed files without an available structural analyzer,
- unavailable content,
- binary or unsupported content,
- oversized content,
- missing or insufficient patch information when local reconstruction also cannot provide reliable changed ranges,
- malformed source that cannot provide reliable structural facts.

Warnings are diagnostic metadata, not candidate evidence. Candidate Discovery returns them separately from Candidate Pairs so incomplete analysis is not silently represented as an unrelated pair.

Each warning identifies the affected pull request and, when applicable, the affected file and reason. This allows later stages to include only warnings relevant to the pair being assessed.

---

## Output

Conceptually, Candidate Discovery produces:

```text
Candidate Discovery Result
├── Candidate Pairs[]
│   └── Technical Term Matches[]
└── Analysis Warnings[]
```

This output becomes the input to Context Retrieval.

---

## System Boundaries

Candidate Discovery is responsible for:

- generating unique same-target-branch PR pairs,
- invoking the available bounded structural analyzers,
- identifying Technical Term Matches,
- selecting Candidate Pairs,
- preserving relevant file locations,
- reporting material analysis warnings.

Candidate Discovery is not responsible for:

- determining what kind of change occurred semantically,
- confirming an integration risk,
- proving semantic symbol identity,
- assigning severity or confidence,
- detecting Git textual merge conflicts,
- executing builds or tests,
- analyzing the complete repository.

---

## Future Investigations

Future work may investigate:

- structural analyzers for additional languages,
- a bounded lexical fallback for unsupported languages, but only if measured scenarios demonstrate useful recall without excessive noise,
- deleted-file and richer rename analysis,
- richer symbol resolution,
- additional structurally recognized construct types,
- measured cost-versus-recall improvements.

These investigations do not change the current Candidate Pair and Technical Term Match contracts.

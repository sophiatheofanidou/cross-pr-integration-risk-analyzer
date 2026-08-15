# Context Retrieval

## Purpose

Context Retrieval retrieves and prepares enough focused information for AI Risk Assessment to understand a selected Candidate Pair without sending the complete repository.

Candidate Discovery already identifies the Technical Term Matches and source locations connecting the pull requests. This stage packages the relevant changes and nearby code for semantic reasoning.

It is a separate responsibility, but it does not need to be a standalone retrieval subsystem in the MVP.

---

## Inputs

Context Retrieval receives:

- a Candidate Pair,
- its Technical Term Matches,
- the relevant provider or locally reconstructed change hunks,
- structural ranges and resulting file contents already obtained during Candidate Discovery,
- analysis warnings relevant to either pull request in the pair.

It requests additional content through the Source Control Integration only when the approved MVP flow explicitly requires it. It never calls provider-specific APIs directly.

---

## MVP Context

For each relevant match, the retrieved context may include:

- the relevant provider or locally reconstructed hunk containing the changed region,
- a relevant change hunk from the file containing the matching occurrence when useful,
- the enclosing source snippet around the changed region,
- the enclosing or bounded snippet around the matching occurrence,
- the technical term and both locations,
- concise pull-request metadata,
- analysis warnings relevant to the pair and supplied source material.

Content already retrieved and parsed during Candidate Discovery is reused. The MVP does not build a repository index, perform semantic retrieval or explore arbitrary repository files.

---

## Selection and Bounds

Context Retrieval first selects match-centered hunks and source snippets. It does not blindly truncate a complete patch and risk removing the evidence that caused the pair to be selected.

It then applies simple configurable limits to:

- selected hunk length,
- snippet length,
- total retrieved context size.

An individual match may be omitted from the retrieved context when its critical change hunk or source snippets cannot be included reliably. The pair remains assessable when at least one Technical Term Match retains its changed-region context, matching-occurrence context and relevant change representation. Omitted material produces a visible warning.

If no match satisfies that minimum, the Candidate Pair remains in the discovery result but the AI assessment is not invoked. The reviewer sees that the pair was discovered and why it could not be assessed; missing context is never converted into `NO_RISK_IDENTIFIED`.

The objective is not to find every potentially related repository artifact. It is to provide a focused explanation of the deterministic relationship already discovered.

---

## Context Provided to AI Risk Assessment

Context Retrieval provides:

- Pull Request A metadata,
- Pull Request B metadata,
- Technical Term Matches,
- relevant change hunks,
- relevant source snippets,
- analysis warnings.

The implementation may package these values in a small internal object. That object is an implementation detail, not a separate design concept or general-purpose repository-context domain model.

---

## System Boundaries

Context Retrieval is responsible for:

- selecting and bounding relevant change hunks and snippets,
- enforcing the minimum context required before AI assessment,
- reusing Candidate Discovery results,
- preventing complete-repository prompts,
- exposing missing or truncated information.

It is not responsible for:

- selecting Candidate Pairs,
- searching the repository for new relationships,
- deciding whether a risk exists,
- assigning severity or confidence.

---

## Future Improvements

Future versions may introduce richer context retrieval when measured scenarios show that the MVP context is insufficient. Possible improvements include:

- repository-wide structural indexes,
- cross-file symbol resolution,
- semantic retrieval or RAG,
- agentic repository search,
- a replaceable external Repository Context Provider,
- richer deduplication and retrieval-reason metadata.

These are extensions of the same responsibility, not MVP requirements.

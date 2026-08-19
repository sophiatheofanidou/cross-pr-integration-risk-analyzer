# AI Risk Analysis

## Purpose

AI Risk Analysis evaluates each Candidate Pair using the context produced by Context Retrieval.

Candidate Discovery establishes an objective structural relationship. AI Risk Analysis asks whether that relationship may represent a meaningful cross-PR integration risk:

> Did one pull request change an assumption that the other pull request may still rely on?

The result is advisory. The final decision remains with the reviewer.

---

## MVP Strategy

The MVP performs one structured AI assessment per Candidate Pair whose retrieved context contains at least one sufficiently supported Technical Term Match.

```text
Candidate Pair
      ↓
Context Retrieval
      ↓
AI Risk Assessment
      ↓
Risk Result
```

One assessment is sufficient to demonstrate the core workflow. A separate screening tier is not required before candidate volume and AI cost have been measured.

Context sufficiency is checked before invoking the provider. A discovered pair with no complete match-centered context remains visible with an explicit assessment-not-run warning; it does not produce an AI risk status.

---

## Input

The assessment receives:

- both pull requests and concise metadata,
- relevant provider or locally reconstructed change hunks,
- Technical Term Matches,
- bounded source snippets around the changed region and matching occurrence,
- explicit analysis warnings.

The AI does not independently retrieve arbitrary repository content in the MVP.

---

## Reasoning Responsibility

The AI should determine whether:

- one change may invalidate an assumption made by the other,
- a contract, behaviour, shared model or state may have changed,
- the relationship is merely a coincidental same-name match,
- the available context is sufficient for a useful conclusion,
- and what the reviewer should verify.

The risk categories guide explanation and are not deterministic Candidate Discovery classifications.

---

## Evidence and Inference

The output must distinguish factual evidence from semantic inference.

Objective evidence includes:

- the technical term that matched,
- the changed-region and matching-occurrence locations,
- the supplied change hunks and snippets.

Inference includes statements such as:

```text
PR B may still rely on the previous processPayment contract.
```

The tool reports plausible risks, not confirmed defects.

---

## MVP Output

The provider returns one validated structured result:

```text
Risk Assessment
├── Status: RISK_IDENTIFIED | NO_RISK_IDENTIFIED
├── Potential Integration Problem? (risk only)
├── No-Risk Explanation? (no risk only)
├── Confidence: LOW | MEDIUM | HIGH
├── Severity: LOW | MEDIUM | HIGH ?
└── Reviewer Action? (risk only)
```

Rules:

- `Potential Integration Problem`, `Severity` and `Reviewer Action` are required when a risk is identified.
- `Potential Integration Problem` is limited to 2,000 characters and preferably 2–5 sentences. It briefly explains how both PRs are technically connected, the plausible incompatibility or risky combined behavior, and the affected behavior or flow. It does not need to claim that either PR changed an assumption.
- `Reviewer Action` is limited to 600 characters and contains one concrete imperative review step grounded in the supplied file, symbol or data flow when the evidence supports it.
- `No-Risk Explanation` is limited to 1,200 characters. It is required when no risk is identified and briefly explains why the deterministic relationship appears compatible or coincidental.
- `Confidence` describes evidential support, not impact.
- `Severity` describes potential impact if the risk is real.
- non-critical analysis warnings may reduce confidence and must not disappear from the reviewer-facing result.
- critical missing input prevents the provider call instead of producing `NO_RISK_IDENTIFIED`.

Specific model names remain configuration choices.

---

## Human-in-the-Loop

The AI does not:

- approve or reject pull requests,
- merge code,
- execute builds or tests,
- establish textual mergeability,
- guarantee that a defect exists.

The report gives the reviewer a concrete relationship, a bounded explanation and a targeted action.

---

## MVP Cost Control

The MVP controls AI cost through the mechanisms that are already part of the product's core value:

- deterministic Candidate Discovery reduces the number of pairs sent to AI,
- bounded retrieved context reduces tokens per assessment,
- each assessable Candidate Pair is assessed only once within one analysis run.

The MVP does not need additional infrastructure to demonstrate cost-aware reasoning.

---

## Future Improvement: Tiered AI Analysis

Tiered analysis remains an intentional evolution path.

A future version may add:

```text
Candidate Pair
      ↓
Cheap Screening
      ├── Dismiss
      └── Escalate
              ↓
       Detailed Analysis
```

This should be introduced when measurements show that:

- Candidate Discovery still produces enough pairs to make one full assessment per pair expensive,
- a cheaper model can dismiss obvious false positives without unacceptable recall loss,
- and the additional prompts, schemas and orchestration are justified.

Uncertain or materially incomplete cases should be escalated rather than dismissed.

---

## Future Improvement: SQLite Result Caching

Persistent application-level result caching also remains an intentional future improvement.

A SQLite cache may store validated assessment results using a key derived from:

- both immutable pull-request revisions,
- the retrieved context,
- prompt and output-schema versions,
- relevant model configuration.

A valid cache hit can avoid a paid AI call across separate application runs. SQLite is appropriate for a local portfolio deployment because it provides durable storage without separate database infrastructure.

It should be added when repeated analyses of unchanged PR pairs become part of the demonstrated workflow. The cache remains behind a replaceable interface and does not change the Risk Assessment contract.

If tiered analysis is later introduced, screening and detailed results may be cached independently.

---

## Future Improvement: Provider Prompt Caching

Prompt caching is distinct from SQLite result caching.

- Result caching avoids the AI request entirely when the complete analysis is unchanged.
- Provider prompt caching reduces input processing cost when a new request still needs to be made but contains stable repeated content.

Prompt caching may be enabled when the chosen provider supports it and measurements show useful repeated prompt prefixes, such as stable instructions or one pull request reused across several pair analyses.

It remains provider-specific optimization and must not leak into the provider-neutral Risk Assessment contract.

---

## Other Future Improvements

Future versions may also evaluate:

- multiple AI providers,
- richer prompt strategies,
- multiple findings per pair,
- AI-request retries and more advanced failure recovery,
- agentic repository investigation,
- measured cost, latency and recall comparisons.

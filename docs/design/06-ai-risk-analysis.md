# AI Risk Analysis

## Purpose

AI Risk Analysis evaluates each Candidate Pair using the context produced by Context Retrieval.

Candidate Discovery establishes an objective structural relationship. AI Risk Analysis asks whether that relationship may represent a meaningful cross-PR integration risk:

> Could the two supplied changes become incompatible or risky when combined?

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
├── Likely Outcome? (risk only)
├── Pull Request A Contribution? (risk only)
├── Pull Request B Contribution? (risk only)
├── Combined Effect? (risk only)
├── Relevant Code? (risk only)
├── Relationship Summary? (no risk only)
├── Independence Reason? (no risk only)
├── Coverage Limitation? (no risk only, when material)
├── Confidence: LOW | MEDIUM | HIGH
├── Severity: LOW | MEDIUM | HIGH ?
└── Reviewer Action? (risk only)
```

Rules:

- `Likely Outcome`, both pull-request contributions, `Combined Effect`, `Relevant Code`, `Severity` and `Reviewer Action` are required when a risk is identified.
- `Likely Outcome` is a short reviewer-facing summary. The two contribution fields explain what each actual pull request adds or changes, while `Combined Effect` explains the risky interaction without duplicating PR labels inside the text.
- `Relevant Code` is selected by the provider but normalized against supplied deterministic evidence, including the correct pull-request ID, technical term, file and line.
- `Reviewer Action` is limited to 600 characters and contains one concrete imperative review step grounded in the supplied file, symbol or data flow when the evidence supports it.
- `Relationship Summary` explains why deterministic matching selected a no-risk pair. `Independence Reason` explains why the supplied bounded evidence appears compatible or coincidental. `Coverage Limitation` records a material warning or bounded-context limitation when one exists.
- `Confidence` describes evidential support, not impact.
- `Severity` describes potential impact if the risk is real.
- deterministic post-validation promotes build/type-check/deployment blockers and severe financial, security or data impact to High severity;
- non-critical analysis warnings may reduce confidence and must not disappear from the reviewer-facing result.
- critical missing input prevents the provider call instead of producing `NO_RISK_IDENTIFIED`.

Specific model names remain configuration choices.

The Claude adapter uses a flat Anthropic-compatible output schema without a root union, `$defs` or `$ref`. It normalizes that provider-specific shape into the provider-neutral discriminated union above. The default output limit is 2,048 tokens, preventing the truncation observed with the earlier smaller limit. Provider failures retain safe request diagnostics and become pair-scoped `NOT_RUN/PROVIDER_FAILURE` results at the application boundary. At most four pair assessments execute concurrently; this bounds provider pressure and reduces total run time without changing individual request latency.

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

The current implementation can emit opt-in metrics for each analysis run, source-control request and Claude request. Output modes are `console`, `file` or `both`. Console output produces one concise summary after the run rather than one raw line per request. File output maintains the ignored, self-contained `runtime/metrics/analysis-report.html`: a readable comparison table that preserves earlier runs and expandable GitHub/Claude request details for each run. The first HTML write imports any existing legacy CSV baseline. Metrics include total and stage latency, source-control request totals, every Claude call's pair and latency, model, token/cache usage, estimated standard-list-price cost, risk/no-risk counts, warnings and bounded failure information. They exclude API keys, repository URLs, complete prompts, provider payloads and source-code content. Cost is explicitly labelled as an estimate and tied to a dated model-pricing snapshot; unsupported models or caching modes display no estimate rather than applying an inaccurate rate.

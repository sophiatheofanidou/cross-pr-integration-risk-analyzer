# AI Risk Analysis

## Purpose

AI Risk Analysis evaluates the Candidate Pairs selected by Candidate Discovery using the focused Context Bundle prepared by Repository Context Retrieval.

Its purpose is to determine whether an objective technical relationship between two pull requests may represent a meaningful cross-PR integration risk.

Unlike Candidate Discovery, this stage performs semantic reasoning.

The AI should not treat every technical relationship as a problem.

Instead, it should determine whether:

> One pull request may have changed an assumption about the system that another independently developed pull request still relies on.

The result remains advisory and is intended to support human review.

---

## Input

AI Risk Analysis receives:

- Candidate Pair
- Candidate Discovery Evidence[]
- focused Context Bundle
- explicit Coverage Limitations, when present
- relevant pull request metadata

The AI does not independently retrieve arbitrary repository content during the initial design.

All required input is prepared by the preceding stages.

A missing snippet or unavailable file must be represented as missing information rather than omitted without explanation.

---

## Analysis Strategy

AI analysis is divided into two reasoning tiers:

```text
Candidate Pair
      ↓
Focused Context
      ↓
Screening Analysis
      ↓
 ┌───────────────┐
 │               │
Dismiss       Escalate
                 ↓
         Detailed Analysis
                 ↓
             Finding
```

This separation allows the system to use cheaper reasoning for broad filtering while reserving more capable analysis for cases that deserve deeper investigation.

---

# Screening Analysis

## Purpose

Screening determines whether a Candidate Pair deserves detailed AI analysis.

Candidate Discovery already established that the pair has some objective technical relationship.

Screening asks a different question:

> Is there a plausible semantic or behavioural interaction here that is worth deeper reasoning?

---

## Screening Input

The screening model receives a compact version of the Context Bundle, including:

- relevant PR diffs,
- Candidate Discovery evidence,
- directly related code snippets,
- minimal PR metadata.

The screening input should remain small and focused.

---

## Screening Output

The screening result is intentionally simple:

```text
DISMISS
```

or

```text
ESCALATE
```

A short rationale should also be retained.

Example:

```text
Decision:
ESCALATE

Reason:
PR A changes the processPayment contract while PR B introduces a new call relying on the previous parameter structure.
```

---

## Handling Uncertainty

The screening stage should be conservative.

If the model identifies:

- a plausible interaction,
- insufficient context to safely dismiss,
- or meaningful uncertainty,

the Candidate Pair should be escalated.

The screening model should dismiss only when the available information provides reasonable confidence that deeper analysis is unlikely to produce a meaningful finding.

This avoids using the cheaper model as an aggressive hard filter.

A Candidate Pair must not be dismissed solely because context required to evaluate its existing evidence was unavailable. A material context limitation contributes to uncertainty and therefore causes escalation under the existing two-decision screening model.

---

# Detailed Risk Analysis

## Purpose

Detailed Analysis evaluates escalated Candidate Pairs more thoroughly.

Its objective is to explain:

- what changed,
- what assumption may have changed,
- what the other pull request appears to rely on,
- why the combination may be problematic,
- and what the reviewer should verify.

---

## Core Reasoning Questions

The analysis should consider questions such as:

- Could one pull request invalidate an assumption made by the other?
- Could the two changes be individually reasonable but incompatible when combined?
- Does one PR modify a contract used by the other?
- Does one PR change behaviour that the other appears to rely on?
- Does one PR modify shared model or state assumptions used by the other?
- Is the observed relationship merely structural proximity, or does it represent a plausible integration risk?
- What additional human validation would clarify the issue?

---

## Types of Cross-PR Risk

The system does not require an exhaustive taxonomy.

Useful high-level categories include:

### Contract Incompatibility

One pull request changes how an existing component is expected to be used while another pull request relies on the previous contract.

### Behavioural Incompatibility

One pull request changes what an existing component does or means while another relies on its previous behaviour.

### Shared Model or State Incompatibility

One pull request changes the possible structure or state of shared data while another relies on the previous model.

Other configuration, runtime or dependency-related findings may also be reported when supported by the evidence.

These categories guide explanation rather than act as strict classification rules.

---

## Evidence and Inference

The AI output must distinguish between:

### Objective Evidence

Facts produced by previous stages.

Examples:

- both PRs modify the same file,
- PR A modifies a method named `processPayment`,
- PR B contains a matching call,
- a specific diff changes a method signature.

### Inference

The AI's interpretation of what those facts may mean.

Example:

```text
PR B may still rely on the previous processPayment contract.
```

This distinction is important because AI Risk Analysis identifies **plausible risks**, not confirmed defects.

---

## Confidence

Confidence describes how strongly the available evidence supports the proposed interaction.

Possible levels:

- Low
- Medium
- High

Confidence should decrease when:

- context is incomplete,
- symbol identity is uncertain,
- the relationship depends on assumptions not directly visible in the supplied code.

Confidence does not represent potential impact.

---

## Severity

Severity describes the potential engineering impact if the identified interaction is real.

Possible levels:

- Low
- Medium
- High

Severity and confidence are independent.

A high-severity issue may have low confidence, and a high-confidence issue may have low impact.

---

# AI Cost Optimization

AI analysis is the most expensive stage of the workflow.

Several mechanisms are used to reduce repeated or unnecessary AI usage without changing the conceptual analysis responsibilities.

---

## Tiered Analysis

The first optimization is the separation between:

```text
Cheap Screening
      ↓
Detailed Analysis only when needed
```

The stronger reasoning model is therefore not invoked for every Candidate Pair.

---

## Compact Context

The AI receives focused Context Bundles rather than the complete repository.

This reduces:

- input tokens,
- irrelevant information,
- reasoning noise,
- analysis cost.

Context construction is defined in Repository Context Retrieval.

---

## Result Caching

Result caching is controlled by the application.

If exactly the same analysis has already been performed for unchanged pull request versions, the stored result can be reused without making another AI request.

Conceptually:

```text
PR A version
+
PR B version
+
analysis input/version
      ↓
Cache Key
```

If the key matches an existing result:

```text
Return Cached Result
```

No AI call is required.

The cache should be invalidated when relevant inputs change, such as:

- either pull request changes,
- the Context Bundle changes,
- the analysis prompt changes materially,
- the analysis configuration changes.

Screening and detailed-analysis results may be cached independently.

---

## Prompt Caching

Prompt caching is different from result caching.

Result caching eliminates an AI request entirely when the analysis is unchanged.

Prompt caching reduces the cost of repeated input when a new AI request still needs to be made.

Example:

```text
PR A ↔ PR B
PR A ↔ PR C
PR A ↔ PR D
```

The content associated with PR A may be reused across several comparisons.

When the selected AI provider supports prompt caching, repeated stable prompt content can be reused more efficiently rather than processed at full input cost each time.

Prompt caching is therefore a provider-level optimization, while result caching is an application-level mechanism.

---

## Relationship Between the Cost Mechanisms

```text
Cost Control

├── Candidate Discovery
│   └── reduces AI candidate volume
│
├── Focused Context
│   └── reduces tokens per AI request
│
├── Screening Tier
│   └── reduces detailed-model calls
│
├── Result Caching
│   └── avoids repeated AI requests entirely
│
└── Prompt Caching
    └── reduces repeated input cost across new requests
```

These mechanisms complement each other.

---

# Output

Detailed AI analysis produces a structured Detailed Analysis Result.

Conceptually:

```text
Detailed Analysis Result
├── Pull Request A
├── Pull Request B
├── Risk Status
├── Coverage Limitations[]
└── Outcome
    ├── RISK_IDENTIFIED
    │   └── Risk Finding
    │       ├── Explanation
    │       ├── Supporting Evidence[]
    │       ├── Inferred Assumption
    │       ├── Confidence
    │       ├── Severity
    │       └── Recommended Reviewer Check
    └── NO_RISK_IDENTIFIED
        ├── Explanation
        └── Supporting Evidence[]
```

Example reviewer recommendation:

```text
Verify whether the new checkout flow should be updated to use the revised payment contract before both pull requests are merged.
```

---

## No Risk Identified

Not every Candidate Pair should produce a Risk Finding.

Detailed Analysis may return `NO_RISK_IDENTIFIED` because:

- the shared symbol is coincidental,
- the changed code is unrelated,
- the two changes are compatible,
- the structural evidence does not represent a meaningful dependency.

Candidate Discovery intentionally favors finding relationships.

AI Risk Analysis is responsible for removing relationships that do not represent plausible integration risks.

---

## Human-in-the-Loop

The AI does not:

- approve pull requests,
- reject pull requests,
- merge code,
- execute tests,
- confirm that a defect definitely exists.

The final decision belongs to the reviewer.

The analysis should provide enough evidence and reasoning for the reviewer to investigate efficiently.

---

## System Boundaries

AI Risk Analysis is responsible for:

- screening Candidate Pairs,
- semantic interpretation,
- identifying plausible changed assumptions,
- explaining possible cross-PR integration risks,
- estimating confidence and severity,
- recommending human checks,
- applying AI-specific reuse and cost-control mechanisms.

AI Risk Analysis is not responsible for:

- selecting eligible pull requests,
- generating Candidate Pairs,
- performing structural parsing,
- constructing repository context,
- executing builds or tests,
- detecting Git textual merge conflicts.

---

## Future Evolution

Future versions may evaluate:

- different screening and detailed-analysis models,
- single-model versus tiered analysis,
- additional AI providers,
- richer prompt strategies,
- agentic repository investigation,
- additional context retrieval during analysis,
- measured cost-versus-recall trade-offs.

These changes may evolve without changing the fundamental responsibility of AI Risk Analysis.

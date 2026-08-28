# Controlled Demo Evaluation

## Purpose

This evaluation documents whether the portfolio minimum viable product (MVP) delivers its intended end-to-end reviewer workflow against known ground truth. It verifies that the analyzer selects the correct review scope, narrows the possible pull-request combinations through deterministic evidence, identifies and explains known build-time and semantic risks, dismisses a coincidental match, preserves coverage limitations, and presents actionable reviewer evidence.

It also records the operational behaviour of the implemented pipeline—including stage latency, model usage, token consumption, estimated cost, and failures—to support the final implementation and recorded demo choices while making the evaluation boundaries explicit.

The public [Cross-PR Risk Demo Online Store](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store) is a small runnable TypeScript application created for this purpose. Eight pull requests were branched from the same base commit, kept open, and approved against `main`. Each PR is valid independently. Four designed pairs test build failure, semantic failure, a coincidental structural match, and incomplete language coverage.

## Reviewer view

<p align="center">
  <img src="assets/application-overview.png" alt="Application overview showing eight eligible pull requests, 28 possible pairs, four Candidate Pairs, three risks, one no-risk result, and one coverage warning">
</p>

The completed run keeps the complete decision path visible. Candidate Discovery selected four technically related combinations from 28 possible pairs. All four were assessed, three were reported as risks, one was dismissed as a coincidental match, and the unsupported input remained visible as a coverage warning.

## Scenario matrix

| Pair | Shared deterministic term | Ground truth | Expected analyzer result | Actual analyzer result |
|---|---|---|---|---|
| [PR&nbsp;#1](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/1)&nbsp;+&nbsp;[PR&nbsp;#2](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/2) | `sendNotification` | Combined code fails type-check because a new caller uses the old two-argument signature | Risk identified; High severity | Risk identified; High severity |
| [PR&nbsp;#3](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/3)&nbsp;+&nbsp;[PR&nbsp;#4](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/4) | `loadPreferences` | Combined code fails type-check because a caller treats a new `Promise<Preferences>` as a synchronous value | Risk identified; High severity | Risk identified; High severity |
| [PR&nbsp;#5](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/5)&nbsp;+&nbsp;[PR&nbsp;#6](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/6) | `calculateOrderTotal` | Combined code builds but can authorize 25 cents instead of 2,500 cents | Risk identified; High severity | Risk identified; High severity |
| [PR&nbsp;#7](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/7)&nbsp;+&nbsp;[PR&nbsp;#8](https://github.com/sophiatheofanidou/cross-pr-risk-demo-online-store/pull/8) | `formatReference` | Module-local helpers are unrelated; the combination builds and behaves correctly | No risk identified; one unsupported-file warning | No risk identified; one unsupported-file warning |

The remaining 24 unordered pairs were designed to be unrelated and were filtered before AI Risk Assessment, as expected.

## Expected versus actual totals

| Metric | Expected | Actual |
|---|---:|---:|
| Eligible PRs | 8 | 8 |
| Possible pairs | 28 | 28 |
| Candidate Pairs | 4 | 4 |
| Pairs filtered before AI Risk Assessment | 24 | 24 |
| AI Risk Assessments | 4 | 4 |
| Risks identified | 3 | 3 |
| No risk identified | 1 | 1 |
| Not assessed | 0 | 0 |
| Coverage warnings | 1 | 1 |

Candidate Discovery therefore reduced the assessment set from 28 pairs to four, filtering 85.7% of possible pairs before any model call.

## Result evidence

The detailed captures come from repeated controlled Opus runs. The exact wording can vary between responses, while the classifications, severity, selected relationships, and reviewer focus remained stable.

### Build-time contract failure

One pull request changes `sendNotification` from two positional parameters to a request-object contract. Another independently adds a caller that still uses the earlier two-argument form. The analyzer attributes each side correctly, explains why the combined call no longer matches the declaration, and directs the reviewer to verify the merged type-check and exact call site.

<p align="center">
  <img src="assets/build-failure-result.png" alt="Build-failure result showing the incompatible sendNotification call and declaration">
</p>

### Semantic runtime risk

The payment scenario is deliberately more difficult than a compilation failure. One pull request changes the unit returned by `calculateOrderTotal`; another passes that value to payment authorization under the earlier cents assumption. Both values remain numbers, so the combined code can build while authorizing one hundredth of the intended amount.

<p align="center">
  <img src="assets/semantic-risk-result.png" alt="Semantic-risk result showing the calculateOrderTotal unit mismatch and selected technical evidence">
</p>

### Coincidental match correctly dismissed

The no-risk control confirms that a Technical Term Match is candidate evidence, not a risk conclusion. Both pull requests contain a file-local `formatReference` helper, but the declarations belong to separate modules, have no shared import or contract, and are used only by their respective wrappers. The result explains that independence while retaining the coverage limitation caused by the skipped promotions template.

<p align="center">
  <img src="assets/no-risk-result.png" alt="No-risk result explaining why the matching file-local formatReference helpers are independent">
</p>

<p align="center"><a href="assets/controlled-demo-results.png">Open the complete full-page result capture</a></p>

## Operational Performance

The opt-in local report preserves run-level and per-request evidence without storing credentials, repository URLs, prompts, provider payloads, or source-code content. Its comparison view focuses on operational performance: outcome, total and stage latency, model, AI-call count, input/output tokens, failures, and estimated cost. Reviewer-facing risk and warning counts remain in the application report instead of being duplicated as performance dimensions.

<p align="center">
  <img src="assets/analysis-performance-report.png" alt="Analysis Performance Report comparing four recorded Sonnet and Opus runs by stage latency, token usage, failures, and estimated cost">
</p>

<p align="center"><em>The recorded runs compare Sonnet and Opus on the same controlled workload and completed without operational failures.</em></p>

The recorded runs showed an average total analysis time of 21.28 seconds with Sonnet and 13.16 seconds with Opus. The main difference appeared in AI Risk Assessment, which averaged 16.57 seconds with Sonnet and 8.96 seconds with Opus. Both models produced the same expected three-risk/one-no-risk classification; Opus returned more concise responses and completed faster, at approximately twice the estimated cost. It was therefore selected for the recorded demo. The model remains runtime configuration rather than a domain or architecture dependency.

`AI Risk Assessment` is the measured wall-clock time for the complete concurrent assessment stage. It includes local bounded-context preparation before each request, but a provider-free benchmark measured that preparation at approximately 0.025 ms on average for the controlled path, making it negligible beside the observed multi-second AI requests. Individual call durations remain available in the expandable Run Details and can overlap because Candidate Pairs are assessed concurrently.

Estimated cost uses the [Claude Sonnet 5](https://www.anthropic.com/news/claude-sonnet-5) price of $2 per million input tokens and $10 per million output tokens and the [Claude Opus 5](https://www.anthropic.com/news/claude-opus-5) price of $5 per million input tokens and $25 per million output tokens. Actual billing can differ with caching, batch or regional processing, negotiated pricing, credits, and taxes.

## What the evaluation showed

- **Focused filtering reduced unnecessary AI work.** Only the four technically related pairs reached AI Risk Assessment; the other 24 combinations were filtered first.
- **It detected both build-time and runtime risks.** It identified two contract mismatches that can fail type-checking, found the type-correct cents-versus-euros runtime risk, and did not report the unrelated same-name match as a risk.
- **Uncertainty remained visible.** Unsupported input produced a coverage warning, and a failed assessment would be marked as not run rather than reported as no risk.
- **Individual failures remain contained.** One unsuccessful AI assessment does not discard results already completed for other Candidate Pairs.
- **The output supports reviewer action.** Each finding connects the two changes, points to relevant code, and states what should be verified before merge.

## Scope and limitations

The MVP structurally analyzes changed TypeScript `.ts` files. It does not yet cover the HTML file in PR #8, deleted or renamed files, or additional languages. Its syntax-aware name correlation is not complete symbol resolution, so AI Risk Assessment must still determine whether a Candidate Pair represents a real interaction.

The analyzer is advisory: it does not merge, check out, build, or test PR combinations. Separate controlled checks established the ground truth, and every finding still requires human review.

The repository and scenarios were intentionally designed to demonstrate the workflow, not to estimate production-scale accuracy. Model wording, latency, token usage, and cost can vary, so the recorded measurements should not be generalized to other repositories, models, regions, or provider conditions.

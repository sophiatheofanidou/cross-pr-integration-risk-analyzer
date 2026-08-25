# Cross-PR Integration Risk Analyzer

[![CI](https://github.com/sophiatheofanidou/cross-pr-integration-risk-analyzer/actions/workflows/ci.yml/badge.svg)](https://github.com/sophiatheofanidou/cross-pr-integration-risk-analyzer/actions/workflows/ci.yml)

An MVP that identifies integration risks between approved pull requests before they are merged, including risks that ordinary Git conflict detection cannot see.

## Repository Status

The repository foundation contains two npm workspaces:

- `apps/api` — Node.js and TypeScript backend,
- `apps/web` — Angular frontend.

The product behaviour is implemented incrementally through the milestones in `planning/implementation-plan.md`.

## Requirements

- Node.js `>=24.15.0 <25.0.0`
- npm `11.17.0`

## Commands

Run these commands from the repository root:

```text
npm install
npm run build
npm run type-check
npm test
npm run lint
```

Each root verification command runs the corresponding command in both workspaces.

On Windows PowerShell, if the local execution policy blocks `npm.ps1`, use `npm.cmd` in place of `npm`. No execution-policy change is required.

## Key-Free Visual Demo

Run the Angular reviewer UI with the development-only fixture API:

```text
npm run demo
```

Then open `http://127.0.0.1:4200/` and use:

- repository: `https://github.com/acme/payments-platform`,
- branch `development` for a complete report with warnings,
- branch `empty` for the zero-Candidate-Pairs state,
- branch `failure` for an operation error,
- branch `retry` for a first-attempt failure followed by a successful retry.

The fixture is only for repeatable UI review. It does not call GitHub or Claude and is not used by the production backend.

## Live Local Application

The production backend requires these environment variables in the shell that starts it:

- `GITHUB_TOKEN` — a GitHub personal access token that can read the analyzed repository,
- `ANTHROPIC_API_KEY` — an Anthropic API key,
- `ANTHROPIC_MODEL` — the Anthropic model ID used for risk assessment.

Keep credentials out of source files, command history and Git. After loading the variables into the current shell, build and start the backend from the repository root:

```text
npm run build --workspace @cross-pr-risk-analyzer/api
npm run start --workspace @cross-pr-risk-analyzer/api
```

In a second terminal, start the Angular development server:

```text
npm run start --workspace web
```

Open `http://127.0.0.1:4200/`. The Angular development proxy sends relative `/api` requests to the backend at `http://127.0.0.1:3000`.

The real-provider smoke test is opt-in and may incur Anthropic usage charges. It runs only when `RUN_CLAUDE_SMOKE_TEST=1`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are present:

```text
npm run test:claude-smoke --workspace @cross-pr-risk-analyzer/api
```

Normal test commands exclude this paid smoke test.

## Design Sources

The approved architecture and MVP boundaries are documented in `docs/design/`. The implementation sequence and decision gates are maintained in `planning/implementation-plan.md`.

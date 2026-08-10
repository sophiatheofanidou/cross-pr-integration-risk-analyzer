# Cross-PR Integration Risk Analyzer

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

## Design Sources

The approved architecture and MVP boundaries are documented in `docs/design/`. The implementation sequence and decision gates are maintained in `planning/implementation-plan.md`.

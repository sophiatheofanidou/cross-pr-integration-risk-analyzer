# Repository Guidance

## Source of Truth

Read `planning/implementation-plan.md` and the approved documents in `docs/design/` before proposing implementation changes. Do not silently change approved architecture or resurrect superseded drafts.

## Locked MVP Boundaries

- Use Angular for `apps/web` and Node.js with TypeScript for `apps/api`.
- Keep the core provider-neutral while using GitHub REST for the MVP.
- Run deterministic Candidate Discovery before AI analysis.
- Implement exactly the five approved evidence rules.
- Use bounded Tree-sitter analysis for TypeScript and C#.
- Retrieve focused context only; never retrieve repository-wide context.
- Preserve explicit partial-analysis and coverage limitations.
- Do not add an Interaction Score, automatic PR decisions, analyzed-PR combination builds/tests, an ORM or a dependency-injection container without a concrete approved need.

## Workspace

- Supported runtime: Node.js `>=24.15.0 <25.0.0`.
- Package manager: npm with one root lockfile.
- Initial workspaces: `apps/api` and `apps/web` only.
- Test runner: Vitest; name test files `*.spec.ts`.
- Keep type-checking separate from test execution.

## Root Commands

```text
npm install
npm run build
npm run type-check
npm test
npm run lint
```

## Working Agreement

- Work one milestone or bounded task at a time.
- Use the canonical MVP terminology defined in `docs/design/07-mvp-specification.md`.
- Preserve existing uncommitted changes and inspect the Git diff before edits.
- Keep code, identifiers, filenames, commands, commit messages and repository documentation in English.
- Add tests alongside relevant behaviour, prioritizing deterministic rules and regression risk.
- Do not introduce broad mocks, large fixture libraries, coverage targets or extensive browser E2E infrastructure for the MVP.
- Do not commit without discussing the complete diff with the project owner.

# Repository Guidance

## Source of Truth

Read `planning/implementation-plan.md` and the approved documents in `docs/design/` before proposing implementation changes. Do not silently change approved architecture or resurrect superseded drafts.

## Locked MVP Boundaries

- Use Angular for `apps/web` and Node.js with TypeScript for `apps/api`.
- Keep the core provider-neutral while using GitHub REST for the MVP.
- Run deterministic Candidate Discovery before AI analysis.
- Select Candidate Pairs from structured Technical Term Matches; do not add a fixed evidence-rule ID or redundant candidate boolean.
- Use bounded Tree-sitter analysis for added and modified TypeScript `.ts` files. Prefer usable provider patches for changed ranges and reconstruct a bounded local diff from the selected before/after file versions when the patch is unavailable or insufficient.
- Do not add lexical Candidate Discovery, a same-file selection rule or additional structural languages to the MVP.
- Retrieve focused context only; never retrieve repository-wide context.
- Preserve explicit analysis warnings for unsupported or incomplete inputs.
- Invoke AI only when at least one Technical Term Match has sufficient retrieved context; otherwise preserve the Candidate Pair and expose that its assessment was not run.
- Use one structured Claude assessment per Candidate Pair with sufficient context; tiered AI analysis is post-MVP work.
- Do not add SQLite result caching or provider prompt-caching orchestration to the MVP; preserve them as planned post-MVP improvements.
- Use Zod at external structured-data boundaries. Keep provider schemas adapter-local and separate from the provider-neutral domain contracts; do not revalidate every internal pipeline stage.
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

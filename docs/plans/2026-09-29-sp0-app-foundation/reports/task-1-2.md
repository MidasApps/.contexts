# SP0 — Tasks 1 and 2 report

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Commits

- `0e508b1` build(workspace): bootstrap pnpm and turborepo workspace (Task 1)
- `8061eba` build(config): add shared tsconfig, eslint boundaries and vitest preset (Task 2, also carries the Task 1 progress line)
- this report plus the Task 2 progress line go in a follow-up `docs(workspace)` commit

## Contexts read

`.claude/skills/using-ddc/SKILL.md`; plan header, Global Constraints, Tasks 1–2; spec §3 and §16.1;
`.contexts/engineering/stacks/runtime/node@26.md`, `stacks/language/typescript@7.md`,
`processes/git.md` §20, `stacks/testing/vitest.md`, `rules/development.md`, `MEMORY.md`,
`decisions/0004-latest-stable-baseline-and-documented-exceptions.md`.

## Toolchain (measured)

- node v26.10.0, pnpm 12.6.0 (portable install on PATH)
- rustc 1.95.0 (plan asks for ≥ 1.98.1; this only matters for Task 10, and the user needs to upgrade before then)

## Versions (`npm view <pkg> version`, 2026-09-29)

| Package | latest | Pinned | Note |
|---|---|---|---|
| turbo | 2.11.5 | 2.11.5 | |
| typescript | 7.0.2 | 7.0.2 | |
| @typescript/typescript6 | 6.0.2 | 6.0.2 | E2, injected by `.pnpmfile.cjs` |
| eslint | 10.11.0 | **9.39.5** | E3 |
| @eslint/js | 10.0.1 | **9.39.5** | matches the ESLint 9 line (E3) |
| typescript-eslint | 8.71.0 | 8.71.0 | peer `typescript <6.1.0` (E2) |
| eslint-plugin-boundaries | 7.2.0 | 7.2.0 | |
| eslint-import-resolver-typescript | 4.4.5 | 4.4.5 | resolves `.ts` and workspace packages for boundaries |
| vitest | 5.0.2 | 5.0.2 | |
| zod | 4.6.5 | 4.6.5 | catalog only (used from Task 3) |
| @types/node | 26.6.3 | 26.6.3 | |

All of them live in the `catalog:` of `app/pnpm-workspace.yaml`.

## Task 1: what was created

`app/.nvmrc` (26.10.0), `app/package.json` (`@core/workspace`, private, ESM, `packageManager: pnpm@12.6.0`,
`engines.node >=26.0.0 <27`, scripts `dev|build|lint|typecheck|test|test:e2e|contracts:catalog|contracts:check|seed:local` → `turbo run`),
`app/pnpm-workspace.yaml` (`apps/*`, `packages/*`, `modules/*`, catalog, `engineStrict`, `savePrefix: ""`),
`app/turbo.json`, `app/.pnpmfile.cjs` (TS 6 API hook), `app/.npmrc`, `app/.gitignore`, `app/README.md`.

## Task 2: what was created

`app/packages/config` (`@core/config`):

- `tsconfig/base.json`: canonical flags from `typescript@7.md`. `paths`, `include` and `tsBuildInfoFile` are left to consumers because they resolve relative to the file that declares them.
- `tsconfig/bundler.json`: `preserve` + `bundler` + DOM + `noEmit` (Next/Vite).
- `tsconfig/nodenext.json`: `nodenext` + `rewriteRelativeImportExtensions` + declarations (libraries/Functions).
- `eslint/boundaries.js`: `createBoundariesConfig({ rootPath? })`, `ELEMENTS`, `DEPENDENCY_POLICIES`, `WORKSPACE_ROOT`.
  Elements `app`, `client`, `contracts`, `services`, `agents`, `i18n`, `module` (`partialMatch: false`, relative to `boundaries/root-path` = `app/`, so linting from inside any package works). Default `disallow` with these policies:
  - app → same app, client, contracts, services, agents, i18n, module (apps compose; one app never imports another)
  - client → client, contracts, i18n
  - services → services, contracts
  - agents → agents, contracts, services only at `src/index.ts` or `src/**/application/use-cases/**`
  - contracts → contracts; i18n → i18n
  - module → same module, client, contracts, i18n, agents, services (use cases/entry only); the core never imports a module (spec D6)
- `eslint/index.js`: `createCoreConfig({ tsconfigRootDir, rootPath? })` = ignores + `@eslint/js` recommended + `typescript-eslint` `recommendedTypeChecked` (`projectService`) + the minimum rules from `typescript@7.md` + `eqeqeq`, `no-console` + boundaries. Re-exports the boundaries API.
- `vitest/preset.ts`: `coreVitestConfig` and `defineCoreVitestConfig(overrides)` (node env, `globals: false`, colocated tests, v8 coverage thresholds from `vitest.md`).
- Package scripts `lint` (`eslint .`), `typecheck` (`tsc --noEmit`, `checkJs` over the JS config files), `test` (`vitest run`).

How future packages use it: `tsconfig.json` → `"extends": "@core/config/tsconfig/nodenext.json"` (or `bundler.json`);
`eslint.config.js` → `export default createCoreConfig({ tsconfigRootDir: import.meta.dirname })` from `@core/config/eslint`;
`vitest.config.ts` → `defineCoreVitestConfig({...})` from `@core/config/vitest`.

### TDD

1. Wrote `eslint/boundaries.test.ts` and fixtures (`eslint/fixtures/packages/{client,services,contracts}/src`).
2. Red: `pnpm test` → `Cannot find module './boundaries.js'`, 1 file failed.
3. Implemented `boundaries.js`. Green: 2 passed.
4. Extra manual check (scratch workspace, not committed): agents → services internal file ✗, agents → use case / entry ✓, services → client ✗, contracts → services ✗, client → module ✗, app → other app ✗, module → other module ✗, same-app and same-module imports ✓, app → client ✓.
5. Type-aware lint confirmed: a temporary file with a floating promise was reported by `@typescript-eslint/no-floating-promises`.

## Verify output

```
$ cd app && pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped
Done in 185ms using pnpm v12.6.0

$ pnpm turbo run lint --dry-run
Tasks to Run
@core/config#lint            (no error)

$ pnpm -F @core/config test
 Test Files  1 passed (1)
      Tests  2 passed (2)

$ pnpm -F @core/config typecheck
$ tsc --noEmit               (exit 0)

$ pnpm turbo run lint typecheck test
 Tasks:    3 successful, 3 total

$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

TS 6 hook check: `node_modules/.pnpm/@typescript-eslint+typescript-estree*/node_modules/typescript` → `@typescript/typescript6@6.0.2`; the root `typescript` is 7.0.2. The lockfile records `pnpmfileChecksum`.

## Deviations and notes

- **Commit scope:** `workspace` instead of `app` for Task 1 (the commits rule forbids `app`), as the brief requires.
- **`app/AGENTS.md`:** turbo 2.11.5 writes a managed "turborepo-agent-rules" block when it detects an AI agent, and its text asks for the file to stay committed. It was committed with Task 1. To opt out, set `"agentGuidance": false` in `turbo.json`. That decision belongs to the owner.
- **`.nvmrc`:** `26.10.0`, as the plan says. `node@26.md` suggests `26`; the plan's exact pin wins for this boilerplate.
- **Shared versions:** they use the pnpm `catalog:`, as the plan requires, rather than `pnpm.overrides` from `git.md` §20.
- **pnpm settings:** they live in `pnpm-workspace.yaml`. `.npmrc` keeps only the registry, because pnpm 12 reads workspace settings from the YAML file.
- **Blocked build script:** pnpm 12 blocks build scripts by default (`ERR_PNPM_IGNORED_BUILDS`). `allowBuilds: { unrs-resolver: false }` was set because pnpm already installs its native binding through the optional platform package. pnpm had also inserted a placeholder `allowBuilds` key into the file, which was removed.
- **`.pnpmfile.cjs`:** the `NEEDS_TS6_API` set lists the full `@typescript-eslint/*` family, `typescript-eslint` and `ts-api-utils`, on top of the doc's examples. The doc allows extending it (`/* … */`).
- **`packages/config` JS files:** the ESLint config is `.js` because the plan names `eslint/index.js` and ESLint 9 loads JS configs natively. It is typed with JSDoc and checked by `tsc` (`checkJs`).
- **Plugin type cast:** one JSDoc cast of `eslint-plugin-boundaries` to `ESLint.Plugin`. The plugin's shipped type does not structurally match ESLint 9's type, and the cast is commented.
- **`agents` → `services`:** the use-case restriction is path-based (`src/index.ts` or `application/use-cases/**`).
- **Provisional policies:** the `module` and `i18n` policies are not spelled out in spec §3 and should be revisited when `defineModule()` (SP2) and `packages/i18n` land.
- **Not yet tested:** boundaries across bare workspace specifiers (`@core/services`) depend on the TS resolver following pnpm symlinks to `packages/*`. No real package exists yet to test this, so Task 3 or later should add a check.
- **Rust:** local toolchain is 1.95.0, below the 1.98.1 the plan sets. This blocks nothing in Tasks 1–2, but the user needs to upgrade before Task 10.

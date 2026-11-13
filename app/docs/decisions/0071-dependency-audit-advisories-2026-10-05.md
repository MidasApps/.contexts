# 0071. Dependency audit advisories (2026-10-05): pin three, accept two without a fix

- **Status:** accepted
- **Date:** 2026-10-05
- **Scope:** `app/pnpm-workspace.yaml` (`overrides`, `auditConfig.ignoreGhsas`); refines decision 0010, the framework is unchanged
- **Re-check:** 2027-01-05, or earlier when `@wdio/*`, `firebase-tools`, `@mastra/deployer` or the ESLint plugins are bumped

## Context

The first GitHub CI run of the branch (PR #2) failed `pnpm audit --audit-level high` with 6 high advisories. All of them were published after the local audits of decision 0010:

| Advisory | Package | Installed | Patched | Reached through |
|---|---|---|---|---|
| GHSA-m9gg-hp2v-232j | `@grpc/grpc-js` | 1.9.16 | ≥ 1.13.6 | `firebase > @firebase/firestore` (client and services) |
| GHSA-c475-qrg2-pj4r | `basic-ftp` | 5.3.1 | ≥ 6.2.1 | `proxy-agent > pac-proxy-agent > get-uri` (`firebase-tools`, `@wdio`) |
| GHSA-5c6j-r48x-rmvq | `serialize-javascript` | 6.0.2 | ≥ 7.0.3 | `@wdio/mocha-framework > mocha` (desktop native tests) |
| GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3 | `extract-zip` | 2.0.1 | none | `@wdio > @puppeteer/browsers` (desktop native tests) |
| GHSA-vfj7-8cjw-p6xm | `braces` | 3.0.3 | none | `micromatch`/`chokidar` in ESLint plugins, `firebase-tools` and `@mastra/deployer` |

## Decision

- **Pin the three that have a fix,** scoped to the parent that pulls the old version: `@firebase/firestore>@grpc/grpc-js` 1.14.5 (the version `firebase-admin` already uses), `get-uri>basic-ftp` 6.2.1 and `mocha>serialize-javascript` 7.0.3. Each is older than pnpm's minimum release age.
- **Ignore the two without a fix** in `auditConfig.ignoreGhsas`. Both are reached only from dev and build tooling. `extract-zip` unpacks browser downloads for the desktop native tests. `braces` expands glob patterns written in our own lint config, the Firebase CLI and the Mastra build. No deployed artifact contains them, and none of them receives external input.

## Consequences

- `pnpm audit --audit-level high` passes. The Mastra output still runs its own `pnpm audit --prod` with the same overrides.
- Each override is removed once its parent depends on the patched version. Each ignore is removed once a patched release exists.

## Addendum (2026-10-06): `source-map-js`

GHSA-68fv-2mgg-jv7q (high, `source-map-js` < 1.2.2, event-loop denial of service from crafted source maps) was published after this decision and failed the audit in CI and the Mastra output audit. It is reached through about 100 paths (`postcss`, `css-tree`, ...), so the override is global, `source-map-js: 1.2.2`, instead of scoped to one parent. 1.2.2 was published on 2026-09-30, inside pnpm's minimum release age, so it is admitted in `minimumReleaseAgeExclude` until 2026-10-07, like the Next 16.3.7 security release. Drop the override once `postcss` and `css-tree` depend on 1.2.2 or later.

## Addendum (2026-11-13): Next.js 16.4, Vite, Zod, the MCP SDK and the transitive advisories

Advisories published after the addenda above fail `pnpm audit --audit-level high` in CI, `main` included, two of them critical. All of them have a patched release, so each is pinned, not ignored:

| Advisory | Package | Installed | Patched | Change |
|---|---|---|---|---|
| GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr (critical), GHSA-p3m5-59mp-jv5r | `next` | 16.3.8 | ≥ 16.4.1 | catalog `next` and `@next/eslint-plugin-next` to 16.4.6; override `inngest>next` follows |
| GHSA-587h-7wmj-h5pm | `vite` | 8.3.1 | ≥ 8.3.3 | catalog `vite` to 8.3.8 |
| GHSA-mrhx-c7xc-m3w5 | `zod` | 4.6.5, and 3.25.76 through `firecrawl` | ≥ 4.6.6 (no 3.x fix) | catalog `zod` to 4.6.7; catalog `firecrawl` to 4.54.0, which accepts `zod ^4.6.6` and pins `axios` 1.20.0, so the `firecrawl>axios` override goes |
| GHSA-jm63-cq47-j5jp, GHSA-46jr-4wx8-v453 | `@modelcontextprotocol/server` | 2.2.0 | ≥ 2.3.0 | the three `@mastra/mcp>@modelcontextprotocol/*` overrides to 2.3.1 |
| GHSA-f897-62hf-6gxq | `@modelcontextprotocol/node` | 2.0.0 | ≥ 2.1.0 | new override `@mastra/mcp>@modelcontextprotocol/node` 2.1.1 (2.1.2 peers server ^2.4.0) |
| GHSA-22jm-h49p-29qw, GHSA-46jr-4wx8-v453 | `@modelcontextprotocol/sdk` | 1.31.0 | ≥ 1.32.0 | override `firebase-tools>@modelcontextprotocol/sdk` 1.32.1 |
| GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c, GHSA-mrwp-f3q8-3g9p | `follow-redirects` | 1.16.0 | ≥ 1.16.2 | override `axios>follow-redirects` 1.16.3 |
| GHSA-xjj6-f33q-929c, GHSA-4w7w-5xrc-9h26, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm | `undici` | 6.29.0, 7.30.0, 8.11.2 | 6.29.1, 7.30.1, 8.12.2 | lockfile refreshed inside the parents' ranges (`pnpm update -r`) |
| GHSA-27r3-jxmh-p828 | `body-parser` | 1.20.8, 2.3.0 | 1.20.9, 2.4.0 | same |
| GHSA-97r2-qh9m-474h, GHSA-wp97-x4hv-qvhp, GHSA-7rv5-mrxv-xcr9 | `seroval` | 1.6.7 | ≥ 1.6.8 | same |
| GHSA-gg6h-894w-4m9c | `re2js` | 2.8.6 | ≥ 2.8.7 | same |
| GHSA-3f7j-7jwc-fxfj | `systeminformation` | 5.33.14 | ≥ 5.33.16 | same |

Next.js has no 16.3 backport, so the web app moves to the 16.4 minor. Each version is the newest one past pnpm's minimum release age, so `minimumReleaseAgeExclude` does not change. The framework's pins in `.contexts/engineering/MEMORY.md` (Next.js 16.3.6, "16.4 is canary"; Zod 4.6.5; the measured Vite 8.3.1) are now behind the catalog; updating them belongs to the framework, not to this decision.

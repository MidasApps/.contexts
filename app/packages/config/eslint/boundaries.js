import { createRequire } from "node:module";
import path from "node:path";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

/** Workspace root (`app/`), resolved from this file so every package agrees on it. */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../..");

// eslint-module-utils loads resolvers by module path; passing the absolute path
// avoids depending on pnpm hoisting the resolver next to each consumer.
const TYPESCRIPT_RESOLVER = createRequire(import.meta.url).resolve(
  "eslint-import-resolver-typescript",
);

/** Element types of spec §3; patterns are relative to the workspace root. */
export const ELEMENTS = [
  { type: "app", pattern: "apps/*", capture: ["name"], partialMatch: false },
  { type: "client", pattern: "packages/client", partialMatch: false },
  { type: "contracts", pattern: "packages/contracts", partialMatch: false },
  { type: "services", pattern: "packages/services", partialMatch: false },
  { type: "agents", pattern: "packages/agents", partialMatch: false },
  { type: "i18n", pattern: "packages/i18n", partialMatch: false },
  // Shared Playwright harness (SP2 Tasks 22-23): used by the apps' e2e folders only.
  { type: "e2e", pattern: "packages/e2e", partialMatch: false },
  { type: "module", pattern: "modules/*", capture: ["name"], partialMatch: false },
];

/** @param {string} type */
const to = (type) => ({ to: { element: { type } } });
/** @param {string} type */
const sameCaptured = (type) => ({
  to: { element: { type, captured: { name: "{{ from.element.captured.name }}" } } },
});

// Agents reach services only through use cases; the package entry point is
// accepted until services exposes per-use-case entries.
const SERVICES_USE_CASE_ENTRY = {
  to: {
    element: {
      type: "services",
      fileInternalPath: ["src/index.ts", "src/**/application/use-cases/**"],
    },
  },
};

/** @param {string} type */
const allowSelf = (type) => ({ from: { element: { type } }, allow: to(type) });

/** Spec §3 import boundaries; anything not allowed here is a violation. */
export const DEPENDENCY_POLICIES = [
  // apps only compose: they may import every package and module, never each other.
  {
    from: { element: { type: "app" } },
    allow: [
      sameCaptured("app"),
      ...["client", "contracts", "services", "agents", "i18n", "module", "e2e"].map(to),
    ],
  },
  { from: { element: { type: "client" } }, allow: [to("client"), to("contracts"), to("i18n")] },
  // i18n is a leaf (it imports nothing of the workspace) and owns the supported locales (decision 0013);
  // services negotiates the locale of links it builds (decision 0030 A8).
  { from: { element: { type: "services" } }, allow: [to("services"), to("contracts"), to("i18n")] },
  {
    from: { element: { type: "agents" } },
    allow: [to("agents"), to("contracts"), SERVICES_USE_CASE_ENTRY],
  },
  allowSelf("contracts"),
  allowSelf("i18n"),
  // The harness drives the apps through the browser and HTTP only; it imports no app code.
  allowSelf("e2e"),
  // The core never imports a module (spec D6); a module builds on the core.
  {
    from: { element: { type: "module" } },
    allow: [
      sameCaptured("module"),
      to("client"),
      to("contracts"),
      to("i18n"),
      to("agents"),
      SERVICES_USE_CASE_ENTRY,
    ],
  },
];

/**
 * Flat config enforcing the workspace import boundaries.
 * @param {{ rootPath?: string }} [options] rootPath defaults to the workspace root.
 * @returns {import("eslint").Linter.Config[]}
 */
export const createBoundariesConfig = ({ rootPath = WORKSPACE_ROOT } = {}) => [
  {
    files: ["**/*.{ts,tsx,js,jsx,mts,cts}"],
    languageOptions: { parser: tseslint.parser },
    // The plugin ships its own Plugin type, which does not structurally match
    // ESLint 9 `ESLint.Plugin`; the runtime object is a valid flat-config plugin.
    plugins: { boundaries: /** @type {import("eslint").ESLint.Plugin} */ (boundaries) },
    settings: {
      "boundaries/root-path": rootPath,
      "boundaries/elements": ELEMENTS,
      "import/resolver": { [TYPESCRIPT_RESOLVER]: { alwaysTryTypes: true } },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        { default: "disallow", policies: DEPENDENCY_POLICIES },
      ],
    },
  },
];

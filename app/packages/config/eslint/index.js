import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { createBoundariesConfig } from "./boundaries.js";

export { createBoundariesConfig, DEPENDENCY_POLICIES, ELEMENTS, WORKSPACE_ROOT } from "./boundaries.js";

// `lib/**` is anchored to the package root: it is the Functions build output (`apps/functions/lib`),
// while source folders named `lib` (FSD `shared/lib`, `entities/*/lib`) are linted.
const IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "lib/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.tscache/**",
  "**/.mastra/**",
  "**/src-tauri/target/**",
  "**/eslint/fixtures/**",
];

// Size, complexity and import-depth guards (practices/ai-friendly-code.md "Métricas práticas";
// rules/development.md: no `../../../`, at most 3 nesting levels; decision 0068).
/** Imports that climb three or more folders: use the package alias (`#/`) instead. */
export const DEEP_RELATIVE_IMPORT = {
  regex: String.raw`^(\.\./){3,}`,
  message: "Import through the package alias (#/…) instead of climbing three or more folders (development.md).",
};

/** @type {import("eslint").Linter.RulesRecord} */
const SIZE_RULES = {
  "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
  "max-lines-per-function": ["error", { max: 100, skipBlankLines: true, skipComments: true }],
  complexity: ["error", 15],
  "max-depth": ["error", 3],
  "no-restricted-imports": ["error", { patterns: [DEEP_RELATIVE_IMPORT] }],
};

// A test file is a list of cases: its describe callback is as long as the cases it holds.
const TEST_FILES = ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/e2e/**", "**/testing/**", "**/*.fixture.{ts,tsx}"];
// A package entry point only re-exports its public API (development.md allows a minimal index).
const ENTRY_FILES = ["**/src/index.ts"];
// Fixtures stand in for code that lives elsewhere (a module beside the package), so they may climb.
const FIXTURE_FOLDERS = ["**/fixtures/**"];

// Minimum type-aware rules from .contexts/engineering/stacks/language/typescript@7.md.
/** @type {import("eslint").Linter.RulesRecord} */
const TYPE_AWARE_RULES = {
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/consistent-type-imports": "error",
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/prefer-as-const": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  eqeqeq: ["error", "always"],
  "no-console": "error",
};

/**
 * Shared flat config for every workspace package: ESLint recommended,
 * type-aware typescript-eslint (TS 6 API, ADR 0004 E2) and import boundaries.
 * @param {{ tsconfigRootDir: string, rootPath?: string }} options
 *   tsconfigRootDir is the consuming package directory (`import.meta.dirname`).
 * @returns {import("eslint").Linter.Config[]}
 */
export const createCoreConfig = ({ tsconfigRootDir, rootPath }) => [
  { ignores: IGNORES },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    rules: TYPE_AWARE_RULES,
  },
  { rules: SIZE_RULES },
  {
    files: TEST_FILES,
    rules: {
      "max-lines-per-function": "off",
      "max-lines": ["error", { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  { files: ENTRY_FILES, rules: { "max-lines": "off" } },
  { files: FIXTURE_FOLDERS, rules: { "no-restricted-imports": "off" } },
  ...createBoundariesConfig(rootPath === undefined ? {} : { rootPath }),
];

const REACT_FILES = ["**/*.{jsx,tsx}"];

/**
 * `createCoreConfig` plus React rules for UI packages and apps (SP2 spec §12):
 * eslint-plugin-react (recommended + JSX runtime), eslint-plugin-react-hooks
 * (recommended, includes the React Compiler rules) and eslint-plugin-jsx-a11y
 * (recommended). All three accept ESLint 9 (ADR 0004 E3).
 * @param {{ tsconfigRootDir: string, rootPath?: string }} options
 * @returns {import("eslint").Linter.Config[]}
 */
export const createReactConfig = (options) => [
  ...createCoreConfig(options),
  {
    ...react.configs.flat.recommended,
    files: REACT_FILES,
    settings: { react: { version: "detect" } },
  },
  { ...react.configs.flat["jsx-runtime"], files: REACT_FILES },
  { ...reactHooks.configs.flat.recommended, files: ["**/*.{ts,tsx}"] },
  { ...jsxA11y.flatConfigs.recommended, files: REACT_FILES },
  // Props are typed with TypeScript; runtime PropTypes are not used.
  { files: REACT_FILES, rules: { "react/prop-types": "off" } },
];

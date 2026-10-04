import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { createBoundariesConfig } from "./boundaries.js";

export { createBoundariesConfig, DEPENDENCY_POLICIES, ELEMENTS, WORKSPACE_ROOT } from "./boundaries.js";

// `lib/**` is anchored to the package root: it is the Functions build output (`apps/functions/lib`),
// while source folders named `lib` (FSD `shared/lib`, `entities/*/lib`) are linted.
const IGNORES = ["**/node_modules/**", "**/dist/**", "lib/**", "**/.next/**", "**/.turbo/**", "**/.tscache/**", "**/.mastra/**", "**/src-tauri/target/**", "**/eslint/fixtures/**"];

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

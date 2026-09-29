import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { createBoundariesConfig } from "./boundaries.js";

export { createBoundariesConfig, DEPENDENCY_POLICIES, ELEMENTS, WORKSPACE_ROOT } from "./boundaries.js";

const IGNORES = ["**/node_modules/**", "**/dist/**", "**/lib/**", "**/.next/**", "**/.turbo/**", "**/.tscache/**", "**/.mastra/**", "**/src-tauri/target/**", "**/eslint/fixtures/**"];

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

// TS 7 has no programmatic API yet (ADR 0004 E2). Packages that import
// `typescript` as a library get the TS 6 API instead, while `tsc` stays on 7.
// Canonical hook: .contexts/engineering/stacks/language/typescript@7.md.
const NEEDS_TS6_API = new Set([
  "@typescript-eslint/parser",
  "@typescript-eslint/typescript-estree",
  "@typescript-eslint/type-utils",
  "@typescript-eslint/utils",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/project-service",
  "@typescript-eslint/tsconfig-utils",
  "typescript-eslint",
  "ts-api-utils",
  "typescript-paths",
]);
const TS6_API = "npm:@typescript/typescript6@6.0.2";

const readPackage = (pkg) => {
  if (NEEDS_TS6_API.has(pkg.name) && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: TS6_API };
  }
  return pkg;
};

module.exports = { hooks: { readPackage } };

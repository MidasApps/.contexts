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

// firebase-tools 15.32.0 depends on superstatic ^10, whose engines stop at
// Node 24 (superstatic 11 adds 26 but firebase-tools does not accept it yet).
// superstatic only serves the Hosting emulator, which this workspace does not
// run, so its engines are widened instead of lifting engineStrict for all.
const WIDEN_ENGINES = new Map([["superstatic@10", "20 || 22 || 24 || 26"]]);

const widenEngines = (pkg) => {
  const node = WIDEN_ENGINES.get(`${pkg.name}@${pkg.version?.split(".")[0]}`);
  if (node) pkg.engines = { ...pkg.engines, node };
};

const readPackage = (pkg) => {
  if (NEEDS_TS6_API.has(pkg.name) && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: TS6_API };
  }
  widenEngines(pkg);
  return pkg;
};

module.exports = { hooks: { readPackage } };

// `pnpm contracts:check` (CI gate): regenerates the catalog in memory and fails on
// drift (components and paths), missing field meta, dangling relations or
// `$ref`s, or raw (non `x-*`) meta keys.
import { stdout } from "node:process";
import { composeCoreContracts, composeCoreEndpoints } from "../src/composition.ts";
import { readGeneratedFiles } from "./catalog/artifact-files.ts";
import { buildCatalogArtifacts } from "./catalog/artifacts.ts";
import { loadModuleContracts, loadModuleEndpoints } from "./catalog/module-contracts.ts";
import { findContractProblems, findDanglingRefsInArtifacts, findRawMetaInArtifacts } from "./catalog/contract-problems.ts";
import { findCatalogDrift } from "./catalog/drift.ts";

const main = async (): Promise<number> => {
  // Core contracts and endpoints plus those of the modules listed in app/catalog.modules.ts (decision 0015).
  const contracts = composeCoreContracts(await loadModuleContracts()).listContracts();
  const endpoints = composeCoreEndpoints(await loadModuleEndpoints()).list();
  const expected = buildCatalogArtifacts(contracts, endpoints);
  const onDisk = await readGeneratedFiles();
  const problems = [
    ...findContractProblems(contracts),
    ...findRawMetaInArtifacts(expected),
    ...findDanglingRefsInArtifacts(expected),
    ...findCatalogDrift({ expected, onDisk }),
  ];
  if (problems.length === 0) {
    stdout.write(`contracts:check ok (${contracts.length} contracts, ${endpoints.length} endpoints, ${expected.length} files)\n`);
    return 0;
  }
  stdout.write(
    `contracts:check failed; run \`pnpm contracts:catalog\` and commit the result:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`,
  );
  return 1;
};

process.exitCode = await main();

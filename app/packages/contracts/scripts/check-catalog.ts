// `pnpm contracts:check` (CI gate): regenerates the catalog in memory and fails on
// drift, missing field meta, dangling relations or raw (non `x-*`) meta keys.
import { stdout } from "node:process";
import { listContracts } from "../src/index.ts";
import { readGeneratedFiles } from "./catalog/artifact-files.ts";
import { buildCatalogArtifacts } from "./catalog/artifacts.ts";
import { findContractProblems, findRawMetaInArtifacts } from "./catalog/contract-problems.ts";
import { findCatalogDrift } from "./catalog/drift.ts";

const main = async (): Promise<number> => {
  const contracts = listContracts();
  const expected = buildCatalogArtifacts(contracts);
  const onDisk = await readGeneratedFiles();
  const problems = [
    ...findContractProblems(contracts),
    ...findRawMetaInArtifacts(expected),
    ...findCatalogDrift({ expected, onDisk }),
  ];
  if (problems.length === 0) {
    stdout.write(`contracts:check ok (${contracts.length} contracts, ${expected.length} files)\n`);
    return 0;
  }
  stdout.write(
    `contracts:check failed; run \`pnpm contracts:catalog\` and commit the result:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`,
  );
  return 1;
};

process.exitCode = await main();

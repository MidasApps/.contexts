// `pnpm contracts:catalog`: regenerates docs/catalog/** and docs/openapi/v1.yaml.
// Runs on Node 26 native type stripping (`node scripts/build-catalog.ts`).
import { stdout } from "node:process";
import { composeCoreContracts } from "../src/composition.ts";
import { writeArtifacts } from "./catalog/artifact-files.ts";
import { buildCatalogArtifacts } from "./catalog/artifacts.ts";
import { findContractProblems } from "./catalog/contract-problems.ts";

const main = async (): Promise<number> => {
  const contracts = composeCoreContracts().listContracts();
  const problems = findContractProblems(contracts);
  if (problems.length > 0) {
    stdout.write(`contracts:catalog failed:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`);
    return 1;
  }
  const artifacts = buildCatalogArtifacts(contracts);
  await writeArtifacts(artifacts);
  stdout.write(`contracts:catalog wrote ${artifacts.length} files for ${contracts.length} contracts\n`);
  return 0;
};

process.exitCode = await main();

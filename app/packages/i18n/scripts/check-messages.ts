// `pnpm i18n:check` (CI gate, decision 0013): key and placeholder parity with pt-BR, valid ICU and
// no empty values, for the core catalogs and every module catalog under app/modules.
import path from "node:path";
import { stdout } from "node:process";
import { SOURCE_LOCALE, SUPPORTED_LOCALES } from "../src/locales.ts";
import { checkCatalogs } from "./messages/check-catalogs.ts";
import { readCoreCatalogs, readModuleCatalogs } from "./messages/read-catalogs.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const MODULES_DIR = path.resolve(PACKAGE_ROOT, "../../modules");

const main = async (): Promise<number> => {
  const [core, modules] = await Promise.all([
    readCoreCatalogs(path.join(PACKAGE_ROOT, "src", "messages")),
    readModuleCatalogs(MODULES_DIR),
  ]);
  const catalogs = [...core, ...modules];
  const problems = checkCatalogs(catalogs, { supportedLocales: SUPPORTED_LOCALES, sourceLocale: SOURCE_LOCALE });
  if (problems.length === 0) {
    const namespaces = new Set(catalogs.map((catalog) => catalog.namespace)).size;
    stdout.write(`i18n:check ok (${namespaces} namespaces, ${catalogs.length} catalogs)\n`);
    return 0;
  }
  stdout.write(`i18n:check failed:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`);
  return 1;
};

process.exitCode = await main();

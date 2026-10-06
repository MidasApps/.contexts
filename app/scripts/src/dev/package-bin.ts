import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type BinManifest = { bin?: string | Record<string, string> };

/**
 * Absolute path of a dependency's JS bin, resolved from `fromDir`. Running it with
 * `process.execPath` avoids the `.cmd` shims pnpm writes on Windows, which would
 * need `shell: true` (and its quoting rules) to spawn.
 *
 * @throws {Error} when the package is not installed or declares no such bin.
 */
export const resolvePackageBin = (args: { fromDir: string; packageName: string; binName: string }): string => {
  const require = createRequire(path.join(args.fromDir, "package.json"));
  const manifestPath = require.resolve(`${args.packageName}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BinManifest;
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[args.binName];
  if (bin === undefined) throw new Error(`${args.packageName} has no "${args.binName}" bin`);
  return path.resolve(path.dirname(manifestPath), bin);
};

/**
 * Builds the deployable Functions source in `lib/` (firebase.json
 * `functions.source`). Firebase deploy uploads that folder and runs `npm
 * install` on its package.json in Cloud Build, and npm understands neither
 * pnpm's `workspace:` nor `catalog:` protocols. So:
 * 1. esbuild bundles `src/index.ts` with every workspace package and other
 *    devDependency inlined; only `dependencies` stay external.
 * 2. `lib/package.json` lists those externals at the exact versions pnpm
 *    installed from the catalog.
 * 3. `lib/node_modules` links to this package's node_modules, so local deploy
 *    analysis and the emulator resolve the SDK and its binary. Firebase never
 *    uploads node_modules.
 * `--watch` (the `dev` script, started by app/scripts/dev.ts after one full
 * build) only rebuilds `lib/index.js` in place: the emulator watches `lib/` and
 * reloads, and a clean rebuild would pull the folder from under it.
 * See docs/plans/2026-09-29-sp0-app-foundation/reports/task-9.md.
 */
import { build, context, type BuildOptions } from "esbuild";
import { mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

type Manifest = { name: string; version?: string; dependencies?: Record<string, string> };

const PACKAGE_DIR = import.meta.dirname;
const OUT_DIR = path.join(PACKAGE_DIR, "lib");
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
// Deploy runtime is nodejs24 (ADR 0004 E1); firebase.json `runtime` is the source of truth.
const DEPLOY_NODE_MAJOR = "24";

const readManifest = async (file: string): Promise<Manifest> => JSON.parse(await readFile(file, "utf8")) as Manifest;

/** Exact version pnpm installed for each runtime dependency (the catalog pin). */
const resolveInstalledVersions = async (names: string[]): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    names.map(async (name) => {
      const { version = "" } = await readManifest(path.join(PACKAGE_DIR, "node_modules", name, "package.json"));
      if (!EXACT_VERSION.test(version)) throw new Error(`${name}: expected an exact version, got ${version}`);
      return [name, version] as const;
    }),
  );
  return Object.fromEntries(entries);
};

const bundleOptions = (externals: string[]): BuildOptions => ({
  entryPoints: [path.join(PACKAGE_DIR, "src/index.ts")],
  outfile: path.join(OUT_DIR, "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: `node${DEPLOY_NODE_MAJOR}`,
  sourcemap: true,
  external: externals.flatMap((name) => [name, `${name}/*`]),
  logLevel: "warning",
});

const bundle = async (externals: string[]): Promise<void> => {
  await build(bundleOptions(externals));
};

/** Rebuilds `lib/index.js` on every source change; runs until the process is stopped. */
const watchBundle = async (externals: string[]): Promise<void> => {
  const ctx = await context({ ...bundleOptions(externals), logLevel: "info" });
  await ctx.watch();
};

const writeDeployManifest = async (source: Manifest, dependencies: Record<string, string>): Promise<void> => {
  const manifest = {
    name: source.name.replace(/^@[^/]+\//, "core-"),
    private: true,
    type: "module",
    main: "index.js",
    engines: { node: DEPLOY_NODE_MAJOR },
    dependencies,
  };
  await writeFile(path.join(OUT_DIR, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
};

const main = async (): Promise<void> => {
  const source = await readManifest(path.join(PACKAGE_DIR, "package.json"));
  const externals = Object.keys(source.dependencies ?? {});
  if (process.argv.includes("--watch")) {
    await watchBundle(externals);
    return;
  }
  const versions = await resolveInstalledVersions(externals);
  // Unlink first so the recursive delete can never walk into the linked node_modules.
  await unlink(path.join(OUT_DIR, "node_modules")).catch(() => undefined);
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  await bundle(externals);
  await writeDeployManifest(source, versions);
  // "junction" needs no admin rights on Windows; other platforms ignore the type.
  await symlink(path.join(PACKAGE_DIR, "node_modules"), path.join(OUT_DIR, "node_modules"), "junction");
};

await main();

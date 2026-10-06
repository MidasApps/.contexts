import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogArtifact } from "./artifacts.ts";

/** `app/`: artifact paths are relative to the workspace root. */
export const WORKSPACE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Directories fully owned by the generator: anything else inside them is stale. */
export const GENERATED_DIRS = ["docs/catalog", "docs/openapi"] as const;

const toPosix = (path: string): string => path.split(sep).join("/");

const listFilesUnder = async (root: string, directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(join(root, directory), { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => toPosix(relative(root, join(entry.parentPath, entry.name))));
  } catch (error: unknown) {
    // A directory that does not exist yet simply has no files.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
};

/** Reads every file currently under the generated directories. */
export const readGeneratedFiles = async (root: string = WORKSPACE_ROOT): Promise<Map<string, string>> => {
  const paths = (await Promise.all(GENERATED_DIRS.map((directory) => listFilesUnder(root, directory)))).flat();
  const contents = await Promise.all(paths.map((path) => readFile(join(root, path), "utf8")));
  return new Map(paths.map((path, index) => [path, contents[index] ?? ""]));
};

/** Replaces the generated directories with exactly these artifacts. */
export const writeArtifacts = async (
  artifacts: readonly CatalogArtifact[],
  root: string = WORKSPACE_ROOT,
): Promise<void> => {
  await Promise.all(GENERATED_DIRS.map((directory) => rm(join(root, directory), { recursive: true, force: true })));
  for (const artifact of artifacts) {
    const target = join(root, artifact.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, artifact.content, "utf8");
  }
};

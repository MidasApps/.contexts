import type { CatalogArtifact } from "./artifacts.ts";

// Git may check files out with CRLF on Windows; content is compared with LF.
const normalizeLineEndings = (text: string): string => text.replaceAll("\r\n", "\n");

/**
 * Differences between freshly generated artifacts and files on disk.
 * `onDisk` holds every file currently under the generated directories.
 */
export const findCatalogDrift = (args: {
  expected: readonly CatalogArtifact[];
  onDisk: ReadonlyMap<string, string>;
}): string[] => {
  const expectedPaths = new Set(args.expected.map((artifact) => artifact.path));
  const problems = args.expected.flatMap((artifact) => {
    const current = args.onDisk.get(artifact.path);
    if (current === undefined) return [`missing: ${artifact.path}`];
    return normalizeLineEndings(current) === artifact.content ? [] : [`changed: ${artifact.path}`];
  });
  const stale = [...args.onDisk.keys()].filter((path) => !expectedPaths.has(path)).sort();
  return [...problems, ...stale.map((path) => `stale: ${path}`)];
};

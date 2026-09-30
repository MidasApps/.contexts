/**
 * Pin check of the `mastra build` output (SP0 follow-up #2, decision 0023 D3-20). The deployer
 * runs its own `pnpm install` in `.mastra/output`, which resolves versions afresh instead of
 * reading the workspace lockfile. This compares the two lockfiles: every package both of
 * them contain must resolve, in the output, only to versions the workspace lockfile has.
 * Packages only the output has (none in practice) are left to the audit.
 */

/** A shared package whose output versions are not all in the workspace lockfile. */
export type PinDrift = { readonly name: string; readonly output: readonly string[]; readonly workspace: readonly string[] };

// `  name@version:` or `  '@scope/name@version':` directly under `packages:` (pnpm lockfile v9).
const PACKAGE_KEY = /^ {2}'?((?:@[^@/\s']+\/)?[^@\s']+)@([^(':\s]+)'?:/;

/** Versions per package name in the `packages:` section of a pnpm v9 lockfile. */
export const lockfileVersions = (lockfile: string): ReadonlyMap<string, ReadonlySet<string>> => {
  const versions = new Map<string, Set<string>>();
  let inPackages = false;
  for (const line of lockfile.split(/\r?\n/)) {
    if (/^\S/.test(line)) inPackages = line.startsWith("packages:");
    if (!inPackages) continue;
    const match = PACKAGE_KEY.exec(line);
    if (match?.[1] === undefined || match[2] === undefined || match[2].startsWith("file:")) continue;
    const known = versions.get(match[1]) ?? new Set<string>();
    known.add(match[2]);
    versions.set(match[1], known);
  }
  return versions;
};

/** Shared packages the output resolved to versions the workspace lockfile does not have, by name. */
export const findPinDrift = (args: { readonly workspaceLock: string; readonly outputLock: string }): PinDrift[] => {
  const workspace = lockfileVersions(args.workspaceLock);
  const output = lockfileVersions(args.outputLock);
  const drift: PinDrift[] = [];
  for (const [name, versions] of output) {
    const pinned = workspace.get(name);
    if (pinned === undefined) continue;
    const extra = [...versions].filter((version) => !pinned.has(version));
    if (extra.length > 0) drift.push({ name, output: extra.sort(), workspace: [...pinned].sort() });
  }
  return drift.sort((left, right) => left.name.localeCompare(right.name));
};

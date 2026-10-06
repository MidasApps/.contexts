import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Package files the agents read at runtime that `mastra build` cannot inline: copied from the
 * package (`source`, relative to `apps/mastra`) into `public/` (`target`) before the build, and
 * served from `<output>/<bundled>` next to the bundle (`loadInstructions`, `loadSkill`,
 * `EVALS_DIR`). The copies are generated and gitignored; the package folders stay the source.
 */
export type AgentAsset = { readonly source: string; readonly target: string; readonly bundled: string };

export const AGENT_ASSETS: readonly AgentAsset[] = [
  {
    source: "../../packages/agents/src/agents/instructions",
    target: "src/mastra/public/instructions",
    bundled: "instructions",
  },
  { source: "../../packages/agents/skills", target: "src/mastra/public/skills", bundled: "skills" },
  // Eval datasets and baselines of `POST /prompt-evals/:versionId` (decision 0038).
  { source: "../../packages/agents/evals", target: "src/mastra/public/evals", bundled: "evals" },
];

const filesUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    : [];

/**
 * Asset files of the sources missing from the build output, as `<bundled>/<relative path>`; an
 * asset whose source has no file at all is reported by its `bundled` name.
 * @param assets sources resolved against the current directory when relative.
 */
export const missingBundledAssets = (args: {
  readonly assets: readonly AgentAsset[];
  readonly outputDir: string;
}): string[] =>
  args.assets.flatMap((asset) => {
    const files = filesUnder(path.resolve(asset.source));
    if (files.length === 0) return [asset.bundled];
    return files
      .filter((file) => !existsSync(path.join(args.outputDir, asset.bundled, file)))
      .map((file) => path.join(asset.bundled, file));
  });

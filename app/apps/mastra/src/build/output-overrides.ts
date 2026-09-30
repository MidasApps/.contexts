import { parse, stringify } from "yaml";

const overridesOf = (yaml: string): Record<string, string> => {
  const document = parse(yaml) as { overrides?: Record<string, unknown> } | null;
  return Object.fromEntries(Object.entries(document?.overrides ?? {}).map(([name, version]) => [name, String(version)]));
};

/**
 * The deployer's nested `pnpm install` (`.mastra/output`) ignores the workspace `overrides`
 * (SP0 follow-up #2), so a security override such as `firecrawl>axios` would not reach the
 * image. This copies the workspace overrides into the output's `pnpm-workspace.yaml`; the
 * deployer's own entries (its workspace tarballs) win on a clash.
 * @returns the output YAML, unchanged when the workspace has no overrides.
 */
export const mergeWorkspaceOverrides = (args: { readonly workspaceYaml: string; readonly outputYaml: string }): string => {
  const workspace = overridesOf(args.workspaceYaml);
  if (Object.keys(workspace).length === 0) return args.outputYaml;
  const output = (parse(args.outputYaml) ?? {}) as Record<string, unknown>;
  return stringify({ ...output, overrides: { ...workspace, ...overridesOf(args.outputYaml) } });
};

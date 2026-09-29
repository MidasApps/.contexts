export interface CliArgs {
  email?: string;
  clientIds?: string[];
  role?: string;
  clear?: boolean;
  list?: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    if (arg === '--clear') out.clear = true;
    else if (arg === '--list') out.list = true;
    else if (arg.startsWith('--email=')) out.email = arg.slice('--email='.length);
    else if (arg.startsWith('--clientIds=')) {
      out.clientIds = arg.slice('--clientIds='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--clientId=')) {
      // Alias legado: preenche clientIds:[x] (ADR-0018 §4.3).
      out.clientIds = [arg.slice('--clientId='.length).trim()].filter(Boolean);
    } else if (arg.startsWith('--role=')) out.role = arg.slice('--role='.length);
  }
  return out;
}

export function mergeClaims(existing: Record<string, unknown>, args: CliArgs): Record<string, unknown> {
  const merged = { ...existing };
  if (args.clientIds && args.clientIds.length > 0) merged.clientIds = args.clientIds;
  if (args.role) merged.role = args.role;
  return merged;
}

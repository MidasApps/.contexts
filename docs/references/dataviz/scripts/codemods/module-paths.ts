import path from 'node:path';

/** Module specifier helpers shared by the file rename and the mock-factory rename. */

export const withoutExtension = (file: string): string => file.replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/, '');

const ALIASES: ReadonlyArray<readonly [string, string]> = [['@/', 'src'], ['@app/', 'app']];

export const resolveSpecifier = (specifier: string, importer: string, repoRoot: string): string | null => {
  if (specifier.startsWith('.')) return path.resolve(path.dirname(importer), specifier);
  const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix));
  return alias ? path.join(repoRoot, alias[1], specifier.slice(alias[0].length)) : null;
};

export const specifierFor = (target: string, importer: string, oldSpecifier: string, repoRoot: string): string => {
  const alias = ALIASES.find(([prefix]) => oldSpecifier.startsWith(prefix));
  if (alias) return `${alias[0]}${path.relative(path.join(repoRoot, alias[1]), target)}`;
  const relative = path.relative(path.dirname(importer), target);
  return relative.startsWith('.') ? relative : `./${relative}`;
};

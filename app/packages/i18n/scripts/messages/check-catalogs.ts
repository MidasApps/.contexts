import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

/** One catalog file: a namespace (`common`, a module id, …) in one locale. */
export type CatalogEntry = { namespace: string; locale: string; messages: unknown; file: string };

export type CheckOptions = { supportedLocales: readonly string[]; sourceLocale: string };

type Leaf = { key: string; value: unknown };

/** Flattens a message tree to dotted keys; non-object leaves are returned as-is for type checks. */
const flatten = (tree: unknown, prefix = ""): Leaf[] => {
  if (typeof tree !== "object" || tree === null || Array.isArray(tree)) return [{ key: prefix, value: tree }];
  return Object.entries(tree).flatMap(([key, value]) => flatten(value, prefix === "" ? key : `${prefix}.${key}`));
};

/** Argument names used by an ICU message, including those nested in plural/select branches and tags. */
const collectArguments = (elements: readonly MessageFormatElement[], names = new Set<string>()): Set<string> => {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    names.add(element.value);
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const option of Object.values(element.options)) collectArguments(option.value, names);
    }
    if (element.type === TYPE.tag) collectArguments(element.children, names);
  }
  return names;
};

type Parsed = { ok: true; args: string } | { ok: false; reason: string };

const parseMessage = (message: string): Parsed => {
  try {
    return { ok: true, args: [...collectArguments(parse(message))].sort().map((name) => `{${name}}`).join(" ") };
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
};

const checkLeaves = (entry: CatalogEntry, sourceArgs: ReadonlyMap<string, string> | undefined, sourceLocale: string): string[] => {
  const label = `${entry.namespace}/${entry.locale}`;
  const problems: string[] = [];
  for (const { key, value } of flatten(entry.messages)) {
    if (typeof value !== "string") problems.push(`${label}: ${key} is not a string`);
    else if (value.trim() === "") problems.push(`${label}: ${key} is empty`);
    else {
      const parsed = parseMessage(value);
      if (!parsed.ok) problems.push(`${label}: ${key} is not valid ICU (${parsed.reason})`);
      else if (sourceArgs?.has(key) === true && sourceArgs.get(key) !== parsed.args) {
        problems.push(`${label}: ${key} placeholders ${parsed.args || "(none)"} differ from ${sourceLocale} ${sourceArgs.get(key) || "(none)"}`);
      }
    }
  }
  return problems;
};

const sourceArguments = (source: CatalogEntry): Map<string, string> =>
  new Map(
    flatten(source.messages).flatMap(({ key, value }) => {
      const parsed = typeof value === "string" ? parseMessage(value) : undefined;
      return parsed?.ok === true ? [[key, parsed.args] as const] : [];
    }),
  );

const keyParity = (entry: CatalogEntry, sourceKeys: ReadonlySet<string>, sourceLocale: string): string[] => {
  const label = `${entry.namespace}/${entry.locale}`;
  const keys = new Set(flatten(entry.messages).map(({ key }) => key));
  return [
    ...[...sourceKeys].filter((key) => !keys.has(key)).map((key) => `${label}: missing key ${key}`),
    ...[...keys].filter((key) => !sourceKeys.has(key)).map((key) => `${label}: key ${key} is not in ${sourceLocale}`),
  ];
};

const checkNamespace = (namespace: string, entries: readonly CatalogEntry[], options: CheckOptions): string[] => {
  const { supportedLocales, sourceLocale } = options;
  const source = entries.find((entry) => entry.locale === sourceLocale);
  if (source === undefined) return [`${namespace}: source locale ${sourceLocale} is missing`];
  const args = sourceArguments(source);
  const sourceKeys = new Set(flatten(source.messages).map(({ key }) => key));
  const problems = checkLeaves(source, undefined, sourceLocale);
  for (const locale of supportedLocales.filter((candidate) => candidate !== sourceLocale)) {
    const entry = entries.find((candidate) => candidate.locale === locale);
    if (entry === undefined) problems.push(`${namespace}: locale ${locale} is missing`);
    else problems.push(...keyParity(entry, sourceKeys, sourceLocale), ...checkLeaves(entry, args, sourceLocale));
  }
  for (const entry of entries.filter((candidate) => !supportedLocales.includes(candidate.locale))) {
    problems.push(`${namespace}/${entry.locale}: locale ${entry.locale} is not supported`);
  }
  return problems;
};

/**
 * The `i18n:check` rules (decision 0013): every supported locale has every key of the source
 * locale and no extra keys, placeholders match the source, every message parses as ICU, no value
 * is empty, and no catalog uses an unsupported locale.
 */
export const checkCatalogs = (entries: readonly CatalogEntry[], options: CheckOptions): string[] => {
  const namespaces = [...new Set(entries.map((entry) => entry.namespace))];
  return namespaces.flatMap((namespace) =>
    checkNamespace(namespace, entries.filter((entry) => entry.namespace === namespace), options),
  );
};

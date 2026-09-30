import { fallbackChain, type SupportedLocale } from "../locales.ts";
import { CORE_MESSAGES, type CoreMessages, type MessageTree } from "./core-catalog.ts";

/** Extra namespaces (one per module id), each with its catalogs per locale. */
export type ExtraNamespaces = Record<string, Partial<Record<string, MessageTree>>>;

export type LoadedMessages = CoreMessages & Record<string, MessageTree>;

const isTree = (value: unknown): value is MessageTree =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep merge where `override` wins leaf by leaf; inputs are never mutated. */
const mergeTrees = (base: MessageTree, override: MessageTree): MessageTree => {
  const merged: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isTree(value) && isTree(current) ? mergeTrees(current, value) : value;
  }
  return merged;
};

/** Merges the fallback chain from the source up, so the requested locale wins per key. */
const resolveChain = (chain: readonly SupportedLocale[], pick: (locale: SupportedLocale) => MessageTree | undefined): MessageTree =>
  chain.toReversed().reduce<MessageTree>((merged, locale) => mergeTrees(merged, pick(locale) ?? {}), {});

/**
 * Messages for `locale`: the core namespaces plus `extra` (module catalogs keyed by module id),
 * each deep-merged over its fallback chain (decision 0013: `en-US`/`es-419` → `pt-BR`), so a key
 * missing in the locale shows the source text instead of the raw key.
 */
export const loadMessages = (locale: SupportedLocale, extra: ExtraNamespaces = {}): LoadedMessages => {
  const chain = fallbackChain(locale);
  const core = resolveChain(chain, (candidate) => CORE_MESSAGES[candidate]) as LoadedMessages;
  const modules = Object.fromEntries(
    Object.entries(extra).map(([namespace, byLocale]) => [namespace, resolveChain(chain, (candidate) => byLocale[candidate])]),
  );
  return { ...core, ...modules };
};

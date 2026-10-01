import type { ExtraNamespaces, MessageTree } from "@core/i18n";
import { INSTALLED_MODULES } from "@/modules";

const MODULE_MESSAGES: ExtraNamespaces = Object.fromEntries(
  INSTALLED_MODULES.map((manifest) => [manifest.id, manifest.messages as Partial<Record<string, MessageTree>>]),
);

/**
 * Catalogs of the installed modules keyed by module id, for `loadMessages(locale, extra)` on the
 * server (page metadata); the client registry merges the same catalogs (decision 0015 §3).
 */
export const serverModuleMessages = (): ExtraNamespaces => MODULE_MESSAGES;

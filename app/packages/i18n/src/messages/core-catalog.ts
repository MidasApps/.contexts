import enUSCommon from "./en-US/common.json" with { type: "json" };
import enUSErrors from "./en-US/errors.json" with { type: "json" };
import es419Common from "./es-419/common.json" with { type: "json" };
import es419Errors from "./es-419/errors.json" with { type: "json" };
import ptBRCommon from "./pt-BR/common.json" with { type: "json" };
import ptBRErrors from "./pt-BR/errors.json" with { type: "json" };
import type { SupportedLocale } from "../locales.ts";

/** A message tree: ICU strings at the leaves, nested by key segment. */
export type MessageTree = { [key: string]: string | MessageTree };

/**
 * Shape of the core namespaces, taken from the source catalog; apps use it for the `use-intl`
 * `AppConfig` augmentation, so a key missing in `pt-BR` is a type error.
 */
export type CoreMessages = { common: typeof ptBRCommon; errors: typeof ptBRErrors };

/** Static imports keep the catalogs bundler-friendly (Next, Vite) and Node-loadable. */
export const CORE_MESSAGES: Record<SupportedLocale, CoreMessages> = {
  "pt-BR": { common: ptBRCommon, errors: ptBRErrors },
  "en-US": { common: enUSCommon, errors: enUSErrors },
  "es-419": { common: es419Common, errors: es419Errors },
};

import enUSAdmin from "./en-US/admin.json" with { type: "json" };
import enUSAuth from "./en-US/auth.json" with { type: "json" };
import enUSCommon from "./en-US/common.json" with { type: "json" };
import enUSErrors from "./en-US/errors.json" with { type: "json" };
import enUSPermissions from "./en-US/permissions.json" with { type: "json" };
import enUSProfile from "./en-US/profile.json" with { type: "json" };
import enUSSettings from "./en-US/settings.json" with { type: "json" };
import enUSShell from "./en-US/shell.json" with { type: "json" };
import es419Admin from "./es-419/admin.json" with { type: "json" };
import es419Auth from "./es-419/auth.json" with { type: "json" };
import es419Common from "./es-419/common.json" with { type: "json" };
import es419Errors from "./es-419/errors.json" with { type: "json" };
import es419Permissions from "./es-419/permissions.json" with { type: "json" };
import es419Profile from "./es-419/profile.json" with { type: "json" };
import es419Settings from "./es-419/settings.json" with { type: "json" };
import es419Shell from "./es-419/shell.json" with { type: "json" };
import ptBRAdmin from "./pt-BR/admin.json" with { type: "json" };
import ptBRAuth from "./pt-BR/auth.json" with { type: "json" };
import ptBRCommon from "./pt-BR/common.json" with { type: "json" };
import ptBRErrors from "./pt-BR/errors.json" with { type: "json" };
import ptBRPermissions from "./pt-BR/permissions.json" with { type: "json" };
import ptBRProfile from "./pt-BR/profile.json" with { type: "json" };
import ptBRSettings from "./pt-BR/settings.json" with { type: "json" };
import ptBRShell from "./pt-BR/shell.json" with { type: "json" };
import type { SupportedLocale } from "../locales.ts";

/** A message tree: ICU strings at the leaves, nested by key segment. */
export type MessageTree = { [key: string]: string | MessageTree };

/**
 * Shape of the core namespaces, taken from the source catalog; apps use it for the `use-intl`
 * `AppConfig` augmentation, so a key missing in `pt-BR` is a type error.
 */
export type CoreMessages = {
  admin: typeof ptBRAdmin;
  auth: typeof ptBRAuth;
  common: typeof ptBRCommon;
  errors: typeof ptBRErrors;
  permissions: typeof ptBRPermissions;
  profile: typeof ptBRProfile;
  settings: typeof ptBRSettings;
  shell: typeof ptBRShell;
};

/** Static imports keep the catalogs bundler-friendly (Next, Vite) and Node-loadable. */
export const CORE_MESSAGES: Record<SupportedLocale, CoreMessages> = {
  "pt-BR": { admin: ptBRAdmin, auth: ptBRAuth, common: ptBRCommon, errors: ptBRErrors, permissions: ptBRPermissions, profile: ptBRProfile, settings: ptBRSettings, shell: ptBRShell },
  "en-US": { admin: enUSAdmin, auth: enUSAuth, common: enUSCommon, errors: enUSErrors, permissions: enUSPermissions, profile: enUSProfile, settings: enUSSettings, shell: enUSShell },
  "es-419": { admin: es419Admin, auth: es419Auth, common: es419Common, errors: es419Errors, permissions: es419Permissions, profile: es419Profile, settings: es419Settings, shell: es419Shell },
};

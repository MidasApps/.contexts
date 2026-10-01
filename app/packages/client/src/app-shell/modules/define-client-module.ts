import type { ModuleManifest, NavSlot } from "@core/contracts";
import { lazy } from "react";
import type { ClientModule, ModulePageLoader } from "#/shared/lib/shell/shell-types.ts";
import { isIconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";

export type { ClientModule, ModulePageLoader, ModulePageProps } from "#/shared/lib/shell/shell-types.ts";

/** A client module declared wrong: raised when the app composes its modules, never at request time. */
export class ClientModuleError extends Error {
  readonly code = "INVALID_CLIENT_MODULE";
  readonly moduleId: string;
  readonly problems: readonly string[];

  constructor(args: { moduleId: string; problems: readonly string[] }) {
    super(`Client module ${args.moduleId}: ${args.problems.join("; ")}`);
    this.name = "ClientModuleError";
    this.moduleId = args.moduleId;
    this.problems = args.problems;
  }
}

const SEGMENT = "(?:[a-z0-9]+(?:-[a-z0-9]+)*|:[a-zA-Z][A-Za-z0-9]*)";
const PAGE_KEY = new RegExp(`^(?:${SEGMENT}(?:/${SEGMENT})*)?$`);

// Module routes exist under the project (`/m/:moduleId/*`), module settings and `/admin/*` only.
const ROUTABLE_SLOTS: ReadonlySet<NavSlot> = new Set(["project", "settings", "admin"]);

const checkNavigation = (manifest: ModuleManifest, pageKeys: readonly string[]): string[] =>
  (manifest.navigation ?? []).flatMap((item) => [
    ...(isIconName(item.icon) ? [] : [`navigation ${item.id}: unknown icon ${item.icon}`]),
    ...(item.slot === "project" && !pageKeys.includes(item.path) ? [`navigation ${item.id}: no page matches path ${item.path}`] : []),
    ...(ROUTABLE_SLOTS.has(item.slot) ? [] : [`navigation ${item.id}: modules cannot add items to the ${item.slot} slot (no module route there)`]),
  ]);

/**
 * Pairs a `defineModule()` manifest with its lazily loaded pages (decision 0015 §3). Pages are
 * keyed by the rest path after `/m/:moduleId/`; keep keys stable, deep links depend on them.
 * @throws {ClientModuleError} for a malformed page key, an icon outside the client registry, a
 *   project navigation item without a page, or an item in a slot modules cannot route to.
 * @example export const exampleClientModule = defineClientModule({ manifest, pages: { "": () => import("./ui/ExampleHomePage.tsx") } });
 */
export const defineClientModule = (args: { manifest: ModuleManifest; pages: Readonly<Record<string, ModulePageLoader>> }): ClientModule => {
  const pageKeys = Object.keys(args.pages);
  const problems = [
    ...pageKeys.filter((key) => !PAGE_KEY.test(key)).map((key) => `page key ${key} must be a relative path of segments or :params`),
    ...checkNavigation(args.manifest, pageKeys),
  ];
  if (problems.length > 0) throw new ClientModuleError({ moduleId: args.manifest.id, problems });
  const lazyPages = Object.fromEntries(Object.entries(args.pages).map(([key, load]) => [key, lazy(load)]));
  return { manifest: args.manifest, pages: args.pages, lazyPages };
};

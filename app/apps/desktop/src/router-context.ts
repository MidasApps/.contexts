import type { CreatedClientApp } from "@core/client/app-shell";
import type { LocaleStore } from "@/adapters/desktop-locale.ts";

/** The composed shared client and the desktop UI state the root route renders with. */
export type DesktopApp = {
  readonly ClientApp: CreatedClientApp["ClientApp"];
  readonly locale: LocaleStore;
  readonly sidebar: { readonly defaultOpen: boolean; readonly persist: (open: boolean) => void };
};

/** Dependencies routes receive through TanStack Router context (built in `create-desktop-runtime.ts`). */
export type RouterContext = { readonly app: DesktopApp };

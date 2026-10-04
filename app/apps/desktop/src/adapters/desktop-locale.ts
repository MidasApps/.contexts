import { negotiateLocale, SOURCE_LOCALE, type SupportedLocale } from "@core/i18n";
import { useSyncExternalStore } from "react";

/**
 * The desktop UI language (SP2 spec §5, decision 0012: no locale in desktop URLs): the profile
 * preference, else the OS languages (`navigator.languages`, best fit), else pt-BR.
 */
export const resolveDesktopLocale = (args: {
  profileLocale: string | undefined;
  languages: readonly string[];
}): SupportedLocale =>
  negotiateLocale({ requested: args.languages, saved: args.profileLocale, fallback: SOURCE_LOCALE });

/** The current UI language; `switchLocale` of the router port writes it and the intl provider reads it. */
export type LocaleStore = {
  get: () => SupportedLocale;
  set: (locale: SupportedLocale) => void;
  subscribe: (listener: () => void) => () => void;
};

export const createLocaleStore = (initial: SupportedLocale): LocaleStore => {
  let locale = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => locale,
    set: (next) => {
      if (next === locale) return;
      locale = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
};

/** Re-renders on every locale switch. */
export const useLocale = (store: LocaleStore): SupportedLocale =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

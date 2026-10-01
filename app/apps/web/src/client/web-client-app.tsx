"use client";

import { createClientApp, type CreatedClientApp } from "@core/client/app-shell";
import { createFirebaseAuthClient } from "@core/client/shared/lib/auth";
import { CHAT_SHELL_SLOTS } from "@core/client/widgets/chat-panel";
import type { SupportedLocale } from "@core/i18n";
import { useState, type ReactNode } from "react";
import { createSession, exchangeSession, signOut } from "@/app/[locale]/(auth)/actions";
import { toWebClientConfig, WEB_PUBLIC_ENV } from "./client-config";
import { WEB_CLIENT_MODULES } from "./modules";
import { createServerRenderAuth } from "./server-render-auth";
import { createWebErrorReporter, type WebClientLogEntry } from "./web-report-error";
import { createWebRouterAdapter, type WebRouterAdapter } from "./web-router-adapter";
import { WebRouterBridge } from "./web-router-bridge";
import { createWebSessionBridge } from "./web-session-bridge";

type WebClient = { readonly app: CreatedClientApp; readonly router: WebRouterAdapter };

// The browser console is the only client log sink until a log transport exists; entries are
// structured JSON without messages or PII (see web-report-error.ts).
// eslint-disable-next-line no-console -- see above
const writeToConsole = (entry: WebClientLogEntry): void => console.error(JSON.stringify(entry));

const isBrowser = (): boolean => typeof window !== "undefined";

/**
 * Composition root of the web client (SP2 Task 18): the shared client with the web adapters —
 * next-intl router port, Firebase Auth (browser only), Server Action session bridge, platform
 * `web` on the same origin. Built once per mounted tree: per request on the server, once in the
 * browser (the root layout keys it by locale).
 */
const createWebClient = (locale: SupportedLocale): WebClient => {
  const config = toWebClientConfig(WEB_PUBLIC_ENV);
  const router = createWebRouterAdapter({ locale, assign: (href) => globalThis.location.assign(href) });
  const app = createClientApp({
    config,
    modules: WEB_CLIENT_MODULES,
    // The chat in the shell's right panel (SP4 Task 13); the chat page is a route of its own.
    slots: CHAT_SHELL_SLOTS,
    adapters: {
      auth: isBrowser() ? createFirebaseAuthClient(config) : createServerRenderAuth(),
      router,
      sessionBridge: createWebSessionBridge({ createSession, exchangeSession, signOut }),
      platform: { kind: "web", apiBaseUrl: config.apiBaseUrl },
      reportError: createWebErrorReporter({ appEnv: config.appEnv, sink: writeToConsole }),
    },
  });
  return { app, router };
};

/** Every provider the shared views need, for the pages under `/{locale}`. */
export function WebClientApp({ locale, children }: { locale: SupportedLocale; children: ReactNode }) {
  const [client] = useState(() => createWebClient(locale));
  const { ClientApp } = client.app;
  return (
    <ClientApp locale={locale}>
      <WebRouterBridge adapter={client.router} />
      {children}
    </ClientApp>
  );
}

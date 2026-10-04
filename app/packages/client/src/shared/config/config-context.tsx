"use client";

import { createContext, type ReactNode, use } from "react";
import type { ClientConfig } from "./client-config.schema.ts";

const ClientConfigContext = createContext<ClientConfig | null>(null);

/** Provides the parsed public config (the app shell mounts it with `createClientApp({ config })`). */
export function ClientConfigProvider({ config, children }: { config: ClientConfig; children: ReactNode }) {
  return <ClientConfigContext value={config}>{children}</ClientConfigContext>;
}

/**
 * The public client config (MFA factors offered, app env). Views read it to branch UI only; the
 * server still decides.
 * @throws {Error} outside `ClientConfigProvider` (a composition bug).
 */
export const useClientConfig = (): ClientConfig => {
  const config = use(ClientConfigContext);
  if (config === null) throw new Error("useClientConfig must be used inside ClientConfigProvider");
  return config;
};

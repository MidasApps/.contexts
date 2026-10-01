"use client";

import { createContext, use, type ReactNode } from "react";
import type { CallEndpoint } from "./call-endpoint.ts";

const ApiContext = createContext<CallEndpoint | null>(null);

/** Provides the typed `/v1` caller the app shell built (decision 0011); tests pass one over a fake fetch. */
export function ApiProvider({ callEndpoint, children }: { callEndpoint: CallEndpoint; children: ReactNode }) {
  return <ApiContext value={callEndpoint}>{children}</ApiContext>;
}

/**
 * The typed `/v1` caller (`callEndpoint(endpoint, { params, query, body })`) for query and mutation functions.
 * @throws {Error} outside `ApiProvider` (a composition bug).
 */
export const useCallEndpoint = (): CallEndpoint => {
  const callEndpoint = use(ApiContext);
  if (callEndpoint === null) throw new Error("useCallEndpoint must be used inside ApiProvider");
  return callEndpoint;
};

"use client";

import { createContext, type ReactNode, use } from "react";
import type { CallEndpoint } from "./call-endpoint.ts";
import type { FetchLike, GetIdToken } from "./http-client.ts";

/** What a streaming transport needs to reach `/v1` itself (the chat stream is not a JSON call). */
export type ApiConnection = { readonly baseUrl: string; readonly getIdToken: GetIdToken; readonly fetch: FetchLike };

const ApiContext = createContext<CallEndpoint | null>(null);
const ApiConnectionContext = createContext<ApiConnection | null>(null);

/**
 * Provides the typed `/v1` caller the app shell built (decision 0011); tests pass one over a fake
 * fetch. `connection` gives streaming transports (chat) the same origin, token source and fetch.
 */
export function ApiProvider({
  callEndpoint,
  connection,
  children,
}: {
  callEndpoint: CallEndpoint;
  connection?: ApiConnection | undefined;
  children: ReactNode;
}) {
  return (
    <ApiContext value={callEndpoint}>
      <ApiConnectionContext value={connection ?? null}>{children}</ApiConnectionContext>
    </ApiContext>
  );
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

/**
 * Origin, token source and fetch of `/v1`, for transports that stream (`createChatTransport`).
 * @throws {Error} when `ApiProvider` got no `connection` (a composition bug).
 */
export const useApiConnection = (): ApiConnection => {
  const connection = use(ApiConnectionContext);
  if (connection === null) throw new Error("useApiConnection must be used inside ApiProvider with a connection");
  return connection;
};

// Test helper: renders client code (entities, features) inside the ports the app shell provides —
// router (memory), auth (fake), the typed `/v1` caller over a fake API and a hand-made session —
// plus `use-intl` and TanStack Query. Widgets and views use the full app harness instead.
import { loadMessages, type ExtraNamespaces, type SupportedLocale } from "@core/i18n";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render, renderHook, type RenderHookResult, type RenderOptions, type RenderResult } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { ApiProvider } from "#/shared/api/api-context.tsx";
import { createEndpointCaller } from "#/shared/api/call-endpoint.ts";
import { createHttpClient } from "#/shared/api/http-client.ts";
import { AuthProvider } from "#/shared/lib/auth/auth-context.tsx";
import type { AuthUser } from "#/shared/lib/auth/auth-port.ts";
import { createFakeAuth, type FakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { createMemoryRouter, type MemoryRouter } from "#/shared/lib/router/memory-router.tsx";
import { RouterProvider } from "#/shared/lib/router/router-context.tsx";
import { SessionContextProvider } from "#/shared/lib/session/session-context.tsx";
import type { SessionController, SessionState } from "#/shared/lib/session/session-state.ts";
import { createFakeApi, type FakeApi } from "./fake-api.ts";
import { createTestQueryClient } from "./render.tsx";

export const TEST_USER: AuthUser = { uid: "uA1b2C3d4E5f6G7h8I9j", email: "ana@example.com", displayName: "Ana Souza", emailVerified: true, mfaFactors: [] };

/** A session controller whose actions record calls (and resolve), in the given state. */
export type RecordingSession = SessionController & { readonly actions: string[] };

export const createRecordingSession = (state: SessionState = { status: "signed-in", uid: TEST_USER.uid }): RecordingSession => {
  const actions: string[] = [];
  const record = (name: string) => () => {
    actions.push(name);
    return Promise.resolve();
  };
  return {
    state,
    actions,
    completeSignIn: record("completeSignIn"),
    signOut: record("signOut"),
    enterImpersonation: () => record("enterImpersonation")(),
    leaveImpersonation: record("leaveImpersonation"),
    requireMfa: () => void actions.push("requireMfa"),
    cancelMfa: () => void actions.push("cancelMfa"),
  };
};

export type ClientTestOptions = {
  api?: FakeApi;
  /** Initial href of the memory router (default `/`). */
  path?: string;
  session?: SessionController;
  auth?: FakeAuth;
  locale?: SupportedLocale;
  timeZone?: string;
  queryClient?: QueryClient;
  /** Module or fixture namespaces merged over the core catalogs. */
  extraMessages?: ExtraNamespaces;
};

export type ClientTestContext = {
  api: FakeApi;
  router: MemoryRouter;
  auth: FakeAuth;
  session: SessionController;
  queryClient: QueryClient;
  Wrapper: (props: { children: ReactNode }) => ReactElement;
};

const throwOnIntlError = (error: Error): never => {
  throw error;
};

/** Builds the providers once, so a test can inspect the fakes it passed in (or the defaults). */
export const createClientTestContext = (options: ClientTestOptions = {}): ClientTestContext => {
  const api = options.api ?? createFakeApi();
  const router = createMemoryRouter(options.path ?? "/");
  const auth = options.auth ?? createFakeAuth(TEST_USER, { status: "signed-in", user: TEST_USER });
  const session = options.session ?? createRecordingSession();
  const queryClient = options.queryClient ?? createTestQueryClient();
  const locale = options.locale ?? "pt-BR";
  const messages = loadMessages(locale, options.extraMessages ?? {});
  const connection = { baseUrl: "", getIdToken: auth.getIdToken, fetch: api.fetch };
  const callEndpoint = createEndpointCaller(createHttpClient(connection));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale={locale} messages={messages} timeZone={options.timeZone ?? "America/Sao_Paulo"} onError={throwOnIntlError}>
          <RouterProvider router={router}>
            <AuthProvider auth={auth}>
              <ApiProvider callEndpoint={callEndpoint} connection={connection}>
                <SessionContextProvider session={session}>{children}</SessionContextProvider>
              </ApiProvider>
            </AuthProvider>
          </RouterProvider>
        </IntlProvider>
      </QueryClientProvider>
    );
  }
  return { api, router, auth, session, queryClient, Wrapper };
};

export type RenderWithClientResult = RenderResult & ClientTestContext & { user: UserEvent };

/** Renders `ui` with the client ports; returns the fakes and a `user-event` instance. */
export const renderWithClient = (ui: ReactElement, options: ClientTestOptions = {}): RenderWithClientResult => {
  const context = createClientTestContext(options);
  const user = userEvent.setup();
  const renderOptions: RenderOptions = { wrapper: context.Wrapper };
  return { ...render(ui, renderOptions), ...context, user };
};

/** `renderHook` with the client ports. */
export const renderClientHook = <T,>(hook: () => T, options: ClientTestOptions = {}): RenderHookResult<T, unknown> & ClientTestContext => {
  const context = createClientTestContext(options);
  return { ...renderHook(hook, { wrapper: context.Wrapper }), ...context };
};

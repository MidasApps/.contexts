import { loadMessages, type ExtraNamespaces, type SupportedLocale } from "@core/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { IntlProvider } from "use-intl";

export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  locale?: SupportedLocale;
  timeZone?: string;
  /** Module or fixture namespaces merged over the core catalogs. */
  extraMessages?: ExtraNamespaces;
  queryClient?: QueryClient;
};

export type RenderWithProvidersResult = RenderResult & { user: UserEvent; queryClient: QueryClient };

/** A fresh client per test: no retries and no shared cache between tests. */
export const createTestQueryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });

// A missing key must fail the test instead of rendering the key (rules/internationalization.md).
const throwOnIntlError = (error: Error): never => {
  throw error;
};

/**
 * Renders `ui` inside the providers every client view expects: `use-intl` (pt-BR and
 * America/Sao_Paulo by default) and TanStack Query. Returns a `user-event` instance too.
 */
export const renderWithProviders = (
  ui: ReactElement,
  { locale = "pt-BR", timeZone = "America/Sao_Paulo", extraMessages = {}, queryClient, ...options }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult => {
  const client = queryClient ?? createTestQueryClient();
  const messages = loadMessages(locale, extraMessages);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <IntlProvider locale={locale} messages={messages} timeZone={timeZone} onError={throwOnIntlError}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  return { ...render(ui, { wrapper: Wrapper, ...options }), user, queryClient: client };
};

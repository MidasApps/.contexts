"use client";

import type { LoadedMessages, SupportedLocale } from "@core/i18n";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { IntlProvider, type IntlError } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { accessContextQuery, meQuery } from "#/shared/api/core-queries.ts";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";

const browserTimeZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The display time zone (decision 0013 §5): `regional.displayTimeZone` of the access context at the
 * current node (user → node → project → organization, SP1), else the user's preference outside a
 * tenant, else the browser's zone.
 */
const useDisplayTimeZone = (): string => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useSession().state.status === "signed-in";
  const node = useCurrentNode();
  const me = useQuery({ ...meQuery(callEndpoint), enabled: signedIn });
  const context = useQuery({ ...accessContextQuery(callEndpoint, node ?? { organizationId: "" }), enabled: signedIn && node !== null });
  return (node === null ? undefined : context.data?.regional.displayTimeZone) ?? me.data?.preferences.timeZone ?? browserTimeZone();
};

/** `use-intl` provider for both hosts: locale from the host, messages with module namespaces, display time zone. */
export function ShellIntlProvider(props: {
  locale: SupportedLocale;
  messages: LoadedMessages;
  onError: (error: IntlError) => void;
  children: ReactNode;
}) {
  const timeZone = useDisplayTimeZone();
  return (
    <IntlProvider locale={props.locale} messages={props.messages} timeZone={timeZone} onError={props.onError}>
      {props.children}
    </IntlProvider>
  );
}

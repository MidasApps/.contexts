"use client";

import type { ContractDefinition } from "@core/contracts";
import { useCallback, useMemo } from "react";
import { approvalRequestRoute } from "#/entities/approval-request/index.ts";
import { type PermissionsState, usePermissions } from "#/entities/permission/index.ts";
import { useAccessContext } from "#/entities/session/index.ts";
import type { NodeParams } from "#/shared/api/core-queries.ts";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import type { RouterPort } from "#/shared/lib/router/router-port.ts";
import { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";
import { useModuleRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";

/** Permission that opens the chat (SP4 spec §4.1). */
export const CHAT_PERMISSION = "core.conversation.send";

/**
 * Href of one approval request in the approvals inbox (SP5 settings route
 * `/o/{organizationId}/settings/approvals/{approvalRequestId}`), built by the router port so the
 * web adds its locale prefix.
 */
export const approvalRequestHref = (
  router: Pick<RouterPort, "href">,
  organizationId: string,
  approvalId: string,
): string => router.href(approvalRequestRoute(organizationId, approvalId));

export type ChatEnvironment = {
  readonly status: PermissionsState["status"];
  readonly can: (permission: string) => boolean;
  /** Contracts of the installed modules, so `renderForm` draws their commands (follow-up #41). */
  readonly contracts: readonly ContractDefinition[];
  readonly defaultCurrency: string | undefined;
  readonly approvalHref: (approvalId: string) => string;
};

/**
 * What the chat panel needs from the app at a node: the viewer's permissions, the module
 * contracts for forms, the currency of the node and the link to an approval request.
 */
export const useChatEnvironment = (node: NodeParams): ChatEnvironment => {
  const router = useRouter();
  const modules = useModuleRegistry();
  const permissions = usePermissions(node);
  const context = useAccessContext(node);
  const contracts = useMemo(() => modules.contracts(), [modules]);
  const { organizationId } = node;
  const approvalHref = useCallback(
    (approvalId: string) => approvalRequestHref(router, organizationId, approvalId),
    [router, organizationId],
  );
  return {
    status: permissions.status,
    can: permissions.can,
    contracts,
    defaultCurrency: context.data?.regional.currency,
    approvalHref,
  };
};

/**
 * Whether the shell offers the chat in its right panel: inside a project, for a member who may
 * chat, and not on the chat page itself (the same conversation would be on screen twice).
 */
export const useChatSidePanelAvailable = (): boolean => {
  const router = useRouter();
  const node = useCurrentNode();
  const onChatPage = parseRoute(router.useLocationPath())?.id === "chat";
  const permissions = usePermissions(node);
  return node?.projectId !== undefined && !onChatPage && permissions.can(CHAT_PERMISSION);
};

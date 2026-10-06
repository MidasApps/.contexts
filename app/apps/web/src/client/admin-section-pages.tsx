"use client";

// The views of the /admin route only: one file per route keeps each page bundle to its own views,
// so a member opening settings or profile never downloads the admin console (decision 0042).
import { useRouter } from "@core/client/shared/lib/router";
import { AdminAgentPromptsView } from "@core/client/views/admin-agent-prompts";
import { AdminAgentsView } from "@core/client/views/admin-agents";
import { AdminAuditLogView } from "@core/client/views/admin-audit-log";
import { AdminConnectorsView } from "@core/client/views/admin-connectors";
import { AdminCostsView } from "@core/client/views/admin-costs";
import { AdminEvalsView } from "@core/client/views/admin-evals";
import { AdminFlagsView } from "@core/client/views/admin-flags";
import { AdminLogsView } from "@core/client/views/admin-logs";
import { AdminModelsView } from "@core/client/views/admin-models";
import { AdminOrganizationDetailView } from "@core/client/views/admin-organization-detail";
import { AdminOrganizationsView } from "@core/client/views/admin-organizations";
import { AdminOverviewView } from "@core/client/views/admin-overview";
import { AdminPlansView } from "@core/client/views/admin-plans";
import { AdminSlotView } from "@core/client/views/admin-slot";
import { AdminTeamView } from "@core/client/views/admin-team";
import { AdminTraceDetailView } from "@core/client/views/admin-trace-detail";
import { AdminTracesView } from "@core/client/views/admin-traces";
import { AdminUsersView } from "@core/client/views/admin-users";
import { AdminWorkflowsView } from "@core/client/views/admin-workflows";
import { type ComponentType, createElement } from "react";

/**
 * The shared view of an `/admin/<area>/…` path (SP5 spec §6): `segments` are the path parts after
 * the area. `null` falls through to `AdminSlotView` (module areas, or not-found).
 */
const only = (View: ComponentType) => (segments: readonly string[]) => (segments.length === 0 ? View : null);
const withDetail = (List: ComponentType, Detail: ComponentType) => (segments: readonly string[]) =>
  segments.length === 0 ? List : segments.length === 1 ? Detail : null;

const ADMIN_AREA_VIEWS: Readonly<Record<string, (segments: readonly string[]) => ComponentType | null>> = {
  organizations: withDetail(AdminOrganizationsView, AdminOrganizationDetailView),
  plans: only(AdminPlansView),
  users: only(AdminUsersView),
  agents: (segments) =>
    segments.length === 0
      ? AdminAgentsView
      : segments.length === 2 && segments[1] === "prompts"
        ? AdminAgentPromptsView
        : null,
  models: only(AdminModelsView),
  connectors: only(AdminConnectorsView),
  evals: only(AdminEvalsView),
  traces: withDetail(AdminTracesView, AdminTraceDetailView),
  logs: only(AdminLogsView),
  costs: only(AdminCostsView),
  workflows: only(AdminWorkflowsView),
  flags: only(AdminFlagsView),
  audit: only(AdminAuditLogView),
  team: only(AdminTeamView),
};

/** The view of an `/admin` path: the overview at the root, the area's view below it. */
const adminViewOf = (rest: string): ComponentType => {
  if (rest === "") return AdminOverviewView;
  const [area = "", ...segments] = rest.split("/");
  return (Object.hasOwn(ADMIN_AREA_VIEWS, area) ? ADMIN_AREA_VIEWS[area]?.(segments) : null) ?? AdminSlotView;
};

/** `/admin/[[...section]]`. */
export function AdminPage() {
  const rest = useRouter().useRouteParams()["rest"] ?? "";
  return createElement(adminViewOf(rest));
}

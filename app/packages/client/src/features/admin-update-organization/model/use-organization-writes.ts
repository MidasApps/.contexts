"use client";

import { setOrganizationBudgetEndpoint, updateOrganizationAdminEndpoint, type BudgetCaps, type OrganizationAdminSummary } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { adminOrganizationKeys } from "#/entities/admin-organization/index.ts";
import { adminOverviewKeys } from "#/entities/admin-overview/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";

export type OrganizationWrites = {
  /** `PATCH /v1/admin/organizations/{id}`: the plan (`null` = platform default), the status or both. */
  readonly update: (change: { planId?: string | null; status?: "active" | "suspended" }) => Promise<OrganizationAdminSummary>;
  /** `PUT …/budget`: staff caps that replace the plan's; `null` returns to the plan. */
  readonly setBudget: (override: BudgetCaps | null) => Promise<OrganizationAdminSummary>;
};

/**
 * Staff writes on one organization (platform.organization.update, audited with `targetTenantId`).
 * The API answers the organization as the list shows it, so the cached list is updated from the
 * response instead of refetched; the overview numbers are refreshed.
 */
export const useOrganizationWrites = (organizationId: string): OrganizationWrites => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const store = (saved: OrganizationAdminSummary): OrganizationAdminSummary => {
    queryClient.setQueryData<OrganizationAdminSummary[]>(adminOrganizationKeys.whole(), (list) => list?.map((item) => (item.id === saved.id ? saved : item)));
    void queryClient.invalidateQueries({ queryKey: adminOverviewKeys.all() });
    return saved;
  };
  return {
    update: async (change) => store((await callEndpoint(updateOrganizationAdminEndpoint, { params: { organizationId }, body: change })).data),
    setBudget: async (override) => store((await callEndpoint(setOrganizationBudgetEndpoint, { params: { organizationId }, body: { override } })).data),
  };
};

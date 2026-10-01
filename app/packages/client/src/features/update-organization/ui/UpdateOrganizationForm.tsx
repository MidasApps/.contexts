"use client";

import { updateOrganizationEndpoint, type Organization } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { queryKeys } from "#/shared/api/query-keys.ts";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";
import { changedOrganization, OrganizationFormContract, organizationFormValues, type OrganizationForm } from "../model/organization-form.contract.ts";

/**
 * Name and regional defaults of the organization (`PATCH /v1/organizations/{id}`,
 * core.organization.update). Sends only what changed; afterwards the access contexts (they carry
 * the organization and its regional settings) and the organization lists refetch.
 */
export function UpdateOrganizationForm({ organization }: { organization: Organization }) {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const initial = useMemo(() => organizationFormValues(organization), [organization]);
  const submit = async (values: OrganizationForm): Promise<SchemaFormResult> => {
    const body = changedOrganization(initial, values);
    if (body === null) return { ok: true };
    try {
      await callEndpoint(updateOrganizationEndpoint, { params: { organizationId: organization.id }, body });
    } catch (error: unknown) {
      if (error instanceof ApiError) return { ok: false, error };
      throw error;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.organization(organization.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations().slice(0, 2) }),
    ]);
    return { ok: true };
  };
  return <SchemaForm contract={OrganizationFormContract} defaultValues={initial} onSubmit={submit} />;
}

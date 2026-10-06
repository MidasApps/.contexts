import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeApi, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook } from "#/shared/testing/render-client.tsx";
import { roleKeys, usePermissionsCatalog, useRoles } from "./index.ts";

const role = (id: string, name: string) => ({
  id,
  tenantId: IDS.organization,
  name,
  description: "",
  permissions: ["core.organization.read"],
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T15:00:00.000Z",
});

describe("role entity", () => {
  it("reads every page of custom roles under the organization's key", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/roles`]: (request) =>
        request.query.get("cursor") === "r2"
          ? page([role("Rl2", "Auditor")])
          : page([role("Rl1", "Editor")], { cursor: "r2" }),
    });
    const { result, queryClient } = renderClientHook(() => useRoles(IDS.organization), { api });
    await waitFor(() => expect(result.current.data?.map((item) => item.name)).toEqual(["Editor", "Auditor"]));
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(roleKeys.all(IDS.organization));
    expect(roleKeys.all(IDS.organization).slice(0, 2)).toEqual(["organizations", IDS.organization]);
  });

  it("reads the permission registry as a platform catalog", async () => {
    const api = createFakeApi({
      "GET /v1/permissions": page([
        {
          id: "core.organization.read",
          descriptionKey: "core.permissions.organizationRead",
          kind: "read",
          scope: "tenant",
          defaultRoles: ["viewer"],
        },
      ]),
    });
    const { result, queryClient } = renderClientHook(() => usePermissionsCatalog(), { api });
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe("core.organization.read"));
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(["catalog", "permissions"]);
  });
});

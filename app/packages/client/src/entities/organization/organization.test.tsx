import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, createFakeApi, ok } from "#/shared/testing/fake-api.ts";
import { buildOrganization, IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook, renderWithClient } from "#/shared/testing/render-client.tsx";
import { orderByLastUsed, organizationKeys, OrganizationAvatar, useOrganization } from "./index.ts";

describe("organization entity", () => {
  it("reads an organization under its own key and returns null for a hidden one (404)", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}`]: ok(buildOrganization()),
      [`GET /v1/organizations/${IDS.otherOrganization}`]: apiError(404, "NOT_FOUND"),
    });
    const visible = renderClientHook(() => useOrganization(IDS.organization), { api });
    await waitFor(() => expect(visible.result.current.data?.name).toBe("Northwind"));
    expect(visible.queryClient.getQueryData(organizationKeys.detail(IDS.organization))).toMatchObject({ id: IDS.organization });
    expect(organizationKeys.detail(IDS.organization).slice(0, 2)).toEqual(["organizations", IDS.organization]);

    const hidden = renderClientHook(() => useOrganization(IDS.otherOrganization), { api });
    await waitFor(() => expect(hidden.result.current.isSuccess).toBe(true));
    expect(hidden.result.current.data).toBeNull();
  });

  it("keeps a failure other than 404 as an error and waits without an id", async () => {
    const api = createFakeApi({ [`GET /v1/organizations/${IDS.organization}`]: apiError(500, "INTERNAL_ERROR") });
    const { result } = renderClientHook(() => useOrganization(IDS.organization), { api });
    await waitFor(() => expect(result.current.error).toMatchObject({ code: "INTERNAL_ERROR" }));
    const idle = renderClientHook(() => useOrganization(undefined), { api });
    expect(idle.result.current.fetchStatus).toBe("idle");
  });

  it("puts the last used organization first", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(orderByLastUsed(items, "c").map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(orderByLastUsed(items, "zz").map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("renders the organization mark with its name for assistive tech", async () => {
    const { container } = renderWithClient(<OrganizationAvatar name="Northwind Labs" />);
    expect(screen.getByText("NL")).toBeDefined();
    expect(screen.getByText("Northwind Labs").className).toContain("sr-only");
    await expectNoAxeViolations(container);
  });
});

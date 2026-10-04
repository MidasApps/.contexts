import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, createFakeApi, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook } from "#/shared/testing/render-client.tsx";
import { moduleSettingsKeys, useModuleSettings } from "./index.ts";

const settings = {
  tenantId: IDS.organization,
  moduleId: "example",
  values: { greeting: "Olá" },
  updatedAt: "2026-09-29T15:00:00.000Z",
  updatedBy: IDS.user,
};

describe("module-settings entity", () => {
  it("reads a module's settings under the organization's key and returns null for an unknown module", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/module-settings/example`]: ok(settings),
      [`GET /v1/organizations/${IDS.organization}/module-settings/missing`]: apiError(404, "NOT_FOUND"),
    });
    const known = renderClientHook(() => useModuleSettings(IDS.organization, "example"), { api });
    await waitFor(() => expect(known.result.current.data?.values).toEqual({ greeting: "Olá" }));
    expect(known.queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(
      moduleSettingsKeys.detail(IDS.organization, "example"),
    );
    expect(moduleSettingsKeys.all(IDS.organization).slice(0, 2)).toEqual(["organizations", IDS.organization]);

    const unknown = renderClientHook(() => useModuleSettings(IDS.organization, "missing"), { api });
    await waitFor(() => expect(unknown.result.current.isSuccess).toBe(true));
    expect(unknown.result.current.data).toBeNull();
  });

  it("surfaces 403 as an error (no permission to read the settings)", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/module-settings/example`]: apiError(403, "FORBIDDEN"),
    });
    const { result } = renderClientHook(() => useModuleSettings(IDS.organization, "example"), { api });
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 403 }));
  });
});

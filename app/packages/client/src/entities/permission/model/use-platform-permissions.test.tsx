import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, createFakeApi, ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { renderClientHook } from "#/shared/testing/render-client.tsx";
import { platformRoleCan, usePlatformPermissions } from "./use-platform-permissions.ts";

describe("platformRoleCan", () => {
  it("grants a platform permission by the staff role's defaults (SP1 core permissions)", () => {
    expect(platformRoleCan("platform-support", "platform.user.read")).toBe(true);
    expect(platformRoleCan("platform-support", "platform.staff.manage")).toBe(false);
    expect(platformRoleCan("platform-admin", "platform.staff.manage")).toBe(true);
  });

  it("never grants tenant permissions or anything without a role", () => {
    expect(platformRoleCan("platform-admin", "core.organization.read")).toBe(false);
    expect(platformRoleCan(undefined, "platform.user.read")).toBe(false);
  });
});

describe("usePlatformPermissions", () => {
  it("answers from the staff role in GET /v1/me", async () => {
    const api = createFakeApi({ "GET /v1/me": ok(buildMe({ isPlatformStaff: true, platformRole: "platform-support" })) });
    const { result } = renderClientHook(() => usePlatformPermissions(), { api });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.can("platform.organization.read")).toBe(true);
    expect(result.current.can("platform.staff.manage")).toBe(false);
  });

  it("denies everything while loading and on error", async () => {
    const api = createFakeApi({ "GET /v1/me": apiError(503, "INTERNAL_ERROR") });
    const { result } = renderClientHook(() => usePlatformPermissions(), { api });

    expect(result.current.can("platform.user.read")).toBe(false);
    await waitFor(() => expect(result.current.status).toBe("error"), { timeout: 10_000 });
    expect(result.current.can("platform.user.read")).toBe(false);
  });
});

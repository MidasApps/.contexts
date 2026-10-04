import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeApi, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook } from "#/shared/testing/render-client.tsx";
import { deviceKeys, useDevices } from "./index.ts";

const device = (id: string, label: string) => ({
  id,
  tenantId: IDS.organization,
  label,
  node: { level: "organization", tenantId: IDS.organization },
  status: "active",
  lastSeenAt: null,
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T15:00:00.000Z",
});

describe("device entity", () => {
  it("merges device pages under the organization's key", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/devices`]: (request) =>
        request.query.get("cursor") === "d2"
          ? page([device("Dv2", "Kiosk")])
          : page([device("Dv1", "Front desk")], { cursor: "d2" }),
    });
    const { result, queryClient } = renderClientHook(() => useDevices(IDS.organization), { api });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.map((item) => item.label)).toEqual(["Front desk", "Kiosk"]));
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey.slice(0, 3)).toEqual(deviceKeys.all(IDS.organization));
  });
});

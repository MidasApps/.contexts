import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeApi, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook } from "#/shared/testing/render-client.tsx";
import { apiKeyKeys, useApiKeys } from "./index.ts";

const apiKey = (id: string, name: string) => ({
  id,
  tenantId: IDS.organization,
  name,
  publicId: "ABCDEFGHIJKL",
  scopes: ["core.organization.read"],
  node: { level: "organization", tenantId: IDS.organization },
  ownerUid: IDS.user,
  expiresAt: "2027-09-29T14:30:00.000Z",
  lastUsedAt: null,
  status: "active",
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T15:00:00.000Z",
});

describe("api-key entity", () => {
  it("merges API key pages under the organization's key", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/api-keys`]: (request) =>
        request.query.get("cursor") === "k2"
          ? page([apiKey("Ak2", "CI")])
          : page([apiKey("Ak1", "Import")], { cursor: "k2" }),
    });
    const { result, queryClient } = renderClientHook(() => useApiKeys(IDS.organization), { api });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.map((item) => item.name)).toEqual(["Import", "CI"]));
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey.slice(0, 3)).toEqual(apiKeyKeys.all(IDS.organization));
  });
});

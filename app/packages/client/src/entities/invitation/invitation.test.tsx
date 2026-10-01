import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeApi, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook } from "#/shared/testing/render-client.tsx";
import { invitationKeys, useInvitations } from "./index.ts";

const invitation = (id: string, email: string) => ({
  id,
  tenantId: IDS.organization,
  email,
  node: { level: "organization", tenantId: IDS.organization },
  roles: [{ kind: "system", key: "member" }],
  status: "pending",
  expiresAt: "2026-10-06T14:30:00.000Z",
  invitedBy: IDS.user,
  acceptedByUid: null,
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T15:00:00.000Z",
});

describe("invitation entity", () => {
  it("merges pending invitation pages under the organization's key", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/invitations`]: (request) =>
        request.query.get("cursor") === "i2" ? page([invitation("Iv2", "b@example.com")]) : page([invitation("Iv1", "a@example.com")], { cursor: "i2" }),
    });
    const { result, queryClient } = renderClientHook(() => useInvitations(IDS.organization, { status: "pending" }), { api });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.map((item) => item.email)).toEqual(["a@example.com", "b@example.com"]));
    expect(api.calls[0]?.query).toBe("?limit=50&status=pending");
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey.slice(0, 3)).toEqual(invitationKeys.all(IDS.organization));
  });
});

import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createFakeApi, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook, renderWithClient } from "#/shared/testing/render-client.tsx";
import { MemberChip, memberKeys, useMembers, useMemberships } from "./index.ts";

const grant = { membershipId: "Mb6nB8vC0xZ2lK4jH6gF", node: { level: "organization", tenantId: IDS.organization }, roles: [{ kind: "system", key: "admin" }] };
const member = (uid: string, displayName: string) => ({ uid, displayName, email: `${uid}@example.com`, grants: [grant] });

describe("member entity", () => {
  it("merges member pages under the organization's key", async () => {
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/members`]: (request) =>
        request.query.get("cursor") === "n" ? page([member("u2", "Bia")], { limit: 50 }) : page([member("u1", "Ana")], { cursor: "n", limit: 50 }),
    });
    const { result, queryClient } = renderClientHook(() => useMembers(IDS.organization), { api });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.map((item) => item.displayName)).toEqual(["Ana", "Bia"]));
    expect(api.calls[0]?.query).toBe("?limit=50");
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey.slice(0, 3)).toEqual(memberKeys.all(IDS.organization));
  });

  it("filters memberships by principal", async () => {
    const api = createFakeApi({ [`GET /v1/organizations/${IDS.organization}/memberships`]: page([]) });
    const { result } = renderClientHook(() => useMemberships(IDS.organization, { principalId: "u1" }), { api });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.calls[0]?.query).toBe("?limit=50&principalId=u1");
  });

  it("shows the email as the name when the display name is empty", async () => {
    const { container } = renderWithClient(
      <ul>
        <li>
          <MemberChip displayName="Ana Souza" email="ana@example.com" />
        </li>
        <li>
          <MemberChip displayName="  " email="bia@example.com" />
        </li>
      </ul>,
    );
    expect(screen.getByText("ana@example.com")).toBeDefined();
    expect(screen.getAllByText("bia@example.com")).toHaveLength(1);
    await expectNoAxeViolations(container);
  });
});

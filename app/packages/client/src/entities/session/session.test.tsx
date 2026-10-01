import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, createFakeApi, ok, page } from "#/shared/testing/fake-api.ts";
import { buildAccessContext, buildMe, buildOrganization, IDS } from "#/shared/testing/fixtures.ts";
import { createRecordingSession, renderClientHook } from "#/shared/testing/render-client.tsx";
import { useAccessContext, useCurrentNode, useMe, useMyOrganizations } from "./index.ts";

describe("session entity", () => {
  it("reads the signed-in user and waits while signed out", async () => {
    const api = createFakeApi({ "GET /v1/me": ok(buildMe()) });
    const signedOut = renderClientHook(() => useMe(), { api, session: createRecordingSession({ status: "signed-out", reason: "none" }) });
    expect(signedOut.result.current.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);

    const { result } = renderClientHook(() => useMe(), { api });
    await waitFor(() => expect(result.current.data?.email).toBe("ana@example.com"));
    expect(api.calls[0]?.headers.get("authorization")).toBe(`Bearer token-${IDS.user}`);
  });

  it("merges the cursor pages of my organizations under the user's keys", async () => {
    const second = buildOrganization({ id: IDS.otherOrganization, name: "Contoso" });
    const api = createFakeApi({
      "GET /v1/me/organizations": (request) => (request.query.get("cursor") === "c2" ? page([second]) : page([buildOrganization()], { cursor: "c2" })),
    });
    const { result, queryClient } = renderClientHook(() => useMyOrganizations(), { api });
    await waitFor(() => expect(result.current.data?.map((organization) => organization.name)).toEqual(["Northwind"]));
    expect(result.current.hasNextPage).toBe(true);
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.map((organization) => organization.name)).toEqual(["Northwind", "Contoso"]));
    expect(result.current.hasNextPage).toBe(false);
    expect(api.calls.map((call) => call.query)).toEqual(["?limit=100", "?limit=100&cursor=c2"]);
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey.slice(0, 2)).toEqual(["me", "organizations"]);
  });

  it("resolves the access context of the URL node, keyed under the organization, and surfaces a 404", async () => {
    const api = createFakeApi({ "GET /v1/me/context": ok(buildAccessContext({ project: {} })) });
    const { result, queryClient } = renderClientHook(
      () => {
        const node = useCurrentNode();
        return { node, context: useAccessContext(node) };
      },
      { api, path: `/o/${IDS.organization}/p/${IDS.project}?unit=${IDS.unit}` },
    );
    expect(result.current.node).toEqual({ organizationId: IDS.organization, projectId: IDS.project, unitId: IDS.unit });
    await waitFor(() => expect(result.current.context.data?.project?.name).toBe("Launch"));
    expect(api.calls[0]?.query).toBe(`?organizationId=${IDS.organization}&projectId=${IDS.project}&unitId=${IDS.unit}`);
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey.slice(0, 2)).toEqual(["organizations", IDS.organization]);

    const hidden = renderClientHook(() => useAccessContext({ organizationId: IDS.otherOrganization }), { api: createFakeApi({ "GET /v1/me/context": apiError(404, "NOT_FOUND") }) });
    await waitFor(() => expect(hidden.result.current.error).toMatchObject({ status: 404, code: "NOT_FOUND" }));
  });

  it("has no node outside an organization", () => {
    const { result } = renderClientHook(() => useCurrentNode(), { path: "/profile/account" });
    expect(result.current).toBeNull();
  });
});

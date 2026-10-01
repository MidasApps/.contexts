import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, createFakeApi, ok, page } from "#/shared/testing/fake-api.ts";
import { buildProject, IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook } from "#/shared/testing/render-client.tsx";
import { projectKeys, useProject, useProjects } from "./index.ts";

describe("project entity", () => {
  it("merges project pages under the organization's key", async () => {
    const other = buildProject({ id: IDS.otherProject, name: "Beta" });
    const api = createFakeApi({
      [`GET /v1/organizations/${IDS.organization}/projects`]: (request) =>
        request.query.get("cursor") === "next" ? page([other]) : page([buildProject()], { cursor: "next" }),
    });
    const { result, queryClient } = renderClientHook(() => useProjects(IDS.organization), { api });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.map((project) => project.name)).toEqual(["Launch", "Beta"]));
    const [key] = queryClient.getQueryCache().getAll().map((query) => query.queryKey);
    expect(key?.slice(0, 3)).toEqual(["organizations", IDS.organization, "projects"]);
    expect(projectKeys.all(IDS.organization)).toEqual(key?.slice(0, 3));
  });

  it("reads one project (keyed by organization) and returns null when hidden", async () => {
    const api = createFakeApi({
      [`GET /v1/projects/${IDS.project}`]: ok(buildProject()),
      [`GET /v1/projects/${IDS.otherProject}`]: apiError(404, "NOT_FOUND"),
    });
    const visible = renderClientHook(() => useProject({ organizationId: IDS.organization, projectId: IDS.project }), { api });
    await waitFor(() => expect(visible.result.current.data?.name).toBe("Launch"));
    expect(visible.queryClient.getQueryData(projectKeys.detail(IDS.organization, IDS.project))).toMatchObject({ id: IDS.project });

    const hidden = renderClientHook(() => useProject({ organizationId: IDS.organization, projectId: IDS.otherProject }), { api });
    await waitFor(() => expect(hidden.result.current.isSuccess).toBe(true));
    expect(hidden.result.current.data).toBeNull();

    const idle = renderClientHook(() => useProject({ organizationId: IDS.organization, projectId: undefined }), { api });
    expect(idle.result.current.fetchStatus).toBe("idle");
  });
});

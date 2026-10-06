import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, createFakeApi, ok, page } from "#/shared/testing/fake-api.ts";
import { buildUnit, IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook, renderWithClient } from "#/shared/testing/render-client.tsx";
import {
  buildUnitTree,
  UnitBreadcrumb,
  unitKeys,
  unitPathIn,
  useUnitPath,
  useUnits,
  useUnitTree,
  useUnitTypes,
} from "./index.ts";

const node = { organizationId: IDS.organization, projectId: IDS.project };
const site = buildUnit({ id: "site-1", name: "Site B", type: "sample.site" });
const siteA = buildUnit({ id: "site-0", name: "Site A", type: "sample.site" });
const floor = buildUnit({ id: "floor-1", name: "Floor 2", ancestorIds: ["site-1"] });
const room = buildUnit({ id: "room-1", name: "Room 101", ancestorIds: ["site-1", "floor-1"] });

const treeApi = () =>
  createFakeApi({
    [`GET /v1/projects/${IDS.project}/units`]: (request) => {
      const parent = request.query.get("parentUnitId");
      if (parent === null) return request.query.get("cursor") === "p2" ? page([siteA]) : page([site], { cursor: "p2" });
      if (parent === "site-1") return page([floor]);
      if (parent === "floor-1") return page([room]);
      return page([]);
    },
  });

describe("unit entity", () => {
  it("reads every page of a parent's children under the organization's key", async () => {
    const api = treeApi();
    const { result, queryClient } = renderClientHook(() => useUnits(node), { api });
    await waitFor(() => expect(result.current.data?.map((unit) => unit.name)).toEqual(["Site B", "Site A"]));
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toEqual(
      unitKeys.children(IDS.organization, IDS.project, undefined),
    );
    expect(unitKeys.all(IDS.organization).slice(0, 2)).toEqual(["organizations", IDS.organization]);
  });

  it("loads the whole tree level by level and nests it by name", async () => {
    const api = treeApi();
    const { result } = renderClientHook(() => useUnitTree(node), { api });
    await waitFor(() => expect(result.current.data).toHaveLength(4));
    const tree = buildUnitTree(result.current.data ?? [], "pt-BR");
    expect(tree.map((item) => item.label)).toEqual(["Site A", "Site B"]);
    expect(tree[1]?.children?.[0]?.children?.[0]?.label).toBe("Room 101");
    expect(unitPathIn(result.current.data ?? [], "room-1").map((unit) => unit.name)).toEqual([
      "Site B",
      "Floor 2",
      "Room 101",
    ]);
    expect(unitPathIn(result.current.data ?? [], "missing")).toEqual([]);
  });

  it("names a unit's ancestors (hidden ones stay null) and lists unit types", async () => {
    const api = createFakeApi({
      "GET /v1/units/site-1": ok(site),
      "GET /v1/units/floor-1": apiError(404, "NOT_FOUND"),
      "GET /v1/unit-types": page([
        { id: "sample.site", labelKey: "sample.unitTypes.site", allowedParents: ["project"] },
      ]),
    });
    const { result } = renderClientHook(
      () => ({ path: useUnitPath(IDS.organization, room as never), types: useUnitTypes() }),
      { api },
    );
    await waitFor(() =>
      expect(result.current.path.map((segment) => segment.name)).toEqual(["Site B", null, "Room 101"]),
    );
    await waitFor(() => expect(result.current.types.data?.[0]?.id).toBe("sample.site"));
  });

  it("renders a unit path as phrasing content with spoken separators", async () => {
    const { container } = renderWithClient(
      <button type="button">
        <UnitBreadcrumb
          path={[
            { id: "a", name: "Site B" },
            { id: "b", name: null },
            { id: "c", name: "Room 101" },
          ]}
        />
      </button>,
    );
    expect(screen.getByRole("button").textContent).toBe("Site B, Unidade restrita, Room 101");
    await expectNoAxeViolations(container);
  });
});

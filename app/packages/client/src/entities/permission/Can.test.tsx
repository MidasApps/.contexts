import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, createFakeApi, ok } from "#/shared/testing/fake-api.ts";
import { buildAccessContext, IDS } from "#/shared/testing/fixtures.ts";
import { renderClientHook, renderWithClient } from "#/shared/testing/render-client.tsx";
import { Can, useCan, usePermissions } from "./index.ts";

const contextApi = () => createFakeApi({ "GET /v1/me/context": ok(buildAccessContext({ permissions: ["core.organization.read", "core.project.create"] })) });

describe("Can", () => {
  it("renders children only with the permission, the fallback otherwise, nothing while loading", async () => {
    const { container } = renderWithClient(
      <ul>
        <Can permission="core.project.create" pending={<li>carregando</li>}>
          <li>
            <button type="button">Criar projeto</button>
          </li>
        </Can>
        <Can permission="core.member.invite" fallback={<li>sem acesso</li>}>
          <li>
            <button type="button">Convidar</button>
          </li>
        </Can>
      </ul>,
      { api: contextApi(), path: `/o/${IDS.organization}` },
    );
    expect(screen.getByText("carregando")).toBeDefined();
    expect(await screen.findByRole("button", { name: "Criar projeto" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Convidar" })).toBeNull();
    expect(screen.getByText("sem acesso")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("denies everything outside an organization and while the context failed", async () => {
    const outside = renderClientHook(() => usePermissions(), { path: "/profile/account" });
    expect(outside.result.current.status).toBe("success");
    expect(outside.result.current.can("core.organization.read")).toBe(false);

    const failing = renderClientHook(() => usePermissions(), { api: createFakeApi({ "GET /v1/me/context": apiError(500, "INTERNAL_ERROR") }), path: `/o/${IDS.organization}` });
    await waitFor(() => expect(failing.result.current.status).toBe("error"));
    expect(failing.result.current.can("core.organization.read")).toBe(false);
  });

  it("checks an explicit node instead of the URL", async () => {
    const api = contextApi();
    const { result } = renderClientHook(() => useCan("core.project.create", { organizationId: IDS.otherOrganization }), { api, path: "/organizations" });
    await waitFor(() => expect(result.current).toBe(true));
    expect(api.calls[0]?.query).toBe(`?organizationId=${IDS.otherOrganization}`);
  });
});

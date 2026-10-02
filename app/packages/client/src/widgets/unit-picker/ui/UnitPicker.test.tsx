import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { withUnit } from "../model/unit-route.ts";
import { UnitPicker } from "./UnitPicker.tsx";

const PROJECT = `/o/${IDS.organization}/p/${IDS.project}`;

describe("UnitPicker", () => {
  it("writes ?unit= on the current module page, keeping its sub-path, and clears it for the whole project", async () => {
    const { user, router } = renderWidget(<UnitPicker />, { path: `${PROJECT}/m/sample/items/7` });
    await user.click(await screen.findByRole("button", { name: "Unidade: Projeto inteiro. Escolher unidade" }));
    const tree = await screen.findByRole("tree", { name: "Unidades de Launch" });
    await expectNoAxeViolations(document.body);
    await user.click(within(tree).getByRole("treeitem", { name: "Site A" }));
    await waitFor(() => expect(router.current()).toBe(`${PROJECT}/m/sample/items/7?unit=site-1`));
    await user.click(await screen.findByRole("button", { name: /^Unidade: Site A/u }));
    await user.click(await screen.findByRole("button", { name: "Projeto inteiro" }));
    await waitFor(() => expect(router.current()).toBe(`${PROJECT}/m/sample/items/7`));
  });

  it("shows the empty and error states inside the popover", async () => {
    const empty = renderWidget(<UnitPicker />, { path: PROJECT, routes: { "GET /v1/projects/:projectId/units": page([]) } });
    await empty.user.click(await screen.findByRole("button", { name: "Unidade: Projeto inteiro. Escolher unidade" }));
    expect(await screen.findByRole("heading", { name: "Nenhuma unidade neste projeto" })).toBeDefined();
    await expectNoAxeViolations(document.body);
    empty.unmount();

    const failing = renderWidget(<UnitPicker />, { path: PROJECT, routes: { "GET /v1/projects/:projectId/units": apiError(403, "FORBIDDEN") } });
    await failing.user.click(await screen.findByRole("button", { name: "Unidade: Projeto inteiro. Escolher unidade" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Você não tem permissão para fazer isso.");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeDefined();
  });

  it("opens below the trigger and within the screen on phones", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { user } = renderWidget(<UnitPicker />, { path: PROJECT, routes: { "GET /v1/projects/:projectId/units": page([]) } });
      await user.click(await screen.findByRole("button", { name: "Unidade: Projeto inteiro. Escolher unidade" }));
      const popover = await screen.findByRole("dialog", { name: "Escolha uma unidade" });
      expect(popover.getAttribute("data-side")).toBe("bottom");
      expect(popover.className).toContain("w-[min(20rem,calc(100vw-2rem))]");
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });

  it("is hidden without core.unit.read or outside a project", async () => {
    const { container } = renderWidget(<UnitPicker />, { path: PROJECT, permissions: ["core.project.read"] });
    await screen.findByRole("main");
    expect(container.querySelector("[data-slot=sidebar-menu]")).toBeNull();
    expect(withUnit({ organizationId: "o" }, "u")).toBeNull();
    expect(withUnit({ organizationId: "o", projectId: "p" }, "u")).toEqual({ id: "project", organizationId: "o", projectId: "p", unit: "u" });
  });
});

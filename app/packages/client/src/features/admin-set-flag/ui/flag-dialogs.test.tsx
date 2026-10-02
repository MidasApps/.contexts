import { FeatureFlagSchema } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildExpiredFlag, buildFeatureFlag } from "#/shared/testing/admin-governance-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { ClearFlagOverrideDialog, type FlagOverrideTarget } from "./ClearFlagOverrideDialog.tsx";
import { SetFlagDialog, type FlagChange } from "./SetFlagDialog.tsx";

const KILL = FeatureFlagSchema.parse(buildFeatureFlag());
const VOICE = FeatureFlagSchema.parse(buildExpiredFlag());
const NORTHWIND = { id: IDS.organization, name: "Northwind" };

function SetHarness({ change }: { change: FlagChange }) {
  const [open, setOpen] = useState<FlagChange | null>(change);
  return <SetFlagDialog change={open} onOpenChange={(next) => !next && setOpen(null)} />;
}

function ClearHarness({ target }: { target: FlagOverrideTarget }) {
  const [open, setOpen] = useState<FlagOverrideTarget | null>(target);
  return <ClearFlagOverrideDialog target={open} onOpenChange={(next) => !next && setOpen(null)} />;
}

afterEach(() => setOnline(true));

describe("SetFlagDialog", () => {
  it("turns a kill-switch on for one organization through a destructive confirmation", async () => {
    const held = holdResponse();
    const { user, api, container } = renderAdmin(<SetHarness change={{ flag: KILL, value: true, organization: NORTHWIND }} />, {
      routes: { "PUT /v1/admin/flags/:flagKey": held.handler },
    });
    const dialog = await screen.findByRole("alertdialog", { name: "Ligar ai.kill-switch?" });
    expect(dialog.textContent).toContain("interrompe o que ele descreve para Northwind");
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Ligar" }).getAttribute("aria-busy")).toBe("true"));
    held.release(ok(buildFeatureFlag({ value: true, tenantOverride: true })));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ value: true, tenantId: IDS.organization });
    expect(await screen.findByText("ai.kill-switch ligada.")).toBeDefined();
  });

  it("sets the environment value without a tenant and shows a failure with its reference", async () => {
    const { user, api } = renderAdmin(<SetHarness change={{ flag: VOICE, value: false }} />, { routes: { "PUT /v1/admin/flags/:flagKey": apiError(403, "FORBIDDEN") } });
    const dialog = await screen.findByRole("alertdialog", { name: "Desligar chat.voice?" });
    expect(dialog.textContent).toContain("Vale para todo o ambiente");
    await user.click(within(dialog).getByRole("button", { name: "Desligar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ value: false });
  });

  it("holds the change while offline", async () => {
    renderAdmin(<SetHarness change={{ flag: VOICE, value: false }} />);
    const dialog = await screen.findByRole("alertdialog");
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Desligar" }).disabled).toBe(true));
  });
});

describe("ClearFlagOverrideDialog", () => {
  it("removes the override of the organization after the confirmation and says so", async () => {
    const { user, api } = renderAdmin(<ClearHarness target={{ flag: VOICE, organization: NORTHWIND }} />, {
      routes: { "DELETE /v1/admin/flags/:flagKey/overrides/:organizationId": ok(buildExpiredFlag({ tenantOverride: null })) },
    });
    const dialog = await screen.findByRole("alertdialog", { name: "Remover o ajuste de chat.voice?" });
    expect(dialog.textContent).toContain("Northwind volta a seguir o valor do ambiente");
    await user.click(within(dialog).getByRole("button", { name: "Remover ajuste" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).toContain(`DELETE /v1/admin/flags/chat.voice/overrides/${IDS.organization}`);
    expect(await screen.findByText("Ajuste de chat.voice removido.")).toBeDefined();
  });

  it("keeps the dialog open with the reference when the removal fails, and holds it offline", async () => {
    const { user } = renderAdmin(<ClearHarness target={{ flag: VOICE, organization: NORTHWIND }} />, {
      routes: { "DELETE /v1/admin/flags/:flagKey/overrides/:organizationId": apiError(502, "UPSTREAM_UNAVAILABLE") },
    });
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remover ajuste" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    setOnline(false);
    await waitFor(() => expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Remover ajuste" }).disabled).toBe(true));
  });
});

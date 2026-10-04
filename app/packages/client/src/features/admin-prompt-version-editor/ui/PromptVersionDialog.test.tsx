import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildPromptVersion } from "#/shared/testing/admin-agents-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { PromptVersionDialog } from "./PromptVersionDialog.tsx";

const CREATE = "POST /v1/admin/agents/:agentId/prompt-versions";
const ACTIVE = "Você é o assistente.";

function Harness({ onCreated }: { onCreated?: (version: { version: number }) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <PromptVersionDialog
      agentId="assistant"
      agentName="Assistente"
      initialBody={ACTIVE}
      open={open}
      onOpenChange={setOpen}
      onCreated={onCreated}
    />
  );
}

const bodyField = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: /Texto do prompt/u });

afterEach(() => setOnline(true));

describe("PromptVersionDialog", () => {
  it("writes a new version from the active text with its note, pending until the API answers", async () => {
    const held = holdResponse();
    const onCreated = vi.fn();
    const { user, api, container } = renderAdmin(<Harness onCreated={onCreated} />, {
      routes: { [CREATE]: held.handler },
    });
    const dialog = await screen.findByRole("dialog", { name: "Nova versão do prompt de Assistente" });
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.type(bodyField(dialog), " Responda em português.");
    await user.type(within(dialog).getByRole("textbox", { name: /Nota/u }), "  tom  ");
    const submit = within(dialog).getByRole("button", { name: "Criar versão" });
    await user.click(submit);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    held.release(ok(buildPromptVersion({ version: 3 }), 201));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Versão 3 criada.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      body: `${ACTIVE} Responda em português.`,
      note: "tom",
    });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }));
  });

  it("refuses the active text unchanged before calling the API", async () => {
    const { user, api } = renderAdmin(<Harness />);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Criar versão" }));
    expect(await within(dialog).findByText(/O texto é igual ao da versão ativa/u)).toBeDefined();
    expect(document.activeElement).toBe(bodyField(dialog));
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("keeps the dialog and the text when the API fails, with the reference", async () => {
    const { user } = renderAdmin(<Harness />, { routes: { [CREATE]: apiError(409, "CONFLICT") } });
    const dialog = await screen.findByRole("dialog");
    await user.type(bodyField(dialog), "!");
    await user.click(within(dialog).getByRole("button", { name: "Criar versão" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    expect((bodyField(dialog) as HTMLTextAreaElement).value).toBe(`${ACTIVE}!`);
  });

  it("holds the save while offline and says why", async () => {
    const { user, api } = renderAdmin(<Harness />, { routes: { [CREATE]: ok(buildPromptVersion()) } });
    const dialog = await screen.findByRole("dialog");
    await user.type(bodyField(dialog), "!");
    setOnline(false);
    await waitFor(() =>
      expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Criar versão" }).disabled).toBe(true),
    );
    expect(within(dialog).getByText(/Você está sem conexão/u)).toBeDefined();
    await user.type(within(dialog).getByRole("textbox", { name: /Nota/u }), "{Enter}");
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });
});

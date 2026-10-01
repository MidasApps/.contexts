import type { UploadInstructions } from "@core/contracts";
import { configure, fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildStoredFile, buildUploadTicket, KNOWLEDGE_IDS, UPLOAD_URL } from "#/entities/knowledge/knowledge.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import type { SendBytes } from "../model/upload-knowledge-file.ts";
import { AddKnowledgeDocumentDialog, type StartedKnowledgeIngestion } from "./AddKnowledgeDocumentDialog.tsx";

// Sibling test runs load the machine: the shell boot alone can take seconds, so waits and tests get room.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 60_000 });

const RUN_ID = "run-knowledge-1";
const noWait = (): Promise<void> => Promise.resolve();

type Sent = { upload: UploadInstructions; size: number };

function Harness({ sendBytes, projectId, fileAllowed }: { sendBytes: SendBytes; projectId: string | undefined; fileAllowed: boolean | undefined }) {
  const [open, setOpen] = useState(true);
  const [started, setStarted] = useState<StartedKnowledgeIngestion | null>(null);
  return (
    <main>
      <AddKnowledgeDocumentDialog
        organizationId={IDS.organization}
        target={{ projectId, label: projectId === undefined ? "Organização inteira" : "Projeto Alpha" }}
        open={open}
        onOpenChange={setOpen}
        onAdded={setStarted}
        sendBytes={sendBytes}
        wait={noWait}
        fileAllowed={fileAllowed}
      />
      {started === null ? null : <p>{`started ${started.runId} ${started.sourceRef} ${started.projectId ?? "organization"}`}</p>}
    </main>
  );
}

const setup = (routes: FakeRoutes, options: { accepted?: boolean; projectId?: string; fileAllowed?: boolean } = {}) => {
  const sent: Sent[] = [];
  const sendBytes: SendBytes = (upload, file) => {
    sent.push({ upload, size: file.size });
    return Promise.resolve(options.accepted ?? true);
  };
  const view = renderApp(<Harness sendBytes={sendBytes} projectId={options.projectId} fileAllowed={options.fileAllowed} />, {
    path: `/o/${IDS.organization}/settings/knowledge`,
    routes: shellRoutes(["core.organization.read", "core.knowledge.read", "core.knowledge.write", "core.file.upload"], routes),
  });
  return { ...view, sent };
};

const markdown = (): File => new File(["# Guide\n\nHi"], "guide.md", { type: "" });

describe("AddKnowledgeDocumentDialog", () => {
  it("uploads a file through the signed URL, waits for validation and starts the indexing for the project", async () => {
    const requests: FakeRequest[] = [];
    let polls = 0;
    const { user, sent } = setup(
      {
        "POST /v1/organizations/:organizationId/files": (request) => {
          requests.push(request);
          return ok(buildUploadTicket(), 201);
        },
        "GET /v1/files/:fileId": () => {
          polls += 1;
          return ok(buildStoredFile(polls === 1 ? { status: "pending" } : {}));
        },
        "POST /v1/organizations/:organizationId/knowledge/sources": (request) => {
          requests.push(request);
          return ok({ runId: RUN_ID }, 202);
        },
      },
      { projectId: IDS.project },
    );
    const dialog = await screen.findByRole("dialog", { name: "Adicionar documento" });
    expect(within(dialog).getByText(/coleção "Projeto Alpha"/u)).toBeDefined();
    await expectNoAxeViolations(dialog);
    await user.upload(within(dialog).getByLabelText("Arquivo", { selector: "input" }), markdown());
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText(`started ${RUN_ID} ${KNOWLEDGE_IDS.file} ${IDS.project}`)).toBeDefined();
    const [upload, source] = requests;
    expect(upload?.params["organizationId"]).toBe(IDS.organization);
    expect(upload?.body).toEqual({ purpose: "knowledge", fileName: "guide.md", contentType: "text/markdown", sizeBytes: 11 });
    // The storage boundary cannot be called in a test: the bytes must go to the ticket's URL with its method and headers, unchanged.
    expect(sent).toEqual([{ upload: { method: "PUT", url: UPLOAD_URL, headers: { "content-type": "text/markdown", "x-goog-content-length-range": "0,12" }, expiresAt: "2026-09-29T14:45:00.000Z" }, size: 11 }]);
    expect(polls).toBe(2);
    expect(source?.params["organizationId"]).toBe(IDS.organization);
    expect(source?.query.get("projectId")).toBe(IDS.project);
    expect(source?.body).toEqual({ kind: "file", fileId: KNOWLEDGE_IDS.file });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows why the server rejected the uploaded file and starts no indexing", async () => {
    let sources = 0;
    const { user } = setup({
      "POST /v1/organizations/:organizationId/files": ok(buildUploadTicket(), 201),
      "GET /v1/files/:fileId": ok(buildStoredFile({ status: "rejected", rejectionReason: "CONTENT_MISMATCH" })),
      "POST /v1/organizations/:organizationId/knowledge/sources": () => {
        sources += 1;
        return ok({ runId: RUN_ID }, 202);
      },
    });
    const dialog = await screen.findByRole("dialog", { name: "Adicionar documento" });
    await user.upload(within(dialog).getByLabelText("Arquivo", { selector: "input" }), markdown());
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("O conteúdo do arquivo não corresponde ao tipo informado.");
    expect(sources).toBe(0);
  });

  it("refuses a file type the knowledge base does not accept before any request", async () => {
    const { user, api } = setup({});
    const dialog = await screen.findByRole("dialog", { name: "Adicionar documento" });
    // The picker filter (`accept`) is only a hint: a user can still choose another type, so the change is fired directly.
    fireEvent.change(within(dialog).getByLabelText("Arquivo", { selector: "input" }), { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect(await within(dialog).findByText("Este tipo de arquivo não é aceito.")).toBeDefined();
    expect(api.callLines().filter((line) => line.startsWith("POST"))).toEqual([]);
  });

  it("reports a storage failure", async () => {
    const { user } = setup({ "POST /v1/organizations/:organizationId/files": ok(buildUploadTicket(), 201) }, { accepted: false });
    const dialog = await screen.findByRole("dialog", { name: "Adicionar documento" });
    await user.upload(within(dialog).getByLabelText("Arquivo", { selector: "input" }), markdown());
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Não foi possível enviar o arquivo.");
  });

  it("adds a public https page for the organization and refuses other addresses", async () => {
    const requests: FakeRequest[] = [];
    const { user } = setup({
      "POST /v1/organizations/:organizationId/knowledge/sources": (request) => {
        requests.push(request);
        return ok({ runId: RUN_ID }, 202);
      },
    });
    const dialog = await screen.findByRole("dialog", { name: "Adicionar documento" });
    await user.click(within(dialog).getByRole("tab", { name: "Página da web" }));
    const address = within(dialog).getByRole("textbox", { name: "Endereço da página" });
    await user.type(address, "http://docs.example.com/guide");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect(await within(dialog).findByText("Informe um endereço completo que comece com https://.")).toBeDefined();
    expect(requests).toEqual([]);

    await user.clear(address);
    await user.type(address, "https://docs.example.com/guide");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByText(`started ${RUN_ID} https://docs.example.com/guide organization`)).toBeDefined();
    expect(requests[0]?.body).toEqual({ kind: "url", url: "https://docs.example.com/guide" });
    expect(requests[0]?.query.get("projectId")).toBeNull();
  });

  it("shows the API error of a refused source and offers only web pages without the upload permission", async () => {
    const { user } = setup({ "POST /v1/organizations/:organizationId/knowledge/sources": apiError(403, "FORBIDDEN") }, { fileAllowed: false });
    const dialog = await screen.findByRole("dialog", { name: "Adicionar documento" });
    expect(within(dialog).getByRole("tab", { name: "Arquivo" }).hasAttribute("disabled")).toBe(true);
    expect(within(dialog).getByText(/Você não tem permissão para enviar arquivos/u)).toBeDefined();
    await user.type(within(dialog).getByRole("textbox", { name: "Endereço da página" }), "https://docs.example.com/guide");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Você não tem permissão para fazer isso.");
  });
});

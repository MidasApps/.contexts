import { screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerativeUiView } from "#/entities/message/index.ts";
import { ErrorReporterProvider } from "#/shared/lib/errors/error-reporter.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { GenerativeUiProvider, type GenerativeUiProviderProps } from "../model/generative-ui-context.tsx";
import { createUiRegistry, uiEntry } from "../model/ui-registry.ts";
import { CreateTestNoteContract, NOTE_FORM_UI, TEST_NOTE_MESSAGES } from "../testing/note-contract.fixture.ts";
import { CORE_UI_COMPONENTS } from "./core-components.ts";
import { GenerativePart, GenerativeUiError, type GenerativePartProps } from "./generative-part.tsx";

const FALLBACK = <p>visão genérica da ferramenta</p>;

const setup = (ui: GenerativeUiView, options: { part?: Partial<GenerativePartProps>; provider?: Partial<GenerativeUiProviderProps> } = {}) => {
  const submit = vi.fn<GenerativeUiProviderProps["submit"]>();
  const reportError = vi.fn();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const tree = (extra: Partial<GenerativePartProps> = {}): ReactElement => (
    <ErrorReporterProvider reportError={reportError}>
      <GenerativeUiProvider registry={createUiRegistry(CORE_UI_COMPONENTS)} contracts={[CreateTestNoteContract]} submit={submit} {...options.provider}>
        <GenerativePart ui={ui} toolCallId="call-1" toolName="catalog_renderForm" interactive fallback={FALLBACK} {...options.part} {...extra} />
      </GenerativeUiProvider>
    </ErrorReporterProvider>
  );
  const view = renderWithProviders(tree(), { extraMessages: TEST_NOTE_MESSAGES });
  return { ...view, submit, reportError, consoleError, tree };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GenerativePart", () => {
  it("shows the generic tool view for an unknown component and reports it once, without the console", async () => {
    const { reportError, consoleError, rerender, tree } = setup({ component: "iframe", props: { src: "https://evil.test/?secret=1" } });
    expect(screen.getByText("visão genérica da ferramenta")).toBeTruthy();
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    rerender(tree());
    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, context] = reportError.mock.calls[0] as [GenerativeUiError, { operation: string }];
    expect(error).toBeInstanceOf(GenerativeUiError);
    expect(error.code).toBe("UNKNOWN_UI_COMPONENT");
    expect(context).toEqual({ operation: "chat_generative_ui" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows the generic tool view for invalid props and never puts the props in the report", async () => {
    const { reportError, consoleError } = setup({ component: "picker", props: { options: [{ value: "a", label: "Ana Souza 123.456.789-00" }], multiple: "yes" } });
    expect(screen.getByText("visão genérica da ferramenta")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    const [error] = reportError.mock.calls[0] as [GenerativeUiError];
    expect(error.code).toBe("INVALID_UI_PROPS");
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain("Ana Souza");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("falls back and reports when a component fails while rendering", async () => {
    const Broken = (): never => {
      throw new Error("render failed");
    };
    const registry = createUiRegistry(CORE_UI_COMPONENTS, { broken: uiEntry({ schema: CreateTestNoteContract.schema, Component: Broken }) });
    const { reportError } = setup({ component: "broken", props: { title: "x" } }, { provider: { registry } });
    expect(await screen.findByText("visão genérica da ferramenta")).toBeTruthy();
    expect((reportError.mock.calls[0] as [GenerativeUiError])[0].code).toBe("UI_COMPONENT_FAILED");
  });

  it("renders the form of a command and submits the values validated by its contract", async () => {
    const { user, submit, container } = setup(NOTE_FORM_UI);
    const form = screen.getByRole("form", { name: "Formulário: testnotes.CreateNoteCommand" });
    const title = within(form).getByRole<HTMLInputElement>("textbox", { name: /Título/ });
    expect(title.value).toBe("Kickoff");
    await expectNoAxeViolations(container);

    await user.clear(title);
    await user.click(within(form).getByRole("button", { name: "Enviar" }));
    expect(submit).not.toHaveBeenCalled();
    expect(title.getAttribute("aria-invalid")).toBe("true");

    await user.type(title, "  Reunião de abertura  ");
    await user.type(within(form).getByRole("textbox", { name: /Texto/ }), "Pauta.");
    await user.click(within(form).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      { kind: "schema-form", commandId: "testnotes.CreateNoteCommand", contractId: "testnotes.Note", mode: "create", values: { title: "Reunião de abertura", body: "Pauta." } },
      { toolCallId: "call-1", toolName: "catalog_renderForm" },
    );
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(screen.getByText("Formulário enviado. O assistente pede confirmação antes de salvar.")).toBeTruthy();
  });

  it("does not offer the form of an older turn again", () => {
    setup(NOTE_FORM_UI, { part: { interactive: false } });
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByText("Formulário: testnotes.CreateNoteCommand")).toBeTruthy();
  });

  it("shows the generic tool view when the client has no contract for the form", () => {
    setup({ component: "schema-form", props: { ...NOTE_FORM_UI.props, commandId: "other.UnknownCommand", contractId: "other.Unknown" } });
    expect(screen.getByText("visão genérica da ferramenta")).toBeTruthy();
  });

  it("renders a read-only table with typed cells and says when it is truncated", async () => {
    const { container } = setup({
      component: "data-table",
      props: {
        columns: [
          { key: "name", type: "text" },
          { key: "units", type: "number" },
          { key: "active", type: "boolean" },
          { key: "total", type: "money" },
          { key: "html", type: "text" },
        ],
        rows: [{ name: "Norte", units: 1234.5, active: true, total: { amountMinor: 123456, currency: "BRL" }, html: "<img src=x onerror=alert(1)>" }],
        truncated: true,
      },
    });
    const table = screen.getByRole("table", { name: "Resultado" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["name", "units", "active", "total", "html"]);
    expect(within(table).getByText("1.234,5")).toBeTruthy();
    expect(within(table).getByText("Sim")).toBeTruthy();
    expect(within(table).getByText(/R\$\s1\.234,56/)).toBeTruthy();
    expect(within(table).getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Mostrando as primeiras 1 linha. Há mais resultados.")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("returns a single choice", async () => {
    const { user, submit, container } = setup({ component: "picker", props: { options: [{ value: "north", label: "Norte" }, { value: "south", label: "Sul" }], multiple: false } }, { part: { toolName: "ask_region" } });
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Confirmar escolha" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Escolha ao menos uma opção.");
    await user.click(screen.getByRole("radio", { name: "Sul" }));
    await user.click(screen.getByRole("button", { name: "Confirmar escolha" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ kind: "picker", values: ["south"], labels: ["Sul"] }, { toolCallId: "call-1", toolName: "ask_region" }));
    expect(await screen.findByText("Escolha enviada.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar escolha" })).toBeNull();
  });

  it("returns several choices in the order of the options", async () => {
    const { user, submit, container } = setup({ component: "picker", props: { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }], multiple: true } });
    await user.click(screen.getByRole("checkbox", { name: "C" }));
    await user.click(screen.getByRole("checkbox", { name: "A" }));
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Confirmar escolha" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ kind: "picker", values: ["a", "c"], labels: ["A", "C"] }, expect.anything()));
  });

  it("shows a change as a before/after table", async () => {
    const { container } = setup({ component: "approval-diff", props: { before: { name: "Launch", budget: 10 }, after: { name: "Relaunch", budget: 10 }, fields: ["name"] } });
    const table = screen.getByRole("table", { name: "Alterações propostas" });
    const row = within(table).getByRole("row", { name: /name/ });
    expect(within(row).getByText("Launch")).toBeTruthy();
    expect(within(row).getByText("Relaunch")).toBeTruthy();
    expect(within(table).queryByText("budget")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("links a pending four-eyes approval to the approvals inbox", async () => {
    const { container } = setup({ component: "approval-pending", props: { approvalId: "Ap3rQ9vLr3TnB7pWc1aZ", summary: "Arquivar nota Kickoff" } });
    expect(screen.getByText("Arquivar nota Kickoff")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir aprovações" }).getAttribute("href")).toBe("/approvals/Ap3rQ9vLr3TnB7pWc1aZ");
    await expectNoAxeViolations(container);
  });

  it("uses the href the app builds for the approvals inbox", () => {
    setup({ component: "approval-pending", props: { approvalId: "ap 1", summary: "x" } }, { provider: { approvalHref: (id) => `/pt-BR/o/org/approvals/${encodeURIComponent(id)}` } });
    expect(screen.getByRole("link", { name: "Abrir aprovações" }).getAttribute("href")).toBe("/pt-BR/o/org/approvals/ap%201");
  });

  it.each(["bar", "line", "area", "pie"] as const)("draws a %s chart with its data in a table", { timeout: 40_000 }, async (kind) => {
    const { container } = setup({ component: "chart", props: { kind, x: "month", series: [{ key: "total", label: "Total" }], rows: [{ month: "2026-08", total: 42 }, { month: "2026-09", total: "17.5" }, { month: "2026-10", total: "n/a" }] } });
    // The chart part loads on first use; the first import of recharts is slow under jsdom.
    const figure = await screen.findByRole("figure", undefined, { timeout: 30_000 });
    expect(within(figure).getByText(/^Gráfico de .+: Total$/)).toBeTruthy();
    const table = within(figure).getByRole("table", { name: "Dados do gráfico" });
    expect(within(table).getByRole("row", { name: /2026-08/ }).textContent).toContain("42");
    expect(within(table).getByRole("row", { name: /2026-09/ }).textContent).toContain("17,5");
    expect(within(table).getByRole("row", { name: /2026-10/ }).textContent).toContain("—");
    await expectNoAxeViolations(container);
  });
});

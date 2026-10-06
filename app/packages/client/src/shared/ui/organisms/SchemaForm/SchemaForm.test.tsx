import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { setOnline } from "#/shared/testing/network.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SchemaForm, type SchemaFormProps } from "./SchemaForm.tsx";
import { FIXTURE_MESSAGES, FixtureNoteContract, type FixtureNoteSchema } from "./schema-form.fixture.ts";
import type { SchemaFormResult } from "./server-errors.ts";

type Props = Partial<SchemaFormProps<typeof FixtureNoteSchema>>;

const ok = (): Promise<SchemaFormResult> => Promise.resolve({ ok: true });

/** Typed with the submitted values so tests can read `mock.calls[0][0]`. */
const submitSpy = () => vi.fn<(values: unknown) => Promise<SchemaFormResult>>(ok);

const renderForm = (props: Props = {}) =>
  renderWithProviders(
    <SchemaForm
      contract={FixtureNoteContract}
      defaultValues={{ id: "note-1" }}
      onSubmit={props.onSubmit ?? ok}
      can={() => false}
      defaultCurrency="BRL"
      submitLabelKey="fixture.submit"
      aria-label="Nota"
      {...props}
    />,
    { extraMessages: FIXTURE_MESSAGES, timeZone: "America/Sao_Paulo" },
  );

const submitButton = () => screen.getByRole("button", { name: "Salvar nota" });

const fillValidNote = async (user: ReturnType<typeof renderForm>["user"]) => {
  await user.type(screen.getByRole("textbox", { name: /^Título/ }), "Fornecedor");
  screen.getByRole("combobox", { name: /^Prioridade/ }).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("option", { name: "Alta" }));
  await user.type(screen.getByRole("textbox", { name: /^Orçamento/ }), "1.234,5");
  await user.tab();
};

describe("SchemaForm", () => {
  it("reports clean values on mount and dirty ones once the user changes something", async () => {
    const onDirtyChange = vi.fn<(dirty: boolean) => void>();
    const { user } = renderForm({ onDirtyChange, defaultValues: { id: "note-1", title: "Fornecedor" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const title = screen.getByRole("textbox", { name: /^Título/ });
    await user.type(title, "s");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("renders the contract's fields with labels, required marks, hints and group legends", async () => {
    const { container } = renderForm();
    const form = screen.getByRole("form", { name: "Nota" });
    expect(within(form).getByRole("textbox", { name: "Título (obrigatório)" })).toHaveProperty("required", true);
    expect(within(form).getByRole("textbox", { name: "Texto" })).toBeDefined();
    expect(within(form).getByRole("group", { name: "Detalhes" })).toBeDefined();
    expect(within(form).getByRole("group", { name: "Agenda" })).toBeDefined();
    expect(within(form).getByRole("switch", { name: "Fixar no topo" })).toBeDefined();
    expect(within(form).getByRole("spinbutton", { name: "Cópias" })).toBeDefined();
    expect(within(form).getByText("Aparece nas listas.")).toBeDefined();
    expect(within(form).getByText("Data e hora no fuso America/Sao_Paulo.")).toBeDefined();
    expect(within(form).queryByText("Código interno")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("renders a visibleWith field when can(permission) allows it", () => {
    renderForm({ can: (permission) => permission === "fixture.note.admin" });
    expect(screen.getByRole("textbox", { name: "Código interno" })).toBeDefined();
  });

  it("drops the saved confirmation as soon as the user edits again", async () => {
    const { user } = renderForm({
      defaultValues: {
        id: "note-1",
        title: "Fornecedor",
        priority: "low",
        budget: { amountMinor: 500, currency: "BRL" },
      },
    });
    const title = screen.getByRole("textbox", { name: /^Título/ });
    await user.type(title, "s");
    await user.click(submitButton());
    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
    await user.type(title, "x");
    expect(screen.queryByText("Alterações salvas.")).toBeNull();
  });

  it("keeps submit off until something changed when the form edits saved values", async () => {
    const onSubmit = submitSpy();
    const { user } = renderForm({
      onSubmit,
      requireChanges: true,
      defaultValues: {
        id: "note-1",
        title: "Fornecedor",
        priority: "low",
        budget: { amountMinor: 500, currency: "BRL" },
      },
    });
    expect(submitButton()).toHaveProperty("disabled", true);
    await user.type(screen.getByRole("textbox", { name: /^Título/ }), "s");
    expect(submitButton()).toHaveProperty("disabled", false);
    await user.click(submitButton());
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(submitButton()).toHaveProperty("disabled", true));
  });

  it("shows translated client validation errors and focuses the first invalid field", async () => {
    const onSubmit = submitSpy();
    const { user, container } = renderForm({ onSubmit });
    await user.type(screen.getByRole("textbox", { name: /^Título/ }), "ab");
    await user.click(submitButton());
    const title = screen.getByRole("textbox", { name: /^Título/ });
    await vi.waitFor(() => expect(document.activeElement).toBe(title));
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Use pelo menos 3 caracteres.").id).toBe(
      title.getAttribute("aria-describedby")?.split(" ").at(-1),
    );
    expect(screen.getAllByText("Preencha este campo.").length).toBeGreaterThanOrEqual(2);
    expect(onSubmit).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it("submits values shaped by the contract: money in minor units, dates in UTC, carried fields kept", async () => {
    const onSubmit = submitSpy();
    const { user } = renderForm({ onSubmit });
    await fillValidNote(user);
    fireEvent.change(screen.getByLabelText(/^Prazo/), { target: { value: "2026-10-01T09:30" } });
    await user.click(screen.getByRole("switch", { name: "Fixar no topo" }));
    await user.click(submitButton());
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      id: "note-1",
      title: "Fornecedor",
      priority: "high",
      budget: { amountMinor: 123450, currency: "BRL" },
      dueAt: "2026-10-01T12:30:00.000Z",
      pinned: true,
    });
    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
  });

  it("shows existing values: a UTC instant as wall time in the display time zone", () => {
    renderForm({
      defaultValues: {
        id: "n",
        title: "Olá",
        dueAt: "2026-10-01T12:30:00.000Z",
        budget: { amountMinor: 500, currency: "USD" },
      },
    });
    expect(screen.getByLabelText<HTMLInputElement>(/^Prazo/).value).toBe("2026-10-01T09:30");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: /^Orçamento/ }).value).toBe("5,00");
    expect(screen.getByText("USD")).toBeDefined();
  });

  it("flags unparseable money text and does not submit", async () => {
    const onSubmit = submitSpy();
    const { user } = renderForm({ onSubmit, defaultValues: { id: "n", title: "Olá", priority: "low" } });
    await user.type(screen.getByRole("textbox", { name: /^Orçamento/ }), "12,345");
    await user.click(submitButton());
    expect(await screen.findByText("Use no máximo 2 casas decimais.")).toBeDefined();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("maps server VALIDATION_FAILED details to fields and moves focus to the first one", async () => {
    const onSubmit = vi.fn(
      (): Promise<SchemaFormResult> =>
        Promise.resolve({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            details: [{ field: "budget.amountMinor", issue: "TOO_BIG" }],
            requestId: "req-1",
          },
        }),
    );
    const { user } = renderForm({ onSubmit });
    await fillValidNote(user);
    await user.click(submitButton());
    const budget = screen.getByRole("textbox", { name: /^Orçamento/ });
    await vi.waitFor(() => expect(document.activeElement).toBe(budget));
    expect(budget.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Revise este campo.")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows other API errors in a focused alert with the request reference", async () => {
    const onSubmit = (): Promise<SchemaFormResult> =>
      Promise.resolve({ ok: false, error: { code: "CONFLICT", requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" } });
    const { user } = renderForm({ onSubmit });
    await fillValidNote(user);
    await user.click(submitButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Este item foi alterado por outra pessoa.");
    expect(alert.textContent).toContain("Referência: 01J8Z3K4M5N6P7Q8R9S0T1V2W3");
    await vi.waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("disables submit while the submit is pending and never submits twice", async () => {
    let finish: (result: SchemaFormResult) => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<SchemaFormResult>((resolve) => (finish = resolve)));
    const { user } = renderForm({ onSubmit });
    await fillValidNote(user);
    await user.click(submitButton());
    await vi.waitFor(() => expect(submitButton().getAttribute("aria-busy")).toBe("true"));
    expect(submitButton()).toHaveProperty("disabled", true);
    await user.type(screen.getByRole("textbox", { name: /^Título/ }), "{Enter}");
    finish({ ok: true });
    await vi.waitFor(() => expect(submitButton()).toHaveProperty("disabled", false));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("holds the submit while offline and says why, then sends once the connection is back", async () => {
    const onSubmit = submitSpy();
    const { user, container } = renderForm({ onSubmit });
    await fillValidNote(user);
    try {
      setOnline(false);
      expect(submitButton()).toHaveProperty("disabled", true);
      expect(screen.getByText(/Você está sem conexão/u)).toBeDefined();
      await user.type(screen.getByRole("textbox", { name: /^Título/ }), "{Enter}");
      expect(onSubmit).not.toHaveBeenCalled();
      await expectNoAxeViolations(container);
    } finally {
      setOnline(true);
    }
    expect(screen.queryByText(/Você está sem conexão/u)).toBeNull();
    await user.click(submitButton());
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("shows a loading state instead of the form while values load", () => {
    renderForm({ loading: true });
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("form")).toBeNull();
  });
});

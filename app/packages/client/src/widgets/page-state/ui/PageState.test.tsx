import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { PageError, PageForbidden, PageNotFound } from "./PageState.tsx";
import { QueryPage, type PageQuery } from "./QueryPage.tsx";

const query = <T,>(overrides: Partial<PageQuery<T>>): PageQuery<T> => ({ status: "success", data: undefined, error: null, isFetching: false, refetch: () => undefined, ...overrides });

describe("page states", () => {
  it("renders not-found and forbidden pages with one h1 and a way home", async () => {
    const notFound = renderWithClient(<PageNotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ir para o início" }).getAttribute("href")).toBe("/");
    // Home may lead back here (a stale last context), so the organization list is offered too.
    expect(screen.getByRole("link", { name: "Ver organizações" }).getAttribute("href")).toBe("/organizations");
    await expectNoAxeViolations(notFound.container);
    notFound.unmount();
    const forbidden = renderWithClient(<PageForbidden />);
    expect(screen.getByRole("heading", { level: 1, name: "Você não tem acesso a esta página" })).toBeDefined();
    await expectNoAxeViolations(forbidden.container);
  });

  it("renders a failed page as an alert with the reference and a retry", async () => {
    const onRetry = vi.fn();
    const { user, container } = renderWithClient(<PageError error={new ApiError({ status: 503, code: "INTERNAL_ERROR", message: "x", requestId: "01K6REQ" })} onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("Referência: 01K6REQ");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it("QueryPage picks loading, not-found (404 or null), forbidden (403), error or the page", () => {
    const page = (data: string) => <p>{data}</p>;
    const { rerender } = renderWithClient(<QueryPage query={query<string>({ status: "pending" })} loadingLabel="Carregando a página">{page}</QueryPage>);
    expect(screen.getByRole("status").textContent).toContain("Carregando a página");
    rerender(<QueryPage query={query<string>({ status: "error", error: new ApiError({ status: 404, code: "NOT_FOUND", message: "x" }) })} loadingLabel="x">{page}</QueryPage>);
    expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeDefined();
    rerender(<QueryPage query={query<string | null>({ data: null })} loadingLabel="x">{page}</QueryPage>);
    expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeDefined();
    rerender(<QueryPage query={query<string>({ status: "error", error: new ApiError({ status: 403, code: "FORBIDDEN", message: "x" }) })} loadingLabel="x">{page}</QueryPage>);
    expect(screen.getByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    rerender(<QueryPage query={query<string>({ status: "error", error: new ApiError({ status: 0, code: "NETWORK_ERROR", message: "x" }) })} loadingLabel="x">{page}</QueryPage>);
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível conectar.");
    rerender(<QueryPage query={query<string>({ data: "conteúdo" })} loadingLabel="x">{page}</QueryPage>);
    expect(screen.getByText("conteúdo")).toBeDefined();
  });
});

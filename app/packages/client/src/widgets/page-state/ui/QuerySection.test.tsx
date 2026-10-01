import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { QuerySection } from "./QuerySection.tsx";

const query = (overrides: Partial<Parameters<typeof QuerySection>[0]["query"]>) => ({ status: "success" as const, data: "ok", error: null, isFetching: false, refetch: vi.fn(), ...overrides });

describe("QuerySection", () => {
  it("renders loading, no-access for 403, an error with retry, then the content", async () => {
    const view = (props: Parameters<typeof QuerySection>[0]["query"]) => <QuerySection query={props} loadingLabel="Carregando dados">{(data) => <p>{data as string}</p>}</QuerySection>;
    const { rerender, user, container } = renderWithProviders(view(query({ status: "pending", data: undefined })));
    expect(screen.getByRole("status").textContent).toContain("Carregando dados");

    rerender(view(query({ status: "error", data: undefined, error: new ApiError({ status: 403, code: "FORBIDDEN", message: "x" }) })));
    expect(screen.getByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();

    const refetch = vi.fn();
    rerender(view(query({ status: "error", data: undefined, refetch, error: new ApiError({ status: 503, code: "INTERNAL_ERROR", message: "x", requestId: "01K6REQ" }) })));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByText("Referência: 01K6REQ")).toBeDefined();
    await expectNoAxeViolations(container);

    rerender(view(query({})));
    expect(screen.getByText("ok")).toBeDefined();
  });
});

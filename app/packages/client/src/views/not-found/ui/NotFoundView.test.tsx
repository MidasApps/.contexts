import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { NotFoundView } from "./NotFoundView.tsx";

describe("NotFoundView", () => {
  it("renders the not-found page with a link home", async () => {
    const { container } = renderWithClient(
      <main>
        <NotFoundView />
      </main>,
      { locale: "es-419" },
    );
    expect(screen.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});

import { screen } from "@testing-library/react";
import { InfoIcon, OctagonXIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Alert, AlertDescription, AlertTitle } from "./Alert.tsx";

describe("Alert", () => {
  it("maps urgency to the live-region role and tints with AA text tokens", async () => {
    const { container } = renderWithProviders(
      <>
        <Alert variant="info">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>Novidade</AlertTitle>
          <AlertDescription>Os convites agora expiram em 7 dias.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <OctagonXIcon aria-hidden="true" />
          <AlertTitle>Falha ao salvar</AlertTitle>
        </Alert>
      </>,
    );
    expect(screen.getByRole("status").className).toContain("text-blue-foreground");
    expect(screen.getByRole("alert").className).toContain("text-destructive-text");
    await expectNoAxeViolations(container);
  });
});

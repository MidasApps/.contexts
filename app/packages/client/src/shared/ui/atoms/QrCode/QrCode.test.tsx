import { screen } from "@testing-library/react";
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { QrCode } from "./QrCode.tsx";

const URI = "otpauth://totp/Core:ana%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Core";

const darkModules = (value: string): number =>
  encode(value, { ecc: "M", border: 4 }).data.flat().filter(Boolean).length;

describe("QrCode", () => {
  it("draws every dark module of the encoded value as one labelled image", async () => {
    const { container } = renderWithProviders(<QrCode value={URI} label="QR code de configuração" />);
    const image = screen.getByRole("img", { name: "QR code de configuração" });
    const path = image.querySelector("path")?.getAttribute("d") ?? "";
    expect(path.match(/M/gu)?.length).toBe(darkModules(URI));
    // A quiet zone of four modules around the code, as scanners expect.
    const size = encode(URI, { ecc: "M", border: 4 }).size;
    expect(image.getAttribute("viewBox")).toBe(`0 0 ${String(size)} ${String(size)}`);
    await expectNoAxeViolations(container);
  });

  it("stays dark on light in every theme, so authenticator apps can scan it", () => {
    renderWithProviders(<QrCode value={URI} label="QR" />);
    const frame = screen.getByRole("img", { name: "QR" }).parentElement;
    expect(frame?.getAttribute("data-theme")).toBe("light");
    expect(frame?.className).toContain("bg-background");
  });
});

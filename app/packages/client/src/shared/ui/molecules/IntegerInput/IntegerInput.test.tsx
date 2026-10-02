import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { IntegerInput } from "./IntegerInput.tsx";
import { formatIntegerInputText, parseIntegerInput } from "./integer-input-text.ts";

describe("parseIntegerInput", () => {
  it("reads plain digits and digits grouped by the locale's thousands separator", () => {
    expect(parseIntegerInput("20000000", "pt-BR")).toBe(20_000_000);
    expect(parseIntegerInput(" 20.000.000 ", "pt-BR")).toBe(20_000_000);
    expect(parseIntegerInput("20,000,000", "en-US")).toBe(20_000_000);
    expect(parseIntegerInput("0", "es-419")).toBe(0);
  });

  it("refuses decimals, misplaced separators, signs and counts too long to stay exact", () => {
    expect(parseIntegerInput("1.5", "pt-BR")).toBeNull();
    expect(parseIntegerInput("1,5", "pt-BR")).toBeNull();
    expect(parseIntegerInput("20.00.000", "pt-BR")).toBeNull();
    expect(parseIntegerInput("-3", "pt-BR")).toBeNull();
    expect(parseIntegerInput("1".repeat(16), "pt-BR")).toBeNull();
  });

  it("formats a count grouped in the locale", () => {
    expect(formatIntegerInputText(20_000_000, "pt-BR")).toBe("20.000.000");
    expect(formatIntegerInputText(20_000_000, "en-US")).toBe("20,000,000");
  });
});

describe("IntegerInput", () => {
  it("shows the count grouped, and reports a parsed count or a parse error on blur", async () => {
    const onValueChange = vi.fn<(value: number | null) => void>();
    const onParseError = vi.fn<(invalid: boolean) => void>();
    const { user, container } = renderWithProviders(
      <>
        <Label htmlFor="tokens">Tokens</Label>
        <IntegerInput id="tokens" value={1_000_000} onValueChange={onValueChange} onParseError={onParseError} />
      </>,
    );
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Tokens" });
    expect(input.value).toBe("1.000.000");
    await user.clear(input);
    await user.type(input, "2500000");
    await user.tab();
    expect(input.value).toBe("2.500.000");
    expect(onValueChange).toHaveBeenLastCalledWith(2_500_000);
    expect(onParseError).toHaveBeenLastCalledWith(false);
    await user.clear(input);
    await user.type(input, "1.5");
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(onParseError).toHaveBeenLastCalledWith(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await expectNoAxeViolations(container);
  });
});

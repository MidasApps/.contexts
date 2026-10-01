import { describe, expect, it } from "vitest";
import { cn } from "#/shared/lib/cn.ts";

describe("cn", () => {
  it("joins conditional classes", () => {
    expect(cn("px-2", false, undefined, { "font-medium": true, hidden: false }, ["gap-1"])).toBe(
      "px-2 font-medium gap-1",
    );
  });

  it("lets later utilities win over conflicting ones", () => {
    expect(cn("px-2 py-1 bg-primary", "px-4 bg-destructive")).toBe("py-1 px-4 bg-destructive");
  });

  it("keeps token colors and font sizes apart", () => {
    expect(cn("text-sm text-muted-foreground", "text-blue")).toBe("text-sm text-blue");
  });

  it("knows the design-system shadow and radius values", () => {
    expect(cn("shadow-popover rounded-2xs", "shadow-modal rounded-sm")).toBe("shadow-modal rounded-sm");
    expect(cn("text-xs text-muted-foreground", "text-muted-foreground-strong")).toBe("text-xs text-muted-foreground-strong");
  });
});

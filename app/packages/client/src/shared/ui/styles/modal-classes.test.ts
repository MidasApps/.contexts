import { describe, expect, it } from "vitest";
import { centeredModalClasses } from "./modal-classes.ts";

describe("centeredModalClasses", () => {
  it("caps the surface at the small viewport height and scrolls it, so tall dialogs stay reachable on phones", () => {
    const classes = centeredModalClasses.split(" ");
    expect(classes).toContain("max-h-[calc(100svh-2rem)]");
    expect(classes).toContain("overflow-y-auto");
    expect(classes).toContain("overscroll-contain");
  });
});

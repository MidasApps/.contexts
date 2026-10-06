import { describe, expect, it } from "vitest";
import { INSTALLED_MODULES } from "@/modules";
import { WEB_CLIENT_MODULES } from "./modules";

describe("WEB_CLIENT_MODULES", () => {
  it("gives every module the server installs its client side, and nothing more", () => {
    expect(WEB_CLIENT_MODULES.map((module) => module.manifest.id)).toEqual(
      INSTALLED_MODULES.map((manifest) => manifest.id),
    );
    WEB_CLIENT_MODULES.forEach((module, index) => expect(module.manifest).toBe(INSTALLED_MODULES[index]));
  });
});

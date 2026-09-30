import { describe, expect, it } from "vitest";
import { assertStorageInitConfirmed, UnconfirmedStorageInitError } from "./storage-init-target.ts";

describe("assertStorageInitConfirmed", () => {
  it("lets local init without a flag", () => {
    expect(() => assertStorageInitConfirmed("local", [])).not.toThrow();
  });

  it("requires --confirm-env naming the remote env", () => {
    expect(() => assertStorageInitConfirmed("prod", [])).toThrow(UnconfirmedStorageInitError);
    expect(() => assertStorageInitConfirmed("prod", ["--confirm-env", "staging"])).toThrow(/--confirm-env prod/);
    expect(() => assertStorageInitConfirmed("prod", ["--confirm-env", "prod"])).not.toThrow();
  });
});

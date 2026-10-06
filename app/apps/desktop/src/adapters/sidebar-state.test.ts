import { describe, expect, it } from "vitest";
import { readSidebarOpen, SIDEBAR_STATE_KEY, writeSidebarOpen } from "./sidebar-state.ts";

const storage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
};

const broken = {
  getItem: (): string | null => {
    throw new Error("denied");
  },
  setItem: (): void => {
    throw new Error("denied");
  },
};

describe("sidebar state", () => {
  it("defaults to open and round-trips the choice", () => {
    const local = storage();
    expect(readSidebarOpen(local)).toBe(true);
    writeSidebarOpen(local, false);
    expect(local.data.get(SIDEBAR_STATE_KEY)).toBe("false");
    expect(readSidebarOpen(local)).toBe(false);
  });

  it("treats unavailable storage as the default and never throws", () => {
    expect(readSidebarOpen(broken)).toBe(true);
    expect(() => writeSidebarOpen(broken, false)).not.toThrow();
    expect(readSidebarOpen(undefined)).toBe(true);
  });
});

// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const STYLES_DIR = import.meta.dirname;
const SRC_DIR = path.resolve(STYLES_DIR, "../../..");
const GLOBALS_CSS = readFileSync(path.join(STYLES_DIR, "globals.css"), "utf8").replaceAll("\r\n", "\n");

/** The steps of the dense UI between Tailwind's `text-xs` (12 px) and `text-sm` (14 px), decision 0057. */
const TYPE_SCALE = {
  "--text-micro": "0.59375rem",
  "--text-tiny": "0.65625rem",
  "--text-label": "0.6875rem",
  "--text-caption": "0.71875rem",
  "--text-body-sm": "0.78125rem",
  "--text-body": "0.8125rem",
  "--text-title": "0.9375rem",
} as const;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [full] : [];
  });

describe("type scale", () => {
  it("declares every step of the scale as a theme font size, with no line height of its own", () => {
    const theme = /@theme \{([^}]*)\}/u.exec(GLOBALS_CSS)?.[1] ?? "";
    for (const [token, size] of Object.entries(TYPE_SCALE)) {
      expect(theme, token).toContain(`${token}: ${size};`);
      // The line height stays the one around it, as the arbitrary sizes it replaced did.
      expect(theme, token).not.toContain(`${token}--line-height`);
    }
  });

  it("leaves no arbitrary font size in the client sources", () => {
    const offenders = sourceFiles(SRC_DIR).flatMap((file) => {
      const found = readFileSync(file, "utf8").match(/text-\[[0-9.]+(?:px|rem)\]/gu) ?? [];
      return found.map((size) => `${path.relative(SRC_DIR, file)}: ${size}`);
    });
    expect(offenders).toEqual([]);
  });
});

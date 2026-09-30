// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "@tailwindcss/node";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseHexColor } from "#/shared/testing/contrast.ts";

const STYLES_DIR = import.meta.dirname;
const GLOBALS_CSS = readFileSync(path.join(STYLES_DIR, "globals.css"), "utf8");
// DESIGN.md is read-only doctrine at the repository root (decision 0014); the test keeps globals.css in sync with it.
const DESIGN_MD = readFileSync(path.resolve(STYLES_DIR, "../../../../../../../.design-system/DESIGN.md"), "utf8");

type Declarations = Map<string, string>;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readBlock = (css: string, selector: string): Declarations => {
  const match = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`block not found: ${selector}`);
  const body = (match[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name = "", value = ""]) => [name, value.trim()]),
  );
};

/** Follows `var(--x)` inside one theme block until a literal value. */
const resolveValue = (block: Declarations, name: string): string => {
  const value = block.get(name);
  if (value === undefined) throw new Error(`token missing: ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference?.[1] === undefined ? value.toLowerCase() : resolveValue(block, reference[1]);
};

/** DESIGN.md names status accents `--color-*`; globals.css keeps them as `--status-*` (decision 0014 table). */
const toGlobalsName = (designName: string): string => designName.replace(/^--color-/, "--status-");

const DARK = readBlock(GLOBALS_CSS, ':root,\n[data-theme="dark"]');
const LIGHT = readBlock(GLOBALS_CSS, '[data-theme="light"]');
const THEME_INLINE = readBlock(GLOBALS_CSS, "@theme inline");
const THEMES = [
  ["dark", DARK],
  ["light", LIGHT],
] as const;

const DESIGN_DARK = readBlock(DESIGN_MD, ":root");
const DESIGN_LIGHT = readBlock(DESIGN_MD, ':root[data-theme="light"]');

/** Every raw color token both themes must declare (shadcn semantic set + sidebar family + status). */
const THEMED_TOKENS = [
  "--background", "--foreground", "--card", "--card-foreground", "--popover", "--popover-foreground",
  "--primary", "--primary-foreground", "--secondary", "--secondary-foreground", "--muted", "--muted-foreground",
  "--accent", "--accent-foreground", "--destructive", "--destructive-foreground", "--border", "--input", "--ring",
  "--status-blue", "--status-emerald", "--status-amber", "--status-cyan", "--status-violet",
  "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
  "--sidebar", "--sidebar-foreground", "--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-accent",
  "--sidebar-accent-foreground", "--sidebar-border", "--sidebar-ring",
];

describe("globals.css tokens", () => {
  it.each(THEMES)("declares every themed token in the %s theme", (_theme, block) => {
    expect(THEMED_TOKENS.filter((name) => !block.has(name))).toEqual([]);
  });

  it("matches every DESIGN.md dark token", () => {
    for (const [name, value] of DESIGN_DARK) {
      expect(resolveValue(DARK, toGlobalsName(name)), name).toBe(value.toLowerCase());
    }
  });

  it("matches every DESIGN.md light token", () => {
    for (const [name, value] of DESIGN_LIGHT) {
      expect(resolveValue(LIGHT, toGlobalsName(name)), name).toBe(value.toLowerCase());
    }
  });

  it("maps every themed token to a Tailwind color", () => {
    const expected = THEMED_TOKENS.map((name) => `--color-${name.replace(/^--(status-)?/, "")}`);
    expect(expected.filter((name) => !THEME_INLINE.has(name))).toEqual([]);
  });

  const PAIRS = [
    ["--foreground", "--background"],
    ["--muted-foreground", "--background"],
    ["--primary-foreground", "--primary"],
    ["--destructive-foreground", "--destructive"],
    ["--sidebar-primary-foreground", "--sidebar-primary"],
  ] as const;

  it.each(THEMES.flatMap(([theme, block]) => PAIRS.map(([text, surface]) => [theme, text, surface, block] as const)))(
    "%s: %s on %s reaches WCAG AA contrast (4.5)",
    (_theme, text, surface, block) => {
      const ratio = contrastRatio(parseHexColor(resolveValue(block, text)), parseHexColor(resolveValue(block, surface)));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("globals.css compiles with Tailwind", () => {
  it("generates semantic, status, sidebar and radius utilities", async () => {
    const compiler = await compile(GLOBALS_CSS, { base: STYLES_DIR, onDependency: () => undefined });
    const css = compiler.build([
      "bg-background", "text-muted-foreground", "bg-sidebar-primary", "text-blue", "bg-chart-3",
      "rounded-xl", "font-mono", "dark:bg-card", "md:hidden",
    ]);
    for (const selector of [".bg-background", ".text-muted-foreground", ".bg-sidebar-primary", ".text-blue", ".bg-chart-3", ".rounded-xl"]) {
      expect(css, selector).toContain(selector);
    }
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("prefers-reduced-motion");
  });
});

// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "@tailwindcss/node";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseHexColor, type Rgb } from "#/shared/testing/contrast.ts";

const STYLES_DIR = import.meta.dirname;
// Line endings normalized: a checkout with core.autocrlf=true has CRLF in the working copy.
const readText = (file: string): string => readFileSync(file, "utf8").replaceAll("\r\n", "\n");
const GLOBALS_CSS = readText(path.join(STYLES_DIR, "globals.css"));
// DESIGN.md is read-only doctrine at the repository root (decision 0014); the test keeps globals.css in sync with it.
const DESIGN_MD = readText(path.resolve(STYLES_DIR, "../../../../../../../.design-system/DESIGN.md"));

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
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--status-blue",
  "--status-emerald",
  "--status-amber",
  "--status-cyan",
  "--status-violet",
  "--status-blue-foreground",
  "--status-emerald-foreground",
  "--status-amber-foreground",
  "--status-cyan-foreground",
  "--status-violet-foreground",
  "--destructive-text",
  "--muted-foreground-strong",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
];

/** Text variants of the status accents (decision 0014: raw accents never carry text). */
const STATUS_TEXT = [
  "--status-blue-foreground",
  "--status-emerald-foreground",
  "--status-amber-foreground",
  "--status-cyan-foreground",
  "--status-violet-foreground",
] as const;

type Lab = [number, number, number];
const toLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel: number): number =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

// Björn Ottosson's sRGB ↔ Oklab matrices (the space of CSS `color-mix(in oklab, …)`).
const toOklab = (color: Rgb): Lab => {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => toLinear(channel / 255)) as Lab;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const fromOklab = ([lightness, a, b]: Lab): Rgb => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channel = (value: number): number => Math.round(Math.min(1, Math.max(0, fromLinear(value))) * 255);
  return {
    r: channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
};

/**
 * `color-mix(in oklab, accent 14%, surface)`, the pill/avatar/toast tint of DESIGN.md. Mixed in
 * Oklab like the browser: an sRGB average is lighter and let 4.45:1 pairs pass (axe caught them
 * in the SP2 e2e run).
 */
const tint = (accent: string, surface: string, weight = 0.14): Rgb => {
  const [a, s] = [toOklab(parseHexColor(accent)), toOklab(parseHexColor(surface))];
  return fromOklab([0, 1, 2].map((index) => (a[index] ?? 0) * weight + (s[index] ?? 0) * (1 - weight)) as Lab);
};

/** Surfaces tints sit on: page, cards and the sidebar, idle or highlighted (avatars in the switchers). */
const TINT_SURFACES = ["--background", "--card", "--sidebar", "--sidebar-accent"] as const;

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
    ["--muted-foreground", "--card"],
    ["--muted-foreground-strong", "--muted"],
    ["--muted-foreground-strong", "--secondary"],
    ["--muted-foreground-strong", "--accent"],
    ["--destructive-text", "--background"],
    ["--destructive-text", "--card"],
    ["--destructive-text", "--muted"],
    ...STATUS_TEXT.flatMap((text) => [
      [text, "--background"],
      [text, "--card"],
      [text, "--muted"],
    ]),
  ] as const;

  it.each(THEMES.flatMap(([theme, block]) => PAIRS.map(([text, surface]) => [theme, text, surface, block] as const)))(
    "%s: %s on %s reaches WCAG AA contrast (4.5)",
    (_theme, text, surface, block) => {
      const ratio = contrastRatio(
        parseHexColor(resolveValue(block, text)),
        parseHexColor(resolveValue(block, surface)),
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  const TINTED = [
    ...STATUS_TEXT.map((text) => [text, text.replace(/-foreground$/, "")] as const),
    ["--destructive-text", "--destructive"],
  ] as const;

  const TINT_CASES = THEMES.flatMap(([theme, block]) =>
    TINTED.flatMap(([text, accent]) => TINT_SURFACES.map((surface) => [theme, text, accent, surface, block] as const)),
  );

  it.each(TINT_CASES)(
    "%s: %s on a 14 percent tint of %s over %s reaches WCAG AA contrast (4.5)",
    (_theme, text, accent, surface, block) => {
      const background = tint(resolveValue(block, accent), resolveValue(block, surface));
      expect(contrastRatio(parseHexColor(resolveValue(block, text)), background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("globals.css compiles with Tailwind", () => {
  it("generates semantic, status, sidebar, radius, elevation and animation utilities", async () => {
    const compiler = await compile(GLOBALS_CSS, { base: STYLES_DIR, onDependency: () => undefined });
    const css = compiler.build([
      "bg-background",
      "text-muted-foreground",
      "bg-sidebar-primary",
      "text-blue",
      "bg-chart-3",
      "rounded-xl",
      "font-mono",
      "dark:bg-card",
      "md:hidden",
      "rounded-2xs",
      "rounded-xs",
      "shadow-popover",
      "shadow-modal",
      "ease-surface",
      "animate-in",
      "fade-in-0",
      "text-amber-foreground",
      "text-destructive-text",
      "text-muted-foreground-strong",
    ]);
    const expected = [
      ".bg-background",
      ".text-muted-foreground",
      ".bg-sidebar-primary",
      ".text-blue",
      ".bg-chart-3",
      ".rounded-xl",
      ".rounded-2xs",
      ".shadow-popover",
      ".shadow-modal",
      ".ease-surface",
      ".animate-in",
      ".fade-in-0",
      ".text-amber-foreground",
      ".text-destructive-text",
      ".text-muted-foreground-strong",
    ];
    for (const selector of expected) {
      expect(css, selector).toContain(selector);
    }
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("prefers-reduced-motion");
  });
});

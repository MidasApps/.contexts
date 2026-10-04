// Named import: the package types are CommonJS, where the default is the module namespace.
import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** WCAG 2.2 AA (rule accessibility): the 2.0/2.1 A and AA rules plus the 2.2 AA ones. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Runs axe on the page (or one region of it) and fails with a readable list of violations:
 * rule id, impact and each offending selector with axe's summary (e.g. the measured contrast).
 */
export const expectNoAxeViolations = async (page: Page, options: { include?: string } = {}): Promise<void> => {
  // Overlays fade in: axe measuring mid-animation blends the dialog with the backdrop (a false
  // contrast failure seen on WebKit). Wait until no animation is running.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  const builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  const results = await (options.include === undefined ? builder : builder.include(options.include)).analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map(
      (node) => `${node.target.join(" ")}: ${(node.failureSummary ?? "").replaceAll(/\s+/g, " ")}`,
    ),
  }));
  expect(violations, `axe violations on ${page.url()}`).toEqual([]);
};

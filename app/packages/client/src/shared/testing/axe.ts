import axe from "axe-core";

// jsdom does not compute layout or colors, so contrast is verified on tokens (tokens.test.ts) and
// in the browser (e2e with @axe-core/playwright); every other rule runs here.
const RUN_OPTIONS: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
  rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
};

const describeViolation = (violation: axe.Result): string =>
  `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n${violation.nodes
    .map((node) => `    ${node.target.join(" ")}`)
    .join("\n")}`;

/**
 * Runs axe-core on a rendered fragment and fails with every violation listed. Component tests
 * call it on their container (plan "Component test rule"). `region` is off because a component
 * rendered alone is not inside page landmarks; templates test landmarks explicitly.
 */
export const expectNoAxeViolations = async (container: Element): Promise<void> => {
  const { violations } = await axe.run(container, RUN_OPTIONS);
  if (violations.length > 0) {
    throw new Error(`axe found ${violations.length} violation(s):\n${violations.map(describeViolation).join("\n")}`);
  }
};

// What the member answered in a generative UI component (a form, a picker), as the user turn
// that carries it. `/v1/chat` accepts only text in a user message and the tools that render
// these components already returned (`catalog.renderForm` runs on the server), so the answer
// cannot travel as a tool output (decision 0032, amendment of SP4 Task 10). The turn is a short
// instruction the agent can act on plus the values as JSON; the chat shows it as a chip.

export type FormSubmission = {
  readonly kind: "schema-form";
  readonly commandId: string;
  readonly contractId: string;
  readonly mode: "create" | "update";
  readonly values: Readonly<Record<string, unknown>>;
};

export type ChoiceSubmission = {
  readonly kind: "picker";
  readonly values: readonly string[];
  /** Labels of the chosen options, for the chip. */
  readonly labels: readonly string[];
};

export type UiSubmission = FormSubmission | ChoiceSubmission;

const FENCE = "```";
const PATTERN = /^\[ui:(schema-form|picker)\][^\n]*\n```json\n([\s\S]*)\n```$/;

const sentenceOf = (submission: UiSubmission): string => {
  if (submission.kind === "picker") return `The user chose: ${submission.labels.map((label) => JSON.stringify(label)).join(", ")}. Continue with this choice.`;
  const verb = submission.mode === "create" ? "create" : "update";
  return `The user submitted the form of command ${submission.commandId} (${verb}). Confirm and run that command with exactly these values.`;
};

/**
 * The text of the user turn for a submission. Model-facing protocol text, not UI copy: it stays
 * in English whatever the locale, and the chat renders `parseUiSubmission` of it instead.
 */
export const formatUiSubmission = (submission: UiSubmission): string => {
  const { kind, ...payload } = submission;
  return `[ui:${kind}] ${sentenceOf(submission)}\n${FENCE}json\n${JSON.stringify(payload, null, 2)}\n${FENCE}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const toSubmission = (kind: string, payload: unknown): UiSubmission | null => {
  if (!isRecord(payload)) return null;
  if (kind === "picker") return isStrings(payload["values"]) && isStrings(payload["labels"]) ? { kind: "picker", values: payload["values"], labels: payload["labels"] } : null;
  const { commandId, contractId, mode, values } = payload;
  if (typeof commandId !== "string" || typeof contractId !== "string" || (mode !== "create" && mode !== "update") || !isRecord(values)) return null;
  return { kind: "schema-form", commandId, contractId, mode, values };
};

/** The submission a user turn carries, or `null` for ordinary text. */
export const parseUiSubmission = (text: string): UiSubmission | null => {
  const match = PATTERN.exec(text.trim());
  if (match === null) return null;
  try {
    return toSubmission(match[1] ?? "", JSON.parse(match[2] ?? "") as unknown);
  } catch {
    // Text that only looks like a submission (the member typed the marker): show it as text.
    return null;
  }
};

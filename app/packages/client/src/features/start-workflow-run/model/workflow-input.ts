import { z } from "zod";

const JsonObjectSchema = z.record(z.string(), z.unknown());

/**
 * Workflow input typed as JSON text: the object, `{}` for an empty field, or `null` when the text
 * is not a JSON object (arrays and scalars are refused: the API takes a record).
 */
export const parseWorkflowInput = (text: string): Record<string, unknown> | null => {
  if (text.trim() === "") return {};
  try {
    const parsed = JsonObjectSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

import { z } from "zod";

/** Position after which the next page starts: the sort value and the id of the last item. */
export type CursorPosition = readonly [sortValue: string, id: string];

const PositionSchema = z.tuple([z.string(), z.string().min(1)]);

/**
 * Opaque cursor (contracts/api.md §9.1): base64url of the JSON `[sortValue, id]`.
 * @example encodeCursor(["Launch", "p1"]) // "WyJMYXVuY2giLCJwMSJd"
 */
export const encodeCursor = (position: CursorPosition): string => Buffer.from(JSON.stringify(position), "utf8").toString("base64url");

/**
 * Decodes a cursor made by `encodeCursor`.
 * @returns null when the cursor was not made by `encodeCursor` (the caller answers 400).
 */
export const decodeCursor = (cursor: string): CursorPosition | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    // SyntaxError: not a cursor of ours; nothing else can throw here.
    return null;
  }
  const parsed = PositionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

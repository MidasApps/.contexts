import { DesktopSessionSecretSchema, SessionIdSchema } from "@core/contracts";
import { z } from "zod";

/**
 * What the desktop keeps in its one secure store slot (decision 0017 §2): the SP1 desktop session
 * id (to revoke it on sign-out) and its current secret. Versioned so the shape can evolve.
 */
export const DesktopSessionRecordSchema = z.strictObject({
  v: z.literal(1),
  sessionId: SessionIdSchema,
  secret: DesktopSessionSecretSchema,
});
export type DesktopSessionRecord = z.infer<typeof DesktopSessionRecordSchema>;

/** The stored record, or `null` when the value is not one (corrupt, older app, foreign write). */
export const parseDesktopSessionRecord = (value: string): DesktopSessionRecord | null => {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    // Not JSON: treated like any other unreadable record by the caller.
    return null;
  }
  const parsed = DesktopSessionRecordSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
};

export const serializeDesktopSessionRecord = (record: DesktopSessionRecord): string => JSON.stringify(record);

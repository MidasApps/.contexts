import { z } from "zod";

/** Input of the `createSession` Server Action (server-only; the ID token of a fresh sign-in). */
export const CreateWebSessionInputSchema = z.strictObject({
  idToken: z.string().min(1).max(4096),
});
export type CreateWebSessionInput = z.infer<typeof CreateWebSessionInputSchema>;

import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, sensitive } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { SessionIdSchema } from "./ids.schema.ts";

/** 256-bit random secret, base64url without padding (43 chars); stored only as sha256 (decision 0007). */
export const DesktopSessionSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, { error: "Expected a 43-char base64url secret." });

/** Firebase custom token (a signed JWT) for `signInWithCustomToken`. */
export const CustomTokenSchema = z.string().min(1).max(4096);

const EXAMPLE_SECRET = "q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C";
const EXAMPLE_CUSTOM_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ1QTFiMkMzZDRFNWY2RzdoOEk5aiJ9.c2lnbmF0dXJl";

const secretField = (description: string) => DesktopSessionSecretSchema.meta(sensitive(description));
const expiresAt = IsoDateTimeSchema.meta(none("When the session expires unless exchanged again (sliding, UTC)."));

export const CreateDesktopSessionResponseSchema = z.object({
  sessionId: SessionIdSchema.meta(none("Id of the new desktop session.")),
  secret: secretField("Session secret, returned once; the desktop keeps it in the OS keychain."),
  expiresAt,
});
export type CreateDesktopSessionResponse = z.infer<typeof CreateDesktopSessionResponseSchema>;

export const CreateDesktopSessionResponseContract = defineContract(CreateDesktopSessionResponseSchema, {
  id: "identity.CreateDesktopSessionResponse",
  kind: "view",
  description: "One-time answer of POST /v1/me/desktop-sessions with the session secret.",
  examples: [{ sessionId: EXAMPLE_IDS.session, secret: EXAMPLE_SECRET, expiresAt: EXAMPLE_TIMES.expires }],
  pii: "sensitive",
  tenancyScope: "user",
  relations: [],
});

export const ExchangeDesktopSessionInputSchema = z.strictObject({
  secret: secretField("Current session secret; it is rotated by the exchange."),
});
export type ExchangeDesktopSessionInput = z.infer<typeof ExchangeDesktopSessionInputSchema>;

export const ExchangeDesktopSessionInputContract = defineContract(ExchangeDesktopSessionInputSchema, {
  id: "identity.ExchangeDesktopSessionInput",
  kind: "command",
  description: "Exchanges a desktop session secret for a custom token (no Bearer; rate limited per IP).",
  examples: [{ secret: EXAMPLE_SECRET }],
  pii: "sensitive",
  tenancyScope: "user",
  relations: [],
});

export const ExchangeDesktopSessionResponseSchema = z.object({
  customToken: CustomTokenSchema.meta(sensitive("Custom token for signInWithCustomToken (in memory).")),
  secret: secretField("Rotated secret; the previous one is dead and reusing it revokes the session."),
  expiresAt,
});
export type ExchangeDesktopSessionResponse = z.infer<typeof ExchangeDesktopSessionResponseSchema>;

export const ExchangeDesktopSessionResponseContract = defineContract(ExchangeDesktopSessionResponseSchema, {
  id: "identity.ExchangeDesktopSessionResponse",
  kind: "view",
  description: "Answer of POST /v1/desktop-sessions/exchange: a custom token and the rotated secret.",
  examples: [{ customToken: EXAMPLE_CUSTOM_TOKEN, secret: EXAMPLE_SECRET, expiresAt: EXAMPLE_TIMES.expires }],
  pii: "sensitive",
  tenancyScope: "user",
  relations: [],
});

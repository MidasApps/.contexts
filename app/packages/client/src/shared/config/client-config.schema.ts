import { z } from "zod";

/** MFA factors the UI offers (SP1 decision 0007: TOTP remote, SMS `phone` in local). */
export const MfaFactorSchema = z.enum(["totp", "phone"]);
export type MfaFactor = z.infer<typeof MfaFactorSchema>;

/**
 * Public client configuration (SP2 spec §2.1 `shared/config`): parsed once by each app at boot
 * from its public env (`NEXT_PUBLIC_*`, `VITE_*`) and handed to the client. Nothing here is secret
 * (the Firebase web API key is a public identifier).
 */
export const ClientConfigSchema = z
  .strictObject({
    appEnv: z.enum(["local", "dev", "staging", "prod"]),
    /** API origin: `""` on web (same origin), an absolute URL on desktop. */
    apiBaseUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]),
    firebase: z.strictObject({
      apiKey: z.string().min(1),
      authDomain: z.string().min(1),
      projectId: z.string().min(1),
    }),
    /** Auth Emulator origin; required in `local` and only there (follow-up #12c). */
    authEmulatorUrl: z.url({ protocol: /^http$/ }).optional(),
    mfaFactors: z.array(MfaFactorSchema),
    /**
     * Open sign-up (`/sign-up`, decision 0049); absent or false: accounts are created only from an
     * invitation. A UI switch, not a security control: the server rules (invitations, self-serve)
     * decide what a new account may do.
     */
    selfServeSignUp: z.boolean().optional(),
  })
  .refine((config) => (config.appEnv === "local") === (config.authEmulatorUrl !== undefined), {
    error: "authEmulatorUrl is required in local and forbidden elsewhere.",
    path: ["authEmulatorUrl"],
  });
export type ClientConfig = z.infer<typeof ClientConfigSchema>;

/** Invalid client config: a deployment bug, raised at boot. Lists fields, never values. */
export class ClientConfigError extends Error {
  readonly code = "INVALID_CLIENT_CONFIG";
  readonly fields: readonly string[];
  constructor(fields: readonly string[], options?: ErrorOptions) {
    super(`Invalid client config: ${fields.join(", ")}`, options);
    this.name = "ClientConfigError";
    this.fields = fields;
  }
}

/**
 * Parses the client config once at app boot.
 * @throws {ClientConfigError} listing every invalid field.
 */
export const parseClientConfig = (raw: unknown): ClientConfig => {
  const parsed = ClientConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new ClientConfigError(
    parsed.error.issues.map((issue) => issue.path.map(String).join(".")),
    { cause: parsed.error },
  );
};

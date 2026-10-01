import { z } from "zod";
import type { E2eEnv } from "./e2e-env.ts";

const REQUEST_TIMEOUT_MS = 30_000;
/** The Auth Emulator accepts this API key and `Bearer owner` as the admin credential. */
const EMULATOR_API_KEY = "demo-api-key";

export type AuthUserInput = { email: string; password: string; displayName: string };
export type AuthUser = { uid: string; email: string };

const LookupSchema = z.object({ users: z.array(z.object({ localId: z.string(), email: z.string() })).optional() });
const CreatedSchema = z.object({ localId: z.string().min(1) });
const SignInSchema = z.object({ idToken: z.string().min(1) });
const CodesSchema = z.object({
  verificationCodes: z.array(z.object({ code: z.string(), sessionInfo: z.string().optional() })).default([]),
});

/** An Auth Emulator REST call failed; carries the emulator's error code only. */
export class EmulatorRequestError extends Error {
  readonly code: string;
  constructor(operation: string, status: number, code: string) {
    super(`auth emulator ${operation} failed: ${String(status)} ${code}`);
    this.name = "EmulatorRequestError";
    this.code = code;
  }
}

const errorCode = (payload: unknown): string => {
  const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(payload);
  return parsed.success ? (parsed.data.error.message.split(" ")[0] ?? "UNKNOWN") : "UNKNOWN";
};

/**
 * Admin helpers over the e2e Auth Emulator (`demo-*` project on loopback, checked by
 * `readE2eEnv`): users, password sign-in for `/v1` seeding, phone MFA and SMS codes.
 */
export const createEmulatorAuth = (env: E2eEnv) => {
  const project = `${env.E2E_AUTH_EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/projects/${env.E2E_PROJECT_ID}`;

  const call = async (operation: string, url: string, init: { method?: string; body?: unknown; admin?: boolean }): Promise<unknown> => {
    const response = await fetch(url, {
      method: init.method ?? "POST",
      headers: { "content-type": "application/json", ...(init.admin === false ? {} : { authorization: "Bearer owner" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new EmulatorRequestError(operation, response.status, errorCode(payload));
    return payload;
  };

  const findUid = async (email: string): Promise<string | undefined> =>
    LookupSchema.parse(await call("lookup", `${project}/accounts:lookup`, { body: { email: [email] } })).users?.[0]?.localId;

  /** Creates the user, or resets password/name on a re-run; the email is always verified. */
  const upsertUser = async (input: AuthUserInput): Promise<AuthUser> => {
    const body = { ...input, emailVerified: true };
    const existing = await findUid(input.email);
    if (existing !== undefined) {
      await call("update", `${project}/accounts:update`, { body: { localId: existing, ...body } });
      return { uid: existing, email: input.email };
    }
    const { localId } = CreatedSchema.parse(await call("create", `${project}/accounts`, { body }));
    return { uid: localId, email: input.email };
  };

  /** Password sign-in (no second factor) → ID token for `/v1` Bearer calls. */
  const signIn = async (email: string, password: string): Promise<string> => {
    const url = `${env.E2E_AUTH_EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${EMULATOR_API_KEY}`;
    return SignInSchema.parse(await call("signIn", url, { body: { email, password, returnSecureToken: true }, admin: false })).idToken;
  };

  /** Enrolls one SMS second factor (replacing any other), as a user would from Security. */
  const enrollPhone = async (uid: string, phoneNumber: string): Promise<void> => {
    await call("enrollPhone", `${project}/accounts:update`, {
      body: { localId: uid, mfa: { enrollments: [{ mfaEnrollmentId: "e2e-phone", phoneInfo: phoneNumber, displayName: "E2E phone" }] } },
    });
  };

  /**
   * The SMS code the emulator "sent" for one MFA start (`sessionInfo` of its answer); matching on
   * the session keeps parallel sign-ins to the same number apart. The emulator never sends SMS.
   */
  const smsCodeFor = async (sessionInfo: string): Promise<string | undefined> => {
    const url = `${env.E2E_AUTH_EMULATOR_ORIGIN}/emulator/v1/projects/${env.E2E_PROJECT_ID}/verificationCodes`;
    const { verificationCodes } = CodesSchema.parse(await call("verificationCodes", url, { method: "GET" }));
    return verificationCodes.find((entry) => entry.sessionInfo === sessionInfo)?.code;
  };

  return { upsertUser, signIn, enrollPhone, smsCodeFor };
};

export type EmulatorAuth = ReturnType<typeof createEmulatorAuth>;

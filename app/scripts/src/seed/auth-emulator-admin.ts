import { z } from "zod";
import type { AuthAdmin, AuthUser, AuthUserInput } from "./auth-admin.ts";

const REQUEST_TIMEOUT_MS = 10_000;

const AuthUserSchema = z.object({
  localId: z.string().min(1),
  email: z.string(),
  displayName: z.string().optional(),
  emailVerified: z.boolean().default(false),
});
const LookupResponseSchema = z.object({ users: z.array(AuthUserSchema).optional() });
const CreateResponseSchema = z.object({ localId: z.string().min(1) });
const EmulatorErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** The Auth Emulator rejected a request; `code` is its error code (e.g. EMAIL_EXISTS). */
export class AuthEmulatorRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(operation: string, status: number, code: string) {
    super(`auth emulator ${operation} failed with ${String(status)} ${code}`);
    this.name = "AuthEmulatorRequestError";
    this.code = code;
    this.status = status;
  }
}

/**
 * {@link AuthAdmin} over the Auth Emulator REST API. `Bearer owner` is the admin
 * credential that only the emulator accepts.
 */
export const createAuthEmulatorAdmin = (args: { origin: string; projectId: string }): AuthAdmin => {
  const base = `${args.origin}/identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(args.projectId)}`;

  const post = async (operation: string, path: string, body: unknown): Promise<unknown> => {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { authorization: "Bearer owner", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload: unknown = await response.json();
    if (response.ok) return payload;
    const parsed = EmulatorErrorSchema.safeParse(payload);
    // The emulator message may carry detail after the code; only the code is kept.
    const code = parsed.success ? (parsed.data.error.message.split(" ")[0] ?? "UNKNOWN") : "UNKNOWN";
    throw new AuthEmulatorRequestError(operation, response.status, code);
  };

  const lookup = async (body: Record<string, unknown>): Promise<AuthUser | undefined> =>
    LookupResponseSchema.parse(await post("lookup", "/accounts:lookup", body)).users?.[0];

  const requireUser = async (localId: string): Promise<AuthUser> => {
    const user = await lookup({ localId: [localId] });
    if (user === undefined) throw new AuthEmulatorRequestError("lookup", 404, "USER_NOT_FOUND");
    return user;
  };

  return {
    findUserByEmail: (email) => lookup({ email: [email] }),
    createUser: async (input: AuthUserInput) => {
      const { localId } = CreateResponseSchema.parse(await post("create", "/accounts", input));
      return requireUser(localId);
    },
    updateUser: async (localId, input) => {
      await post("update", "/accounts:update", { localId, ...input });
      return requireUser(localId);
    },
  };
};

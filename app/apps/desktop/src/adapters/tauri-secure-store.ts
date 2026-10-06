import { SecureStoreError, type SecureStorePort } from "@core/client/shared/lib/secure-store";
import { invoke } from "@tauri-apps/api/core";

/** The subset of Tauri's `invoke` the store needs (a fake in tests). */
export type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * Native codes of `src-tauri/src/secure_store.rs`; only "unavailable" changes behavior (the session
 * bridge then signs in without persistence). An invalid argument, an ACL refusal (a string from
 * Tauri) or anything else is `SECURE_STORE_FAILED`. The rejection value is never copied into the
 * error: it could echo the command arguments.
 */
const toSecureStoreError = (rejection: unknown): SecureStoreError => {
  const code = typeof rejection === "object" && rejection !== null ? (rejection as { code?: unknown }).code : undefined;
  return new SecureStoreError(code === "SECURE_STORE_UNAVAILABLE" ? "SECURE_STORE_UNAVAILABLE" : "SECURE_STORE_FAILED");
};

const call = async (invokeCommand: TauriInvoke, cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
  try {
    return await invokeCommand(cmd, args);
  } catch (rejection: unknown) {
    throw toSecureStoreError(rejection);
  }
};

/**
 * Secure store over the OS keychain (decision 0017 §1): the `secure_store_get|set|delete` Tauri
 * commands, allowed for the `main` window only (`src-tauri/permissions/secure-store.toml`).
 */
export const createTauriSecureStore = (args: { invoke?: TauriInvoke } = {}): SecureStorePort => {
  const invokeCommand: TauriInvoke = args.invoke ?? ((cmd, commandArgs) => invoke<unknown>(cmd, commandArgs));
  return {
    get: async () => {
      const value = await call(invokeCommand, "secure_store_get");
      if (value === null || typeof value === "string") return value;
      throw new SecureStoreError("SECURE_STORE_FAILED");
    },
    set: async (secret) => {
      await call(invokeCommand, "secure_store_set", { secret });
    },
    delete: async () => {
      await call(invokeCommand, "secure_store_delete");
    },
  };
};

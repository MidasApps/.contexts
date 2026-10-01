/** Stable failure codes of a secure store; the secret never appears in errors or logs. */
export type SecureStoreErrorCode = "SECURE_STORE_UNAVAILABLE" | "SECURE_STORE_FAILED";

export class SecureStoreError extends Error {
  readonly code: SecureStoreErrorCode;
  constructor(code: SecureStoreErrorCode, options?: ErrorOptions) {
    super(`Secure store failed: ${code}`, options);
    this.name = "SecureStoreError";
    this.code = code;
  }
}

/**
 * One secret slot (the desktop session secret, decision 0017). Desktop: Tauri commands over the
 * OS keychain (`keyring` crate); browser mode and tests: `createMemorySecureStore`. Web does not
 * use it.
 */
export type SecureStorePort = {
  get: () => Promise<string | null>;
  set: (secret: string) => Promise<void>;
  delete: () => Promise<void>;
};

/** Firebase custom tokens for `signInWithCustomToken` (web exchange, desktop, devices). */
export type CustomTokenIssuer = {
  /** @param claims developer claims (`smfa`, `principalType`, `tenantId`); never secrets. */
  readonly createCustomToken: (uid: string, claims: Readonly<Record<string, string | boolean>>) => Promise<string>;
};

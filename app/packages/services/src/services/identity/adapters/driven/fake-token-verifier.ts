import type { TokenVerifier, VerifiedToken } from "../../application/ports/driven/token-verifier.ts";

export type FakeTokenVerifier = TokenVerifier & {
  /** Every call, in order (asserts the `checkRevoked` split, follow-up #12e). */
  readonly calls: () => readonly { token: string; checkRevoked: boolean }[];
};

/**
 * Test double of the token verifier. Unlike the Auth Emulator, which always checks
 * revocation, it honours `checkRevoked`: a token in `revoked` passes only when false.
 */
export const createFakeTokenVerifier = (args: {
  tokens: Readonly<Record<string, VerifiedToken>>;
  revoked?: readonly string[];
}): FakeTokenVerifier => {
  const calls: { token: string; checkRevoked: boolean }[] = [];
  const revoked = new Set(args.revoked ?? []);
  return {
    verifyIdToken: (token, { checkRevoked }) => {
      calls.push({ token, checkRevoked });
      const verified = args.tokens[token] ?? null;
      return Promise.resolve(verified !== null && checkRevoked && revoked.has(token) ? null : verified);
    },
    calls: () => [...calls],
  };
};

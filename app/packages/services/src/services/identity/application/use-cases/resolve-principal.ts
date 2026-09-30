import { PrincipalSchema, type Principal } from "@core/contracts";
import type { ApiKeyAuthenticator } from "../ports/driven/api-key-authenticator.ts";
import type { TokenVerifier, VerifiedToken } from "../ports/driven/token-verifier.ts";

/**
 * Verifies one Bearer credential (Firebase ID token or prefixed API key) and maps it
 * to a `Principal` (SP1 spec §3.1, §3.2). SP3's Mastra auth provider binds to this.
 * @returns `null` for a missing, invalid, expired or revoked credential (401).
 */
export type VerifyBearer = (input: { token: string; checkRevoked: boolean }) => Promise<Principal | null>;

/** Resolves the principal of a request from its `Authorization` header and method. */
export type ResolvePrincipal = (input: { authorization: string | null; method: string }) => Promise<Principal | null>;

export type ResolvePrincipalDeps = {
  readonly tokenVerifier: TokenVerifier;
  readonly apiKeyAuthenticator: ApiKeyAuthenticator;
  /** `API_KEY_PREFIX` (decision 0008). */
  readonly apiKeyPrefix: string;
};

const BEARER = /^Bearer ([^\s]+)$/i;
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);
const MFA_FACTORS: ReadonlySet<string> = new Set(["totp", "phone"]);

/** The credential of `Authorization: Bearer <credential>`; any other scheme or shape is null. Query strings are never read. */
export const parseBearer = (authorization: string | null): string | null => BEARER.exec(authorization?.trim() ?? "")?.[1] ?? null;

/** Mutations re-check revocation; reads skip it (umbrella §16.2, follow-up #12e). */
export const requiresRevocationCheck = (method: string): boolean => !READ_METHODS.has(method.toUpperCase());

/** Whether a credential is an API key of this deployment (`<prefix>_…`), routed before touching Firebase. */
export const isApiKeyCredential = (credential: string, prefix: string): boolean => credential.startsWith(`${prefix}_`);

const stringClaim = (claims: VerifiedToken["claims"], name: string): string | undefined => {
  const value = claims[name];
  return typeof value === "string" && value !== "" ? value : undefined;
};

// `smfa` is set only from a verified session record and only on custom-token sign-ins (decision 0007 §3).
/** Whether a verified token proves a second factor (SP1 spec §3.4). */
export const provesMfa = (token: Pick<VerifiedToken, "claims" | "signInProvider" | "secondFactor">): boolean =>
  (token.secondFactor !== null && MFA_FACTORS.has(token.secondFactor)) ||
  (token.signInProvider === "custom" && token.claims["smfa"] === true);

const userCandidate = (token: VerifiedToken): unknown => {
  const sessionId = stringClaim(token.claims, "imp");
  const staffUid = stringClaim(token.claims, "impBy");
  if (sessionId === undefined && staffUid === undefined) {
    // Only our session exchanges mint custom tokens with `sessionId` (developer claims cannot be forged).
    const session = token.signInProvider === "custom" ? stringClaim(token.claims, "sessionId") : undefined;
    return { type: "user", uid: token.uid, mfa: provesMfa(token), ...(session === undefined ? {} : { sessionId: session }) };
  }
  if (sessionId === undefined || staffUid === undefined) return null;
  // The staff member's MFA is not the impersonated user's: never carried over.
  return { type: "user", uid: token.uid, mfa: false, impersonation: { sessionId, staffUid } };
};

const candidateOf = (token: VerifiedToken): unknown => {
  const principalType = token.claims["principalType"];
  if (principalType === "device") return { type: "device", deviceId: token.uid, tenantId: stringClaim(token.claims, "tenantId") };
  if (principalType === undefined || principalType === "user") return userCandidate(token);
  return null;
};

/**
 * Maps verified claims to a principal (SP1 spec §3.2): `principalType: "device"` → device of
 * its `tenantId` claim; `imp` + `impBy` → impersonated user; otherwise a user. Anything the
 * `Principal` contract refuses is rejected. Status (device active, session open) is checked
 * later by `authorize()`, which reads the source documents.
 */
export const mapTokenToPrincipal = (token: VerifiedToken): Principal | null => {
  const parsed = PrincipalSchema.safeParse(candidateOf(token));
  return parsed.success ? parsed.data : null;
};

/** Builds `verifyBearer` over the token verifier and the API key authenticator. */
export const makeVerifyBearer =
  (deps: ResolvePrincipalDeps): VerifyBearer =>
  async ({ token, checkRevoked }) => {
    if (isApiKeyCredential(token, deps.apiKeyPrefix)) return deps.apiKeyAuthenticator.authenticate(token);
    const verified = await deps.tokenVerifier.verifyIdToken(token, { checkRevoked });
    return verified === null ? null : mapTokenToPrincipal(verified);
  };

/** Builds `resolvePrincipal`: Bearer parsing + `verifyBearer` with the method's revocation rule. */
export const makeResolvePrincipal = (deps: ResolvePrincipalDeps): ResolvePrincipal => {
  const verifyBearer = makeVerifyBearer(deps);
  return async ({ authorization, method }) => {
    const token = parseBearer(authorization);
    return token === null ? null : verifyBearer({ token, checkRevoked: requiresRevocationCheck(method) });
  };
};

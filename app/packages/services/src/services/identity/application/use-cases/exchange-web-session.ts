import { ok, type Result } from "../../../shared/result/result.ts";
import type { SessionInvalidError } from "../../domain/errors/session-errors.ts";
import type { SessionDeps } from "../session-deps.ts";
import { loadWebSession } from "./require-web-session.ts";

export type ExchangeWebSession = (command: { cookie: string | undefined }) => Promise<Result<{ customToken: string }, SessionInvalidError>>;

/**
 * `exchangeSession()` (SP1 spec §3.3 step 3): an open web session yields a custom token
 * whose developer claim `smfa` carries the session's MFA proof; the client signs in with it
 * in memory and uses the ID token as the `/v1` Bearer.
 */
export const makeExchangeWebSession =
  (deps: SessionDeps): ExchangeWebSession =>
  async ({ cookie }) => {
    const loaded = await loadWebSession(deps, cookie);
    if (!loaded.ok) return loaded;
    const { record } = loaded.data;
    await deps.sessions.touch({ id: record.id, lastSeenAt: deps.clock.now().toISOString() });
    return ok({ customToken: await deps.customTokens.createCustomToken(record.uid, { smfa: record.mfa, sessionId: record.id }) });
  };

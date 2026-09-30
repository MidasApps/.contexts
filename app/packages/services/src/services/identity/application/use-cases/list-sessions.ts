import type { SessionSummary, UserPrincipal } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { isSessionOpen, toSessionSummary, type SessionDeps } from "../session-deps.ts";

export type ListSessions = (command: { actor: UserPrincipal; page: PageRequest }) => Promise<Page<SessionSummary>>;

/**
 * `GET /v1/me/sessions`: the caller's sessions not revoked, newest first; `current` marks the
 * session whose exchange minted the calling token. Expired ones are
 * dropped from the page (a page may hold fewer items than `limit`; the cursor still advances).
 */
export const makeListSessions =
  (deps: SessionDeps): ListSessions =>
  async ({ actor, page }) => {
    const fetched = await deps.sessions.listOpen({ uid: actor.uid, page });
    const now = deps.clock.now();
    return { items: fetched.items.filter((record) => isSessionOpen(record, now)).map((record) => toSessionSummary(record, actor.sessionId)), nextCursor: fetched.nextCursor };
  };

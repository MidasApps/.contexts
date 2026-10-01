import "server-only";
import { processLogger, REQUEST_ID_HEADER, resolveRequestId, type SessionActionContext, type SessionActionResult, type SessionActions } from "@core/services";
import { headers } from "next/headers";
import { getCoreServer } from "./core";
import { createSessionCookieJar } from "./session-cookie-jar";

type SessionActionName = keyof SessionActions;

/**
 * Runs one SP1 session action (decision 0007) with the request's cookie jar, `Origin` (CSRF
 * guard), user agent and request id. A failure outside the action's own results (server build,
 * Firebase unreachable) is logged once here and answered with the generic `INTERNAL_ERROR`
 * envelope, never the raw error.
 */
export const runSessionAction = async <T>(
  name: SessionActionName,
  run: (actions: SessionActions, context: SessionActionContext) => Promise<SessionActionResult<T>>,
): Promise<SessionActionResult<T>> => {
  const requestHeaders = await headers();
  const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER));
  try {
    const context: SessionActionContext = {
      cookies: await createSessionCookieJar(),
      origin: requestHeaders.get("origin"),
      userAgent: requestHeaders.get("user-agent"),
      requestId,
    };
    return await run((await getCoreServer()).sessionActions, context);
  } catch (err: unknown) {
    processLogger.error("session_action_failed", { requestId, action: name, err });
    return { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId } };
  }
};

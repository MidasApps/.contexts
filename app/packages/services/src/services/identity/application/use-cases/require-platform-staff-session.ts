import type { PlatformRole, SessionId, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { NotPlatformStaffError, type SessionInvalidError } from "../../domain/errors/session-errors.ts";
import type { SessionDeps } from "../session-deps.ts";
import { loadWebSession } from "./require-web-session.ts";

export type StaffSession = {
  readonly principal: UserPrincipal;
  readonly sessionId: SessionId;
  readonly role: PlatformRole;
};

export type RequirePlatformStaffSession = (command: {
  cookie: string | undefined;
}) => Promise<Result<StaffSession, SessionInvalidError | NotPlatformStaffError>>;

/**
 * RSC guard of `/admin` (SP1 spec §3.4): an open web session whose user has an active
 * `platform-staff` doc and whose sign-in proved MFA (`sign_in_second_factor`, or `smfa` on a
 * custom-token sign-in, recorded when the session was created). Anything else is "not
 * staff", which `/admin` answers with 404.
 */
export const makeRequirePlatformStaffSession =
  (deps: SessionDeps): RequirePlatformStaffSession =>
  async ({ cookie }) => {
    const loaded = await loadWebSession(deps, cookie);
    if (!loaded.ok) return loaded;
    const { principal, sessionId } = loaded.data;
    const [staff, user] = await Promise.all([
      deps.principals.getPlatformStaff(principal.uid),
      deps.principals.getUser(principal.uid),
    ]);
    if (staff === null || !staff.isActive || user?.status !== "active" || !principal.mfa)
      return err(new NotPlatformStaffError());
    return ok({ principal, sessionId, role: staff.role });
  };

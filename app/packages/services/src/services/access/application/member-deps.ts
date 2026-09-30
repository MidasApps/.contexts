import type { ApiKeyRevoker } from "../../identity/application/ports/driven/api-key-revoker.ts";
import type { Logger } from "../../shared/observability/logger.ts";
import type { RandomBytes } from "../domain/invitation-token.ts";
import type { AccessWriteDeps } from "./access-write-deps.ts";
import type { InvitationNotifier } from "./ports/driven/invitation-notifier.ts";
import type { InvitationRepository } from "./ports/driven/invitation-repository.ts";
import type { OrganizationDirectory } from "./ports/driven/organization-directory.ts";
import type { UserDirectory } from "./ports/driven/user-directory.ts";

/** Dependencies of the members and invitations vertical (SP1 Task 11), on top of the write side. */
export type MemberDeps = AccessWriteDeps & {
  readonly invitations: InvitationRepository;
  readonly notifier: InvitationNotifier;
  readonly directory: UserDirectory;
  readonly organizations: OrganizationDirectory;
  /** Identity port; a no-op until the API keys vertical (SP1 Task 14). */
  readonly apiKeys: ApiKeyRevoker;
  readonly randomBytes: RandomBytes;
  /** `NEXT_PUBLIC_APP_URL`; creating an invitation needs it for the accept link. */
  readonly appUrl: string | undefined;
  readonly logger: Logger;
};

/** Bug: invitations were used on a server built without `NEXT_PUBLIC_APP_URL`. */
export class AppUrlMissingError extends Error {
  readonly code = "APP_URL_MISSING";

  constructor() {
    super("APP_URL_MISSING: createCoreServer needs env.NEXT_PUBLIC_APP_URL to build invitation links");
    this.name = "AppUrlMissingError";
  }
}

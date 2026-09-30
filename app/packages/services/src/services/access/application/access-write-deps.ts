import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { PermissionRegistry } from "../domain/permission-registry.ts";
import type { AccessProjectionStore } from "./ports/driven/access-projection-writer.ts";
import type { MembershipRepository } from "./ports/driven/membership-repository.ts";
import type { RoleReader } from "./ports/driven/role-reader.ts";
import type { RoleRepository } from "./ports/driven/role-repository.ts";
import type { UserAccessVersionStore } from "./ports/driven/user-access-version.ts";
import type { SyncClaims } from "./use-cases/sync-claims.ts";

/** Dependencies of the access write side (SP1 Task 9), built by `createAccessServices`. */
export type AccessWriteDeps = {
  readonly registry: PermissionRegistry;
  readonly memberships: MembershipRepository;
  readonly roles: RoleRepository;
  /** The `authorize()` role reader, reused to resolve custom roles for escalation checks. */
  readonly roleReader: RoleReader;
  readonly projections: AccessProjectionStore;
  readonly users: UserAccessVersionStore;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  /** Runs after commit; logs and swallows failures (healed by `POST /v1/me/claims/sync`). */
  readonly syncClaims: SyncClaims;
};

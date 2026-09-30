import type { SyncClaims } from "../../access/application/use-cases/sync-claims.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { Logger } from "../../shared/observability/logger.ts";
import type { CustomTokenIssuer } from "./ports/driven/custom-token-issuer.ts";
import type { ImpersonationSessionRepository } from "./ports/driven/impersonation-session-repository.ts";
import type { PlatformStaffRepository } from "./ports/driven/platform-staff-repository.ts";

/** Dependencies of the platform staff and impersonation use cases (SP1 Task 16). */
export type PlatformDeps = {
  readonly staff: PlatformStaffRepository;
  readonly impersonations: ImpersonationSessionRepository;
  readonly customTokens: CustomTokenIssuer;
  /** Staff claims carry `platformRole` (SP1 spec §5.4). */
  readonly syncClaims: SyncClaims;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly logger: Logger;
};

import type { AccessServices } from "../../access/composition.ts";
import type { RandomBytes } from "../../access/domain/invitation-token.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { Logger } from "../../shared/observability/logger.ts";
import type { AuthUserAdmin } from "./ports/driven/auth-user-admin.ts";
import type { CustomTokenIssuer } from "./ports/driven/custom-token-issuer.ts";
import type { DeviceActivationRepository } from "./ports/driven/device-activation-repository.ts";
import type { DeviceRepository } from "./ports/driven/device-repository.ts";

/** Dependencies of the device use cases (SP1 Task 15, decision 0008). */
export type DeviceDeps = {
  readonly devices: DeviceRepository;
  readonly activations: DeviceActivationRepository;
  /** Grant checks and grant writes of the access context (the only one that decides permissions). */
  readonly access: Pick<AccessServices, "checkGrantable" | "prepareGrant" | "prepareRevokeAllGrants">;
  readonly customTokens: CustomTokenIssuer;
  readonly authUsers: AuthUserAdmin;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
  readonly logger: Logger;
};

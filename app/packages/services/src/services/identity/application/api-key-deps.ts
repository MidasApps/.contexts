import type { RandomBytes } from "../../access/domain/invitation-token.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { Logger } from "../../shared/observability/logger.ts";
import type { ApiKeyRepository } from "./ports/driven/api-key-repository.ts";

/** Dependencies of the API key use cases (SP1 Task 14, decision 0008). */
export type ApiKeyDeps = {
  readonly apiKeys: ApiKeyRepository;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
  readonly logger: Logger;
  /** `API_KEY_PREFIX`. */
  readonly apiKeyPrefix: string;
  /** sha256 hex of a secret (injected so tests can count hashing). */
  readonly hashSecret: (secret: string) => string;
};

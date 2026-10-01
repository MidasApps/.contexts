import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { RegisteredFlag } from "../flag-registry.ts";
import type { FlagStores } from "./ports/flag-store.ts";

/** What the flags use cases need (decision 0039). */
export type FlagsDeps = {
  readonly registry: readonly RegisteredFlag[];
  readonly stores: FlagStores;
  /** Boot-time environment defaults by key (`chat.voice` ← `AI_VOICE_ENABLED`, decision 0034 amendment). */
  readonly environmentDefaults: Readonly<Record<string, boolean | undefined>>;
  readonly clock: Clock;
  readonly audit: AuditWriter;
};

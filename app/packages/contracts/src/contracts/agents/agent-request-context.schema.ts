import { z } from "zod";
import { defineContract } from "../contract.ts";
import { PermissionSchema } from "../primitives/catalog-meta.schema.ts";
import { firestoreIdSchema, RequestIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { LocaleSchema } from "../primitives/locale.schema.ts";
import { CurrencySchema } from "../primitives/money.schema.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";
import { ACTIVE_SCREEN_MAX_LENGTH } from "./forwarded-headers.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/**
 * Typed Mastra `RequestContext` of every agent run (SP3 spec §4.3, decision 0019).
 * Built server-side from the verified principal; client-sent keys are overwritten.
 */
export const AgentRequestContextSchema = z
  .strictObject({
    tenantId: TenantIdSchema.meta(none("Active organization; from the verified principal, never from the client body.")),
    projectId: firestoreIdSchema<"ProjectId">().optional().meta(none("Active project, when the request is scoped to one.")),
    unitId: firestoreIdSchema<"UnitId">().optional().meta(none("Active unit, when the request is scoped to one.")),
    userId: UserIdSchema.meta({ description: "Firebase Auth uid of the caller (API key owner for services).", pii: "personal" }),
    principalKind: z.enum(["user", "service"]).meta(none("Whether a person or an API key made the call.")),
    permissions: z.array(PermissionSchema).meta(none("Effective permissions: principal grants intersected with the agent ceiling.")),
    locale: LocaleSchema.meta(none("BCP 47 locale for answers and formatting.")),
    displayTimeZone: TimeZoneSchema.meta(none("IANA time zone used to show dates to the caller.")),
    nodeTimeZone: TimeZoneSchema.meta(none("IANA time zone of the active node, for calendar rules.")),
    currency: CurrencySchema.meta(none("Default ISO 4217 currency of the active node.")),
    activeScreen: z.string().min(1).max(ACTIVE_SCREEN_MAX_LENGTH).optional().meta(none("Route id of the UI screen the caller is on.")),
    requestId: RequestIdSchema.meta(none("X-Request-Id of the /v1 call (ULID).")),
    conversationId: firestoreIdSchema<"ConversationId">().optional().meta(none("Chat conversation id; also the memory thread id.")),
    organizationId: TenantIdSchema.meta(none("Same value as tenantId; the key Mastra TokenCostControl reads.")),
    aiMode: z.enum(["real", "fake"]).meta(none("Whether models are real providers or the deterministic fakes.")),
  })
  .refine((context) => context.organizationId === context.tenantId, {
    error: "organizationId must equal tenantId.",
    path: ["organizationId"],
  });
export type AgentRequestContext = z.infer<typeof AgentRequestContextSchema>;

export const AgentRequestContextContract = defineContract(AgentRequestContextSchema, {
  id: "agents.AgentRequestContext",
  kind: "settings",
  description: "Per-run context every agent, tool and workflow reads: tenant, caller, effective permissions and regional settings.",
  examples: [
    {
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      projectId: "Pq8sK2lPq0WnR5tYu3bV",
      userId: "uA1b2C3d4E5f6G7h8I9j",
      principalKind: "user",
      permissions: ["core.chat.use", "core.knowledge.read"],
      locale: "pt-BR",
      displayTimeZone: "America/Sao_Paulo",
      nodeTimeZone: "America/Sao_Paulo",
      currency: "BRL",
      activeScreen: "notes.list",
      requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      conversationId: "Cv3sK2lPq0WnR5tYu3bV",
      organizationId: "Jd8sK2lPq0WnR5tYu3bV",
      aiMode: "fake",
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [],
});

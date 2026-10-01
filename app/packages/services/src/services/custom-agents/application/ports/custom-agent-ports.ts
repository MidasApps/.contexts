import type { CustomAgent, CustomAgentId, CustomAgentLimits, CustomSkill, CustomSkillId, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";

/** Most records one tenant read returns (plan caps are far below it). */
export const MAX_CUSTOM_RECORDS_PER_TENANT = 200;

/** Firestore `custom-agents/{autoId}` (tenant data; Security Rules deny clients). */
export type CustomAgentRepository = {
  readonly newId: () => CustomAgentId;
  /** `null` for a missing agent or one of another tenant. */
  readonly get: (tx: Transaction | undefined, key: { tenantId: TenantId; agentId: CustomAgentId }) => Promise<CustomAgent | null>;
  /** Every agent of the tenant, newest first (`tenantId + createdAt desc`). */
  readonly listByTenant: (args: { tenantId: TenantId }) => Promise<readonly CustomAgent[]>;
  readonly count: (args: { tenantId: TenantId }) => Promise<number>;
  readonly create: (tx: Transaction, args: { agent: CustomAgent }) => void;
  readonly replace: (tx: Transaction, args: { agent: CustomAgent; actorId: string }) => void;
  readonly delete: (tx: Transaction, args: { agentId: CustomAgentId }) => void;
};

/** Firestore `custom-skills/{autoId}` (tenant data; Security Rules deny clients). */
export type CustomSkillRepository = {
  readonly newId: () => CustomSkillId;
  /** `null` for a missing skill or one of another tenant. */
  readonly get: (tx: Transaction | undefined, key: { tenantId: TenantId; skillId: CustomSkillId }) => Promise<CustomSkill | null>;
  /** Newest first (`tenantId + createdAt desc`). */
  readonly list: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<CustomSkill>>;
  readonly listByTenant: (args: { tenantId: TenantId }) => Promise<readonly CustomSkill[]>;
  readonly findByName: (tx: Transaction | undefined, key: { tenantId: TenantId; name: string }) => Promise<CustomSkill | null>;
  readonly count: (args: { tenantId: TenantId }) => Promise<number>;
  readonly create: (tx: Transaction, args: { skill: CustomSkill }) => void;
  readonly replace: (tx: Transaction, args: { skill: CustomSkill; actorId: string }) => void;
  readonly delete: (tx: Transaction, args: { skillId: CustomSkillId }) => void;
};

/** The limits of an organization's plan, with the platform defaults for what it does not set. */
export type CustomLimitsReader = (tenantId: TenantId) => Promise<CustomAgentLimits>;

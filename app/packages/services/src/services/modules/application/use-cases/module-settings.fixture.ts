// Test world for the module settings use cases: fresh per call (rule `testing`).
import {
  defineContract,
  MoneySchema,
  OrganizationIdSchema,
  type PermissionDefinition,
  type Principal,
  UserIdSchema,
} from "@core/contracts";
import { z } from "zod";
import { createInMemoryAccessStore } from "#/services/access/adapters/driven/in-memory-access-store.ts";
import { createAccessCore } from "#/services/access/composition.ts";
import { createInMemoryAuditLogWriter } from "#/services/audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "#/services/audit/application/use-cases/record-audit.ts";
import { fixedClock } from "#/services/shared/clock/clock.ts";
import { inMemoryUnitOfWork } from "#/services/shared/firestore/unit-of-work.ts";
import { createInMemoryModuleSettingsRepository } from "../../adapters/driven/in-memory-module-settings-repository.ts";
import { createModuleSettingsServices } from "../../composition.ts";
import type { ModuleSettingsDefinition } from "../../domain/module-settings-registry.ts";

export const NOW = "2026-09-30T12:00:00.000Z";
export const tenantId = OrganizationIdSchema.parse("org-a");

export const SampleSettingsSchema = z.strictObject({
  greeting: z.string().min(1).max(80).meta({ description: "Greeting shown on the module page.", pii: "none" }),
  defaultBudget: MoneySchema.meta({ description: "Default budget of new items.", pii: "none" }),
});

export const SAMPLE_SETTINGS: ModuleSettingsDefinition = {
  moduleId: "sample",
  contract: defineContract(SampleSettingsSchema, {
    id: "sample.SampleSettings",
    kind: "settings",
    description: "Settings of the sample module.",
    examples: [{ greeting: "Oi", defaultBudget: { amountMinor: 100, currency: "BRL" } }],
    pii: "none",
    tenancyScope: "organization",
    relations: [],
  }),
  readPermission: "sample.item.read",
  updatePermission: "sample.item.write",
};

export const SAMPLE_PERMISSIONS: PermissionDefinition[] = [
  {
    id: "sample.item.read",
    descriptionKey: "sample.permissions.item.read",
    kind: "read",
    scope: "tenant",
    defaultRoles: ["owner", "admin", "member", "viewer"],
  },
  {
    id: "sample.item.write",
    descriptionKey: "sample.permissions.item.write",
    kind: "write",
    scope: "tenant",
    defaultRoles: ["owner", "admin"],
  },
];

export const validValues = { greeting: "Olá", defaultBudget: { amountMinor: 150_000, currency: "BRL" } };

export const user = (uid: string): Principal => ({ type: "user", uid: UserIdSchema.parse(uid), mfa: false });

/** org-a with an owner, a viewer (read only) and a stranger (no grant). */
export const buildModuleSettingsWorld = () => {
  const clock = fixedClock(NOW);
  const store = createInMemoryAccessStore();
  store.putOrganization({ id: "org-a" });
  for (const uid of ["owner-1", "viewer-1", "stranger"]) store.putUser(uid);
  store.putGrant({
    tenantId: "org-a",
    principalId: "owner-1",
    nodeId: "org-a",
    roles: [{ kind: "system", key: "owner" }],
  });
  store.putGrant({
    tenantId: "org-a",
    principalId: "viewer-1",
    nodeId: "org-a",
    roles: [{ kind: "system", key: "viewer" }],
  });
  const access = createAccessCore({
    permissions: [{ moduleId: "sample", permissions: SAMPLE_PERMISSIONS }],
    readers: store,
    clock,
  });
  const auditLog = createInMemoryAuditLogWriter();
  const repository = createInMemoryModuleSettingsRepository();
  const services = createModuleSettingsServices({
    definitions: [SAMPLE_SETTINGS],
    repository,
    audit: makeRecordAudit({ writer: auditLog, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
  });
  return { access, auditLog, repository, services, clock };
};

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AUDIT_LOG_COLLECTIONS } from "../audit/adapters/driven/firestore-audit-log-writer.ts";
import { CONNECTORS_COLLECTION } from "../connectors/adapters/driven/firestore-connector-repository.ts";
import { CONVERSATIONS_COLLECTION } from "../conversations/adapters/driven/conversation-storage.ts";
import { CUSTOM_AGENTS_COLLECTION, CUSTOM_SKILLS_COLLECTION } from "../custom-agents/adapters/driven/firestore-custom-repositories.ts";
import { FILES_COLLECTION } from "../files/adapters/driven/firestore-file-repository.ts";
import { CORE_COLLECTIONS } from "./firestore/collections.ts";
import { IDEMPOTENCY_RECORDS_COLLECTION } from "./idempotency/firestore-idempotency-store.ts";
import { RATE_LIMIT_BUCKETS_COLLECTION } from "./rate-limit/firestore-rate-limiter.ts";

// `firestore.indexes.json` review (contracts/firebase-firestore.md §7, §20; decision 0006 §1).
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");

const IndexFieldSchema = z.looseObject({
  fieldPath: z.string(),
  order: z.enum(["ASCENDING", "DESCENDING"]).optional(),
  arrayConfig: z.literal("CONTAINS").optional(),
});
const IndexesFileSchema = z.looseObject({
  indexes: z.array(z.looseObject({ collectionGroup: z.string(), queryScope: z.string(), fields: z.array(IndexFieldSchema).min(2) })),
  fieldOverrides: z.array(z.looseObject({ collectionGroup: z.string(), fieldPath: z.string(), ttl: z.boolean().optional() })),
});

const file = IndexesFileSchema.parse(JSON.parse(readFileSync(path.join(WORKSPACE_ROOT, "firestore.indexes.json"), "utf8")));

/** Collections whose queries start from a key that is already bound to one tenant or one user. */
const TENANT_BOUND_FIRST_FIELD: Readonly<Record<string, string>> = {
  [CORE_COLLECTIONS.access]: "principalId", // "my organizations": one principal's own projections
  [CORE_COLLECTIONS.units]: "projectId", // a project belongs to exactly one tenant
  [CORE_COLLECTIONS.sessions]: "uid", // user-scoped collection (SP1 spec §4)
};

const signature = (collection: string, fields: readonly string[]) => `${collection}(${fields.join(",")})`;
const declared = new Set(
  file.indexes.map((index) =>
    signature(index.collectionGroup, index.fields.map((field) => `${field.fieldPath}:${field.order ?? field.arrayConfig ?? ""}`)),
  ),
);

/** Composite indexes needed by the Firestore adapters (SP1 Tasks 7–18, SP3 connectors); equality-only queries use index merging. */
const REQUIRED = [
  signature("access", ["tenantId:ASCENDING", "principalType:ASCENDING", "isRevoked:ASCENDING", "principalId:ASCENDING"]),
  signature("access", ["principalId:ASCENDING", "isRevoked:ASCENDING", "tenantId:ASCENDING"]),
  signature("approval-requests", ["tenantId:ASCENDING", "createdAt:DESCENDING"]),
  signature("approval-requests", ["tenantId:ASCENDING", "status:ASCENDING", "createdAt:DESCENDING"]),
  signature("invitations", ["tenantId:ASCENDING", "createdAt:DESCENDING"]),
  signature("invitations", ["tenantId:ASCENDING", "status:ASCENDING", "createdAt:DESCENDING"]),
  signature("memberships", ["tenantId:ASCENDING", "deletedAt:ASCENDING", "createdAt:ASCENDING"]),
  signature("memberships", ["tenantId:ASCENDING", "principalId:ASCENDING", "deletedAt:ASCENDING", "createdAt:ASCENDING"]),
  signature("roles", ["tenantId:ASCENDING", "deletedAt:ASCENDING", "name:ASCENDING"]),
  signature("projects", ["tenantId:ASCENDING", "deletedAt:ASCENDING", "name:ASCENDING"]),
  signature("units", ["projectId:ASCENDING", "parentUnitId:ASCENDING", "deletedAt:ASCENDING", "name:ASCENDING"]),
  signature("audit-logs", ["tenantId:ASCENDING", "occurredAt:DESCENDING"]),
  signature("audit-logs", ["tenantId:ASCENDING", "action:ASCENDING", "occurredAt:DESCENDING"]),
  signature("audit-logs", ["tenantId:ASCENDING", "actor.id:ASCENDING", "occurredAt:DESCENDING"]),
  signature("audit-logs", ["tenantId:ASCENDING", "action:ASCENDING", "actor.id:ASCENDING", "occurredAt:DESCENDING"]),
  signature("api-keys", ["tenantId:ASCENDING", "createdAt:DESCENDING"]),
  signature("devices", ["tenantId:ASCENDING", "createdAt:DESCENDING"]),
  signature("sessions", ["uid:ASCENDING", "revokedAt:ASCENDING", "createdAt:DESCENDING"]),
  signature("connectors", ["tenantId:ASCENDING", "createdAt:DESCENDING"]),
  signature("custom-agents", ["tenantId:ASCENDING", "createdAt:DESCENDING"]),
  signature("custom-skills", ["tenantId:ASCENDING", "createdAt:DESCENDING"]),
  // SP4 conversations: history list (with and without search) and the per-tenant stream cap.
  signature("conversations", ["tenantId:ASCENDING", "ownerId:ASCENDING", "deletedAt:ASCENDING", "archived:ASCENDING", "pinned:DESCENDING", "lastMessageAt:DESCENDING"]),
  signature("conversations", ["tenantId:ASCENDING", "ownerId:ASCENDING", "deletedAt:ASCENDING", "archived:ASCENDING", "searchTokens:CONTAINS", "pinned:DESCENDING", "lastMessageAt:DESCENDING"]),
  signature("conversations", ["tenantId:ASCENDING", "activeStreamStartedAt:ASCENDING"]),
];

/**
 * Cross-tenant indexes of server-only platform jobs (decisions 0030 A3 and 0036: the approval
 * expiry and interrupted-execution sweeps). No client query can use them: Rules deny the
 * collection, and only the sweeps run these queries.
 */
const PLATFORM_SWEEP_INDEXES: readonly string[] = [
  signature("approval-requests", ["status:ASCENDING", "expiresAt:ASCENDING"]),
  signature("approval-requests", ["status:ASCENDING", "updatedAt:ASCENDING"]),
];

const TTL_COLLECTIONS = [RATE_LIMIT_BUCKETS_COLLECTION, IDEMPOTENCY_RECORDS_COLLECTION, CORE_COLLECTIONS.deviceActivations];
const KNOWN_COLLECTIONS = new Set<string>([
  ...Object.values(CORE_COLLECTIONS),
  ...Object.values(AUDIT_LOG_COLLECTIONS),
  RATE_LIMIT_BUCKETS_COLLECTION,
  IDEMPOTENCY_RECORDS_COLLECTION,
  FILES_COLLECTION,
  CONNECTORS_COLLECTION,
  CONVERSATIONS_COLLECTION,
  CUSTOM_AGENTS_COLLECTION,
  CUSTOM_SKILLS_COLLECTION,
]);

describe("firestore.indexes.json", () => {
  it("starts every composite index with tenantId, or with a key already bound to one tenant or user", () => {
    const allowedFirst = (collection: string) => new Set(["tenantId", TENANT_BOUND_FIRST_FIELD[collection]]);
    const signatureOf = (index: (typeof file.indexes)[number]) =>
      signature(index.collectionGroup, index.fields.map((field) => `${field.fieldPath}:${field.order ?? field.arrayConfig ?? ""}`));
    const offending = file.indexes
      .filter((index) => !PLATFORM_SWEEP_INDEXES.includes(signatureOf(index)))
      .filter((index) => !allowedFirst(index.collectionGroup).has(index.fields[0]?.fieldPath))
      .map((index) => signature(index.collectionGroup, index.fields.map((field) => field.fieldPath)));
    expect(offending).toEqual([]);
  });

  it("declares indexes only on known collections, with collection scope", () => {
    expect(file.indexes.filter((index) => !KNOWN_COLLECTIONS.has(index.collectionGroup)).map((index) => index.collectionGroup)).toEqual([]);
    expect(new Set(file.indexes.map((index) => index.queryScope))).toEqual(new Set(["COLLECTION"]));
  });

  it("declares the composite index of every adapter query that needs one", () => {
    expect([...REQUIRED, ...PLATFORM_SWEEP_INDEXES].filter((required) => !declared.has(required))).toEqual([]);
  });

  it("has no duplicate composite index", () => {
    expect(declared.size).toBe(file.indexes.length);
  });

  it("declares a TTL on expiresAt for every expiring collection, and none on audit logs", () => {
    const ttl = file.fieldOverrides.filter((override) => override.ttl === true);
    expect(ttl.map((override) => `${override.collectionGroup}.${override.fieldPath}`).sort()).toEqual(
      TTL_COLLECTIONS.map((collection) => `${collection}.expiresAt`).sort(),
    );
  });
});

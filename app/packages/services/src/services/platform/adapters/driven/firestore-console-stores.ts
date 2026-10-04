import { AgentSettingsSchema, BudgetCapsSchema, type OrganizationStatus, type Plan, PlanSchema } from "@core/contracts";
import { FieldPath, type Firestore, Timestamp } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { CorruptDocumentError } from "#/services/shared/firestore/corrupt-document-error.ts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import type {
  AgentSettingsFields,
  AgentSettingsRepository,
  OrganizationAdminStore,
  OrganizationPlan,
  PlanRepository,
  StoredAgentSettings,
} from "../../application/ports/console-ports.ts";

/** Platform plans, automatic ids (decision 0039). */
export const PLANS_COLLECTION = "plans";
/** `organization-plans/{tenantId}`: plan assignment and staff budget override (platform data). */
export const ORGANIZATION_PLANS_COLLECTION = "organization-plans";
/** `agent-settings/{tenantId}` (the `agents.AgentSettings` contract names the tenant id as document id). */
export const AGENT_SETTINGS_COLLECTION = "agent-settings";

const isoOf = (value: unknown): unknown => (value instanceof Timestamp ? value.toDate().toISOString() : value);
const stamp = (iso: string): Timestamp => Timestamp.fromDate(new Date(iso));

type StoredFields = Readonly<Record<string, unknown>>;

const parsePlan = (id: string, data: StoredFields, path: string): Plan => {
  const parsed = PlanSchema.safeParse({
    id,
    name: data["name"],
    limits: data["limits"],
    createdAt: isoOf(data["createdAt"]),
    updatedAt: isoOf(data["updatedAt"]),
  });
  if (parsed.success) return parsed.data;
  throw new CorruptDocumentError({
    documentPath: path,
    issuePaths: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))],
  });
};

export const createFirestorePlanRepository = (deps: { readonly firestore: Firestore }): PlanRepository => {
  const plans = () => deps.firestore.collection(PLANS_COLLECTION);
  return {
    list: async () =>
      (await plans().orderBy("name").get()).docs.map((doc) => parsePlan(doc.id, doc.data(), doc.ref.path)),
    get: async (planId) => {
      const snapshot = await plans().doc(planId).get();
      return snapshot.exists ? parsePlan(snapshot.id, snapshot.data() ?? {}, snapshot.ref.path) : null;
    },
    create: async ({ name, limits, at, actorId }) => {
      const ref = plans().doc();
      await ref.set({
        name,
        limits,
        createdAt: stamp(at),
        updatedAt: stamp(at),
        createdBy: actorId,
        updatedBy: actorId,
        schemaVersion: CORE_SCHEMA_VERSION,
      });
      return parsePlan(ref.id, { name, limits, createdAt: at, updatedAt: at }, ref.path);
    },
    replace: ({ id, name, limits, at, actorId }) =>
      deps.firestore.runTransaction(async (tx) => {
        const ref = plans().doc(id);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) return null;
        tx.update(ref, { name, limits, updatedAt: stamp(at), updatedBy: actorId });
        return parsePlan(id, { name, limits, createdAt: isoOf(snapshot.get("createdAt")), updatedAt: at }, ref.path);
      }),
  };
};

const overrideOf = (value: unknown): OrganizationPlan["budgetOverride"] => {
  const parsed = BudgetCapsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** Most grants read to count an organization's members; beyond it the count stops growing (decision 0044). */
export const MEMBER_COUNT_GRANT_LIMIT = 10_000;

const listItemOf = (id: string, data: StoredFields): { id: string; name: string; status: OrganizationStatus } => ({
  id,
  name: typeof data["name"] === "string" ? data["name"] : "",
  status: data["status"] === "suspended" ? "suspended" : "active",
});

export const createFirestoreOrganizationAdminStore = (deps: {
  readonly firestore: Firestore;
}): OrganizationAdminStore => {
  const organizations = () => deps.firestore.collection(CORE_COLLECTIONS.organizations);
  const assignments = () => deps.firestore.collection(ORGANIZATION_PLANS_COLLECTION);
  return {
    listLive: async ({ after, limit }) => {
      let query = organizations()
        .where("deletedAt", "==", null)
        .orderBy(FieldPath.documentId())
        .limit(limit + 1);
      if (after !== undefined) query = query.startAfter(after[1]);
      const snapshot = await query.get();
      return pageFromOverfetch({
        fetched: snapshot.docs.map((doc) => listItemOf(doc.id, doc.data())),
        limit,
        positionOf: (item) => [item.id, item.id],
      });
    },
    getLive: async (tenantId) => {
      const snapshot = await organizations().doc(tenantId).get();
      return snapshot.exists && snapshot.get("deletedAt") === null
        ? listItemOf(snapshot.id, snapshot.data() ?? {})
        : null;
    },
    setStatus: ({ tenantId, status, at, actorId }) =>
      deps.firestore.runTransaction(async (tx) => {
        const ref = organizations().doc(tenantId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists || snapshot.get("deletedAt") !== null) return false;
        tx.update(ref, { status, updatedAt: stamp(at), updatedBy: actorId });
        return true;
      }),
    // `count()` cannot count distinct values and one person may hold grants at several nodes, so the
    // live user grants are read with only `principalId` and deduplicated here. Equality filters
    // only: the automatic single-field indexes serve it.
    countMembers: async (tenantId) => {
      const snapshot = await deps.firestore
        .collection(CORE_COLLECTIONS.memberships)
        .where("tenantId", "==", tenantId)
        .where("principalType", "==", "user")
        .where("deletedAt", "==", null)
        .select("principalId")
        .limit(MEMBER_COUNT_GRANT_LIMIT)
        .get();
      return new Set(
        snapshot.docs.map((doc) => doc.get("principalId") as unknown).filter((id) => typeof id === "string"),
      ).size;
    },
    getPlan: async (tenantId) => {
      const data = (await assignments().doc(tenantId).get()).data();
      return {
        tenantId,
        planId: typeof data?.["planId"] === "string" ? data["planId"] : null,
        budgetOverride: overrideOf(data?.["budgetOverride"]),
      };
    },
    setPlan: async ({ tenantId, planId, budgetOverride, at, actorId }) => {
      await assignments()
        .doc(tenantId)
        .set({
          tenantId,
          planId,
          budgetOverride,
          updatedAt: stamp(at),
          updatedBy: actorId,
          schemaVersion: CORE_SCHEMA_VERSION,
        });
    },
    tenantsOnPlan: async (planId) =>
      (await assignments().where("planId", "==", planId).get()).docs.map((doc) => doc.id),
  };
};

// `ownBudget` is not a stored field: the read model takes it from `selfCap` (decision 0060).
const StoredSettingsSchema = AgentSettingsSchema.omit({ ownBudget: true });

const toSettings = (tenantId: string, data: StoredFields, path: string): AgentSettingsFields => {
  const parsed = StoredSettingsSchema.safeParse({
    tenantId,
    enabledAgents: data["enabledAgents"],
    webTools: data["webTools"],
    guardrails: data["guardrails"],
    budget: data["budget"],
    updatedBy: data["updatedBy"] ?? null,
    createdAt: isoOf(data["createdAt"]),
    updatedAt: isoOf(data["updatedAt"]),
  });
  if (parsed.success) return parsed.data;
  throw new CorruptDocumentError({
    documentPath: path,
    issuePaths: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))],
  });
};

export const createFirestoreAgentSettingsRepository = (deps: {
  readonly firestore: Firestore;
}): AgentSettingsRepository => {
  const settings = () => deps.firestore.collection(AGENT_SETTINGS_COLLECTION);
  return {
    get: async (tenantId): Promise<StoredAgentSettings | null> => {
      const snapshot = await settings().doc(tenantId).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() ?? {};
      return { settings: toSettings(snapshot.id, data, snapshot.ref.path), selfCap: overrideOf(data["selfCap"]) };
    },
    save: async ({ settings: value, selfCap }) => {
      const { tenantId, createdAt, updatedAt, ...fields } = value;
      await settings()
        .doc(tenantId)
        .set({
          ...fields,
          tenantId,
          selfCap,
          createdAt: stamp(createdAt),
          updatedAt: stamp(updatedAt),
          schemaVersion: CORE_SCHEMA_VERSION,
        });
    },
  };
};

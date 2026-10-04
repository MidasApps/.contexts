import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "./firestore/collections.ts";
import {
  DELETED_ORG,
  ORG_1,
  ORG_2,
  PROJECT,
  READABLE_COLLECTIONS,
  seededDocuments,
  seedRulesFixture,
  serverOnlyDocId,
  TOKENS,
  type TokenName,
  UID,
  UNIT,
  UNREADABLE_COLLECTIONS,
} from "./testing/firestore-rules.fixture.ts";

// Security Rules of SP1 (spec §5.5, decision 0006 §5): reads per node through the access
// projection of the active tenant, every client write denied. Runs inside
// `firebase emulators:exec`; `demo-*` guarantees no remote project is hit.
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-core",
    firestore: { rules: readFileSync(path.join(WORKSPACE_ROOT, "firestore.rules"), "utf8") },
  });
  await seedRulesFixture(testEnv);
  // Loading the rules and ~40 docs takes seconds when every emulator suite shares the machine.
}, 60_000);

afterAll(async () => {
  await testEnv.cleanup();
});

const as = (name: TokenName | "anonymous"): RulesTestContext =>
  name === "anonymous"
    ? testEnv.unauthenticatedContext()
    : testEnv.authenticatedContext(TOKENS[name].uid, TOKENS[name].claims);

const read = (name: TokenName | "anonymous", docPath: string) => as(name).firestore().doc(docPath).get();
const allowed = (name: TokenName | "anonymous", docPath: string) =>
  expect(assertSucceeds(read(name, docPath))).resolves.toBeDefined();
const denied = (name: TokenName | "anonymous", docPath: string) =>
  expect(assertFails(read(name, docPath))).resolves.toBeDefined();

describe("collection coverage", () => {
  it("classifies every core collection as readable or server-only", () => {
    const classified = new Set<string>([...READABLE_COLLECTIONS, ...UNREADABLE_COLLECTIONS]);
    expect(Object.values(CORE_COLLECTIONS).filter((name) => !classified.has(name))).toEqual([]);
  });
});

describe("users/{uid}", () => {
  it("lets a user read their own profile only", async () => {
    await allowed("owner", `users/${UID.owner}`);
    await allowed("ownerWithoutTenant", `users/${UID.owner}`);
    await denied("owner", `users/${UID.projectMember}`);
    await denied("anonymous", `users/${UID.owner}`);
  });

  it("denies an impersonated token, whose reads must go through the audited /v1", async () => {
    await denied("impersonated", `users/${UID.owner}`);
  });
});

describe("access/{tenantId}_{uid}", () => {
  it("lets a principal read its own access doc of the active tenant only", async () => {
    await allowed("owner", `access/${ORG_1}_${UID.owner}`);
    await denied("owner", `access/${ORG_2}_${UID.owner}`);
    await allowed("ownerInOrg2", `access/${ORG_2}_${UID.owner}`);
    await denied("owner", `access/${ORG_1}_${UID.projectMember}`);
    await allowed("device", `access/${ORG_1}_${UID.device}`);
  });

  it("denies a token without an active tenant, the anonymous client and impersonation", async () => {
    await denied("ownerWithoutTenant", `access/${ORG_1}_${UID.owner}`);
    await denied("anonymous", `access/${ORG_1}_${UID.owner}`);
    await denied("impersonated", `access/${ORG_1}_${UID.owner}`);
  });
});

describe("organizations/{orgId}", () => {
  it("is readable by members of the active tenant, at any node", async () => {
    for (const name of ["owner", "projectMember", "unitMember", "siblingMember"] as const)
      await allowed(name, `organizations/${ORG_1}`);
  });

  it("isolates organizations: only the active tenant is readable (multi-organization owner)", async () => {
    await denied("owner", `organizations/${ORG_2}`);
    await allowed("ownerInOrg2", `organizations/${ORG_2}`);
    await denied("ownerInOrg2", `organizations/${ORG_1}`);
  });

  it("denies revoked members, outsiders with a forged tenant claim, tokens without a tenant, and anonymous clients", async () => {
    await denied("revoked", `organizations/${ORG_1}`);
    await denied("outsider", `organizations/${ORG_1}`);
    await denied("ownerWithoutTenant", `organizations/${ORG_1}`);
    await denied("anonymous", `organizations/${ORG_1}`);
  });

  it("denies a soft-deleted organization", async () => {
    await denied("ownerInDeletedOrg", `organizations/${DELETED_ORG}`);
  });

  it("lets a device principal read its tenant's organization, not another one", async () => {
    await allowed("device", `organizations/${ORG_1}`);
    await denied("device", `organizations/${ORG_2}`);
  });

  it("gives platform staff no direct tenant read, and denies impersonated tokens", async () => {
    await denied("staff", `organizations/${ORG_1}`);
    await denied("impersonated", `organizations/${ORG_1}`);
  });
});

describe("projects/{projectId}", () => {
  it("is visible org-wide or through visibleProjectIds", async () => {
    await allowed("owner", `projects/${PROJECT.first}`);
    await allowed("owner", `projects/${PROJECT.second}`);
    await allowed("projectMember", `projects/${PROJECT.first}`);
    await denied("projectMember", `projects/${PROJECT.second}`);
    await allowed("unitMember", `projects/${PROJECT.first}`);
    await denied("unitMember", `projects/${PROJECT.second}`);
    await allowed("device", `projects/${PROJECT.first}`);
    await denied("device", `projects/${PROJECT.second}`);
  });

  it("denies another tenant's project, soft-deleted projects, revoked members and staff", async () => {
    await denied("owner", `projects/${PROJECT.otherTenant}`);
    await allowed("ownerInOrg2", `projects/${PROJECT.otherTenant}`);
    await denied("owner", `projects/${PROJECT.deleted}`);
    await denied("revoked", `projects/${PROJECT.first}`);
    await denied("outsider", `projects/${PROJECT.first}`);
    await denied("staff", `projects/${PROJECT.first}`);
    await denied("impersonated", `projects/${PROJECT.first}`);
  });

  it("allows an org-wide list query only when it filters by the active tenant and live docs", async () => {
    const projects = () => as("owner").firestore().collection("projects");
    await expect(
      assertSucceeds(projects().where("tenantId", "==", ORG_1).where("deletedAt", "==", null).get()),
    ).resolves.toBeDefined();
    await expect(assertFails(projects().get())).resolves.toBeDefined();
    await expect(
      assertFails(projects().where("tenantId", "==", ORG_2).where("deletedAt", "==", null).get()),
    ).resolves.toBeDefined();
  });
});

describe("units/{unitId}", () => {
  it("inherits org-wide and project grants", async () => {
    for (const id of [UNIT.a, UNIT.a1, UNIT.b]) {
      await allowed("owner", `units/${id}`);
      await allowed("projectMember", `units/${id}`);
      await allowed("device", `units/${id}`);
    }
  });

  it("is visible through a grant on the unit or an ancestor, never through a sibling", async () => {
    await allowed("unitMember", `units/${UNIT.a}`);
    await allowed("unitMember", `units/${UNIT.a1}`);
    await denied("unitMember", `units/${UNIT.b}`);
    await allowed("siblingMember", `units/${UNIT.b}`);
    await denied("siblingMember", `units/${UNIT.a}`);
    await denied("siblingMember", `units/${UNIT.a1}`);
  });

  it("denies soft-deleted units, other tenants' claims, revoked members, staff and impersonation", async () => {
    await denied("owner", `units/${UNIT.deleted}`);
    await denied("unitMember", `units/${UNIT.deleted}`);
    await denied("ownerInOrg2", `units/${UNIT.a}`);
    await denied("revoked", `units/${UNIT.a}`);
    await denied("staff", `units/${UNIT.a}`);
    await denied("impersonated", `units/${UNIT.a}`);
  });
});

const EVERY_PRINCIPAL = ["anonymous", ...(Object.keys(TOKENS) as TokenName[])] as const;

describe.each(UNREADABLE_COLLECTIONS)("server-only collection %s", (collection) => {
  it("is unreadable for every principal, by id and by query", async () => {
    const docPath = `${collection}/${serverOnlyDocId(collection)}`;
    for (const name of EVERY_PRINCIPAL) {
      await denied(name, docPath);
      await expect(
        assertFails(as(name).firestore().collection(collection).where("tenantId", "==", ORG_1).get()),
      ).resolves.toBeDefined();
    }
  });
});

describe.each([...READABLE_COLLECTIONS, ...UNREADABLE_COLLECTIONS])("client writes to %s", (collection) => {
  it("are denied for every principal (create, update, delete)", async () => {
    const existing = Object.keys(seededDocuments()).find((docPath) => docPath.startsWith(`${collection}/`));
    expect(existing).toBeDefined();
    for (const name of EVERY_PRINCIPAL) {
      const db = as(name).firestore();
      const data = { tenantId: ORG_1, principalId: TOKENS.owner.uid, uid: TOKENS.owner.uid };
      await expect(assertFails(db.collection(collection).doc(`new-${name}`).set(data))).resolves.toBeDefined();
      await expect(assertFails(db.doc(existing ?? "").set(data, { merge: true }))).resolves.toBeDefined();
      await expect(assertFails(db.doc(existing ?? "").delete())).resolves.toBeDefined();
    }
  });
});

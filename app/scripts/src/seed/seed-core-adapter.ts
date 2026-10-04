import {
  CORE_COLLECTIONS,
  CORE_UNIT_TYPE_ID,
  type FirebaseAdmin,
  OrganizationIdSchema,
  ProjectIdSchema,
  type Result,
  resolveRequestId,
  UnitIdSchema,
  UserIdSchema,
} from "@core/services";
import type { CoreServer } from "@core/services/composition";
import type { Named, SeedCore } from "./seed-core-port.ts";

/**
 * Seeded units use the core's neutral `core.unit` (decision 0030 A6), which every app
 * registers, so they can be moved through `/v1` whatever modules the app installs.
 */
export const SEED_UNIT_TYPE = CORE_UNIT_TYPE_ID;

const SEED_PHONE_ENROLLMENT_ID = "seed-phone";
const SEED_DEFAULTS = { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } as const;
const PAGE = { after: undefined, limit: 100 } as const;

/** A use case refusal is a seed bug (the owner acts on its own nodes): fail with its code. */
const unwrap = <T>(result: Result<T, { code?: string; message: string }>, operation: string): T => {
  if (result.ok) return result.data;
  throw new Error(`seed ${operation} failed: ${result.error.code ?? result.error.message}`);
};

const named = (node: { id: string; name: string }): Named => ({ id: node.id, name: node.name });

const actorOf = (uid: string) => ({ type: "user", uid: UserIdSchema.parse(uid), mfa: false }) as const;

/** Binds the seed port to the services use cases (`createCoreServer` without modules). */
export const createCoreSeedAdapter = (args: { server: CoreServer; firebase: FirebaseAdmin }): SeedCore => {
  const { server, firebase } = args;
  const scope = (uid: string) => ({
    actor: actorOf(uid),
    access: server.access.forRequest(),
    requestId: resolveRequestId(null),
  });
  return {
    ensureProfile: async (uid) => {
      unwrap(await server.identity.getMe({ actor: actorOf(uid) }), "profile");
    },
    listOrganizations: async (uid) =>
      (
        await server.identity.listMyOrganizations({
          actor: actorOf(uid),
          access: server.access.forRequest(),
          page: PAGE,
        })
      ).items.map(named),
    createOrganization: async ({ uid, name }) =>
      named(
        unwrap(
          await server.tenancy.createOrganization({ ...scope(uid), input: { name, defaults: SEED_DEFAULTS } }),
          "organization",
        ),
      ),
    listProjects: async ({ uid, organizationId }) =>
      unwrap(
        await server.tenancy.listProjects({
          ...scope(uid),
          tenantId: OrganizationIdSchema.parse(organizationId),
          page: PAGE,
        }),
        "project list",
      ).items.map(named),
    createProject: async ({ uid, organizationId, name }) =>
      named(
        unwrap(
          await server.tenancy.createProject({
            ...scope(uid),
            tenantId: OrganizationIdSchema.parse(organizationId),
            input: { name },
          }),
          "project",
        ),
      ),
    listUnits: async ({ uid, projectId, parentUnitId }) => {
      const parent = parentUnitId === null ? null : UnitIdSchema.parse(parentUnitId);
      return unwrap(
        await server.tenancy.listUnits({
          ...scope(uid),
          projectId: ProjectIdSchema.parse(projectId),
          parentUnitId: parent,
          page: PAGE,
        }),
        "unit list",
      ).items.map(named);
    },
    createUnit: async ({ uid, projectId, parentUnitId, name }) => {
      const input = {
        name,
        type: SEED_UNIT_TYPE,
        parentUnitId: parentUnitId === null ? null : UnitIdSchema.parse(parentUnitId),
      };
      return named(
        unwrap(
          await server.tenancy.createUnit({ ...scope(uid), projectId: ProjectIdSchema.parse(projectId), input }),
          "unit",
        ),
      );
    },
    grantRole: async ({ actorUid, principalUid, node, role }) => {
      const tenantId = OrganizationIdSchema.parse(node.organizationId);
      const nodeRef =
        node.level === "organization"
          ? ({ level: "organization", tenantId } as const)
          : ({ level: "project", tenantId, projectId: ProjectIdSchema.parse(node.projectId) } as const);
      const granted = await server.accessServices.grantMembership({
        ...scope(actorUid),
        tenantId,
        principal: { type: "user", id: principalUid },
        node: nodeRef,
        roles: [{ kind: "system", key: role }],
      });
      if (!granted.ok && granted.error.code === "MEMBERSHIP_EXISTS") return "unchanged";
      unwrap(granted, "grant");
      return "granted";
    },
    ensureActiveOrganization: async ({ uid, organizationId }) => {
      const me = unwrap(await server.identity.getMe({ actor: actorOf(uid) }), "profile");
      if (me.lastContext.organizationId === organizationId) return "unchanged";
      unwrap(
        await server.identity.setActiveOrganization({
          ...scope(uid),
          organizationId: OrganizationIdSchema.parse(organizationId),
        }),
        "active organization",
      );
      return "set";
    },
    // Read-only check of the staff doc; the grant itself goes through the platform use case.
    staffRoleOf: async (uid) => {
      const staff = (await firebase.firestore.collection(CORE_COLLECTIONS.platformStaff).doc(uid).get()).data();
      return staff?.["isActive"] === true && typeof staff["role"] === "string" ? staff["role"] : null;
    },
    grantStaff: async ({ uid, role }) => {
      await server.platform.grantPlatformStaff({
        uid: UserIdSchema.parse(uid),
        role,
        requestId: resolveRequestId(null),
      });
    },
    ensurePhoneFactor: async ({ uid, phoneNumber }) => {
      const factors = (await firebase.auth.getUser(uid)).multiFactor?.enrolledFactors ?? [];
      const enrolled =
        factors.length === 1 &&
        factors[0]?.factorId === "phone" &&
        "phoneNumber" in factors[0] &&
        factors[0].phoneNumber === phoneNumber;
      if (enrolled) return "unchanged";
      // The Auth Emulator's accounts:update needs an explicit enrollment id (`uid`).
      const factor = {
        uid: SEED_PHONE_ENROLLMENT_ID,
        factorId: "phone",
        phoneNumber,
        displayName: "Seed phone",
      } as const;
      await firebase.auth.updateUser(uid, { multiFactor: { enrolledFactors: [factor] } });
      return "enrolled";
    },
  };
};

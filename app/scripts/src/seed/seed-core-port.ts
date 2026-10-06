/**
 * What the SP1 seed steps need from the core services (SP1 Task 20). The adapter
 * (`seed-core-adapter.ts`) calls the services use cases, never raw documents, so projections,
 * claims and audit entries stay consistent; unit tests use an in-memory fake.
 */
export type Named = { readonly id: string; readonly name: string };

export type SeedGrantNode =
  | { readonly level: "organization"; readonly organizationId: string }
  | { readonly level: "project"; readonly organizationId: string; readonly projectId: string };

export type SeedSystemRole = "member" | "viewer";

export type SeedCore = {
  /** Creates the `users/{uid}` doc from the Auth account when missing (`GET /v1/me`). */
  readonly ensureProfile: (uid: string) => Promise<void>;
  readonly listOrganizations: (uid: string) => Promise<readonly Named[]>;
  readonly createOrganization: (args: { uid: string; name: string }) => Promise<Named>;
  readonly listProjects: (args: { uid: string; organizationId: string }) => Promise<readonly Named[]>;
  readonly createProject: (args: { uid: string; organizationId: string; name: string }) => Promise<Named>;
  readonly listUnits: (args: {
    uid: string;
    projectId: string;
    parentUnitId: string | null;
  }) => Promise<readonly Named[]>;
  readonly createUnit: (args: {
    uid: string;
    projectId: string;
    parentUnitId: string | null;
    name: string;
  }) => Promise<Named>;
  /** `granted`, or `unchanged` when the principal already holds a grant on that node. */
  readonly grantRole: (args: {
    actorUid: string;
    principalUid: string;
    node: SeedGrantNode;
    role: SeedSystemRole;
  }) => Promise<"granted" | "unchanged">;
  /** Makes `organizationId` the user's active organization (claims synced); `unchanged` when it already is. */
  readonly ensureActiveOrganization: (args: { uid: string; organizationId: string }) => Promise<"set" | "unchanged">;
  /** The active platform role of `uid`, or null. */
  readonly staffRoleOf: (uid: string) => Promise<string | null>;
  readonly grantStaff: (args: { uid: string; role: "platform-admin" }) => Promise<void>;
  /** Enrolls exactly one SMS second factor with this number; `unchanged` when it already is. */
  readonly ensurePhoneFactor: (args: { uid: string; phoneNumber: string }) => Promise<"enrolled" | "unchanged">;
};

/** Ids the steps hand to later steps (the knowledge seed needs the demo organization). */
export type SeedState = {
  uids: Partial<Record<"owner" | "member" | "viewer" | "invitee" | "staff", string>>;
  demoOrganizationId?: string;
  firstProjectId?: string;
};

/** Finds a node by its seeded name or creates it; `created` tells the summary which one happened. */
export const findOrCreate = async (args: {
  existing: readonly Named[];
  name: string;
  create: () => Promise<Named>;
}): Promise<{ node: Named; created: boolean }> => {
  const found = args.existing.find((node) => node.name === args.name);
  return found === undefined ? { node: await args.create(), created: true } : { node: found, created: false };
};

export const requireUid = (state: SeedState, key: keyof SeedState["uids"]): string => {
  const uid = state.uids[key];
  if (uid === undefined) throw new Error(`seed step order: the ${key} user must be seeded first`);
  return uid;
};

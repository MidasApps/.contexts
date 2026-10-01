import type { AuthAdmin } from "./auth-admin.ts";
import type { SeedCore, SeedState } from "./seed-core-port.ts";
import { createPostgresClient, createPostgresPromptRepository, loadServicesEnv } from "@core/services";
import { importPromptSeeds } from "./import-prompt-seeds.ts";
import { createKnowledgeSeedDeps, seedKnowledgeBase } from "./seed-knowledge.ts";
import { seedMembers } from "./seed-members.ts";
import { upsertOwnerUser } from "./seed-owner-user.ts";
import { seedStaff } from "./seed-staff.ts";
import type { SeedTarget } from "./seed-target.ts";
import { seedTenancy } from "./seed-tenancy.ts";

export type SeedContext = {
  target: SeedTarget;
  auth: AuthAdmin;
  /** The core services (Firestore and Auth emulators) the SP1 steps write through. */
  core: SeedCore;
  /** Ids earlier steps hand to later ones. */
  state: SeedState;
  /** The local env (`.env.local` loaded), for steps that build their own clients. */
  processEnv: Record<string, string | undefined>;
};

/** One idempotent seed step; `run` returns a one-line summary for the console. */
export type SeedStep = { name: string; run: (context: SeedContext) => Promise<string> };

const ownerUserStep: SeedStep = {
  name: "owner user",
  run: async ({ target, auth, core, state }) => {
    const { action, user } = await upsertOwnerUser(auth, target.owner);
    state.uids.owner = user.localId;
    await core.ensureProfile(user.localId);
    return `${action} ${user.email} (uid ${user.localId})`;
  },
};

// SP1 Task 20: organizations, projects, units, members and platform staff.
const tenancyStep: SeedStep = { name: "tenancy", run: ({ core, state }) => seedTenancy(core, state) };
const membersStep: SeedStep = { name: "members", run: (context) => seedMembers(context) };
const staffStep: SeedStep = { name: "platform staff", run: (context) => seedStaff(context) };

// SP3 Task 14: platform catalog documents plus two sample documents (Postgres, AI_MODE models)
// for the demo organization of the tenancy step.
const knowledgeStep: SeedStep = {
  name: "knowledge base",
  run: async ({ processEnv, state }) => {
    const tenantId = state.demoOrganizationId;
    if (tenantId === undefined) throw new Error("seed step order: tenancy must be seeded before the knowledge base");
    const { deps, close } = createKnowledgeSeedDeps(processEnv);
    try {
      return await seedKnowledgeBase(deps, tenantId);
    } finally {
      await close();
    }
  },
};

/**
 * Steps run in order; each is idempotent (looked up by fixed emails and names before it
 * creates anything) and must never create a second copy when it runs again. Later steps
 * read the ids earlier ones put in `SeedContext.state`.
 */
// SP5 Task 9: code seeds of the agent prompts as active platform version 1 (decision 0038).
const promptSeedsStep: SeedStep = {
  name: "prompt seeds",
  run: async ({ processEnv }) => {
    const sql = createPostgresClient({ DATABASE_URL: loadServicesEnv(processEnv).DATABASE_URL }, { max: 1 });
    try {
      const { imported, skipped } = await importPromptSeeds({ prompts: createPostgresPromptRepository(sql) });
      return `imported ${imported.length}, already present ${skipped.length}`;
    } finally {
      await sql.end();
    }
  },
};

export const LOCAL_SEED_STEPS: readonly SeedStep[] = [ownerUserStep, tenancyStep, membersStep, staffStep, knowledgeStep, promptSeedsStep];

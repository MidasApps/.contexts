import type { AuthAdmin } from "./auth-admin.ts";
import { createKnowledgeSeedDeps, seedKnowledgeBase } from "./seed-knowledge.ts";
import { upsertOwnerUser } from "./seed-owner-user.ts";
import type { SeedTarget } from "./seed-target.ts";

export type SeedContext = {
  target: SeedTarget;
  auth: AuthAdmin;
  /** The local env (`.env.local` loaded), for steps that build their own clients. */
  processEnv: Record<string, string | undefined>;
};

/** One idempotent seed step; `run` returns a one-line summary for the console. */
export type SeedStep = { name: string; run: (context: SeedContext) => Promise<string> };

const ownerUserStep: SeedStep = {
  name: "owner user",
  run: async ({ target, auth }) => {
    const { action, user } = await upsertOwnerUser(auth, target.owner);
    return `${action} ${user.email} (uid ${user.localId})`;
  },
};

// SP3 Task 14: platform catalog documents plus two sample documents (Postgres, AI_MODE models).
const knowledgeStep: SeedStep = {
  name: "knowledge base",
  run: async ({ processEnv }) => {
    const { deps, close } = createKnowledgeSeedDeps(processEnv);
    try {
      return await seedKnowledgeBase(deps);
    } finally {
      await close();
    }
  },
};

/**
 * Steps run in order. SP0 only has identity, so the only step is the owner user.
 * Extension point: SP1 appends the organization, project and role steps here
 * (Firestore emulator), each idempotent and keyed by the owner uid from the step
 * above. A step must never create a second copy when it runs again.
 */
export const LOCAL_SEED_STEPS: readonly SeedStep[] = [ownerUserStep, knowledgeStep];

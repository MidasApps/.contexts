import {
  type PromptActivation,
  PromptActivationSchema,
  type PromptVersion,
  PromptVersionSchema,
} from "@core/contracts";
import type { Sql, TransactionSql } from "postgres";
import { withTenantTransaction } from "../../../shared/postgres/with-tenant-transaction.ts";
import type { ActivePrompts, PromptKey, PromptRepository } from "../../application/ports/prompt-repository.ts";

export const PROMPTS_RUNTIME_ROLE = "prompts_runtime";

/**
 * `app.tenant_id` of a platform-only transaction: no organization has this id (Firestore automatic
 * ids are alphanumeric), so only platform rows (`tenant_id IS NULL`) are visible.
 */
export const PLATFORM_PROMPT_SCOPE = "~platform";

const scopeOf = (tenantId: string | null): string => tenantId ?? PLATFORM_PROMPT_SCOPE;

const asRuntime = async (tx: TransactionSql): Promise<void> => {
  await tx.unsafe(`SET LOCAL ROLE ${PROMPTS_RUNTIME_ROLE}`);
};

type VersionRow = {
  id: string;
  agent_id: string;
  scope: string;
  tenant_id: string | null;
  version: number;
  body: string;
  body_sha256: string;
  note: string | null;
  eval_experiment_id: string | null;
  eval_verdict: string | null;
  created_by: string;
  created_at: Date;
};

type ActivationRow = {
  id: string;
  agent_id: string;
  scope: string;
  tenant_id: string | null;
  version_id: string;
  forced: boolean;
  reason: string | null;
  activated_by: string;
  activated_at: Date;
};

const toVersion = (row: VersionRow): PromptVersion =>
  PromptVersionSchema.parse({
    id: row.id,
    agentId: row.agent_id,
    scope: row.scope,
    tenantId: row.tenant_id,
    version: row.version,
    body: row.body,
    bodySha256: row.body_sha256,
    note: row.note,
    evalExperimentId: row.eval_experiment_id,
    evalVerdict: row.eval_verdict,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  });

const toActivation = (row: ActivationRow): PromptActivation =>
  PromptActivationSchema.parse({
    id: row.id,
    agentId: row.agent_id,
    scope: row.scope,
    tenantId: row.tenant_id,
    versionId: row.version_id,
    forced: row.forced,
    reason: row.reason,
    activatedBy: row.activated_by,
    activatedAt: row.activated_at.toISOString(),
  });

const UNIQUE_VIOLATION = "23505";

const insertVersion =
  (sql: Sql) =>
  async (input: Parameters<PromptRepository["insertVersion"]>[0]): Promise<PromptVersion> => {
    const attempt = () =>
      withTenantTransaction(sql, { tenantId: scopeOf(input.tenantId) }, async (tx) => {
        await asRuntime(tx);
        const [row] = await tx<VersionRow[]>`
        INSERT INTO agents.prompt_versions (agent_id, scope, tenant_id, version, body, body_sha256, note, created_by)
        SELECT ${input.agentId}, ${input.scope}, ${input.tenantId}, coalesce(max(version), 0) + 1, ${input.body}, ${input.bodySha256}, ${input.note}, ${input.createdBy}
        FROM agents.prompt_versions
        WHERE agent_id = ${input.agentId} AND scope = ${input.scope} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}
        RETURNING *`;
        if (row === undefined) throw new Error("prompt version insert returned no row");
        return toVersion(row);
      });
    try {
      return await attempt();
    } catch (error: unknown) {
      // Two writers computed the same next version; the unique key refused one, which retries once.
      if ((error as { code?: unknown }).code !== UNIQUE_VIOLATION) throw error;
      return attempt();
    }
  };

const keyFilter = (tx: TransactionSql, key: PromptKey) =>
  tx`agent_id = ${key.agentId} AND scope = ${key.scope} AND tenant_id IS NOT DISTINCT FROM ${key.tenantId}`;

const latestActive = async (
  tx: TransactionSql,
  agentId: string,
  scope: "platform" | "tenant",
  tenantId: string | null,
) => {
  const [row] = await tx<{ version_id: string; body: string }[]>`
    SELECT a.version_id, v.body FROM agents.prompt_activations a
    JOIN agents.prompt_versions v ON v.id = a.version_id
    WHERE a.agent_id = ${agentId} AND a.scope = ${scope} AND a.tenant_id IS NOT DISTINCT FROM ${tenantId}
    ORDER BY a.activated_at DESC, a.id DESC LIMIT 1`;
  return row === undefined ? null : { versionId: row.version_id, body: row.body };
};

/**
 * Prompt store over Postgres (decision 0038): every transaction is scoped (`withTenantTransaction`,
 * platform reads under `PLATFORM_PROMPT_SCOPE`) and runs as `prompts_runtime`, which can only
 * insert rows and record evals: there is no update or delete path for bodies or activations.
 */
export const createPostgresPromptRepository = (sql: Sql): PromptRepository => ({
  insertVersion: insertVersion(sql),
  listVersions: (key) =>
    withTenantTransaction(sql, { tenantId: scopeOf(key.tenantId), readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const rows = await tx<
        VersionRow[]
      >`SELECT * FROM agents.prompt_versions WHERE ${keyFilter(tx, key)} ORDER BY version DESC`;
      return rows.map(toVersion);
    }),
  getVersion: ({ versionId, tenantId }) =>
    withTenantTransaction(sql, { tenantId: scopeOf(tenantId), readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const [row] = await tx<VersionRow[]>`SELECT * FROM agents.prompt_versions WHERE id = ${versionId}`;
      return row === undefined ? null : toVersion(row);
    }),
  recordEval: ({ versionId, tenantId, experimentId, verdict }) =>
    withTenantTransaction(sql, { tenantId: scopeOf(tenantId) }, async (tx) => {
      await asRuntime(tx);
      await tx`UPDATE agents.prompt_versions SET eval_experiment_id = ${experimentId}, eval_verdict = ${verdict}, updated_at = now() WHERE id = ${versionId}`;
    }),
  insertActivation: (input) =>
    withTenantTransaction(sql, { tenantId: scopeOf(input.tenantId) }, async (tx) => {
      await asRuntime(tx);
      const [row] = await tx<ActivationRow[]>`
        INSERT INTO agents.prompt_activations (agent_id, scope, tenant_id, version_id, forced, reason, activated_by)
        VALUES (${input.agentId}, ${input.scope}, ${input.tenantId}, ${input.versionId}, ${input.forced}, ${input.reason}, ${input.activatedBy})
        RETURNING *`;
      if (row === undefined) throw new Error("prompt activation insert returned no row");
      return toActivation(row);
    }),
  listActivations: (key) =>
    withTenantTransaction(sql, { tenantId: scopeOf(key.tenantId), readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const rows = await tx<
        ActivationRow[]
      >`SELECT * FROM agents.prompt_activations WHERE ${keyFilter(tx, key)} ORDER BY activated_at DESC, id DESC`;
      return rows.map(toActivation);
    }),
  getActive: ({ agentId, tenantId }): Promise<ActivePrompts> =>
    withTenantTransaction(sql, { tenantId: scopeOf(tenantId), readOnly: true }, async (tx) => {
      await asRuntime(tx);
      const platform = await latestActive(tx, agentId, "platform", null);
      const addendum = tenantId === null ? null : await latestActive(tx, agentId, "tenant", tenantId);
      return { platform, addendum };
    }),
});

import { type PromptActivation, PromptActivationSchema, type PromptVersion, PromptVersionSchema } from "@core/contracts";
import type { PromptKey, PromptRepository } from "../../application/ports/prompt-repository.ts";

const sameKey = (row: { agentId: string; scope: string; tenantId: string | null }, key: PromptKey) =>
  row.agentId === key.agentId && row.scope === key.scope && row.tenantId === key.tenantId;

// Like the row level security policy: platform rows to everyone, tenant rows to their tenant.
const visible = (row: { tenantId: string | null }, tenantId: string | null) => row.tenantId === null || row.tenantId === tenantId;

/** In-memory prompt store for unit tests (append-only like the Postgres one). */
export const createInMemoryPromptRepository = (options: { readonly now?: () => Date } = {}) => {
  const versions: PromptVersion[] = [];
  const activations: PromptActivation[] = [];
  let sequence = 0;
  const now = options.now ?? (() => new Date("2026-10-01T12:00:00.000Z"));
  const nextId = () => `01928f6e-7b2a-7c3d-9e4f-${(sequence++).toString(16).padStart(12, "0")}`;
  const latestActive = (agentId: string, scope: "platform" | "tenant", tenantId: string | null) => {
    const active = activations.find((row) => sameKey(row, { agentId, scope, tenantId }));
    const version = active === undefined ? undefined : versions.find((row) => row.id === active.versionId);
    return version === undefined ? null : { versionId: version.id, body: version.body };
  };
  const repository: PromptRepository = {
    insertVersion: (input) => {
      const version = PromptVersionSchema.parse({
        id: nextId(),
        agentId: input.agentId,
        scope: input.scope,
        tenantId: input.tenantId,
        version: versions.filter((row) => sameKey(row, input)).length + 1,
        body: input.body,
        bodySha256: input.bodySha256,
        note: input.note,
        evalExperimentId: null,
        evalVerdict: null,
        createdBy: input.createdBy,
        createdAt: now().toISOString(),
      });
      versions.unshift(version);
      return Promise.resolve(version);
    },
    listVersions: (key) => Promise.resolve(versions.filter((row) => sameKey(row, key))),
    getVersion: ({ versionId, tenantId }) => Promise.resolve(versions.find((row) => row.id === versionId && visible(row, tenantId)) ?? null),
    recordEval: ({ versionId, tenantId, experimentId, verdict }) => {
      const index = versions.findIndex((row) => row.id === versionId && visible(row, tenantId));
      const current = versions[index];
      if (current !== undefined) versions[index] = { ...current, evalExperimentId: experimentId, evalVerdict: verdict };
      return Promise.resolve();
    },
    insertActivation: (input) => {
      const activation = PromptActivationSchema.parse({
        id: nextId(),
        agentId: input.agentId,
        scope: input.scope,
        tenantId: input.tenantId,
        versionId: input.versionId,
        forced: input.forced,
        reason: input.reason,
        activatedBy: input.activatedBy,
        activatedAt: now().toISOString(),
      });
      activations.unshift(activation);
      return Promise.resolve(activation);
    },
    listActivations: (key) => Promise.resolve(activations.filter((row) => sameKey(row, key))),
    getActive: ({ agentId, tenantId }) =>
      Promise.resolve({ platform: latestActive(agentId, "platform", null), addendum: tenantId === null ? null : latestActive(agentId, "tenant", tenantId) }),
  };
  return { repository, versions, activations };
};

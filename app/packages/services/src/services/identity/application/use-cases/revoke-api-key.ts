import type { ApiKey, ApiKeyId, ApiKeyRevokedReason, UserPrincipal } from "@core/contracts";
import { requirePermission } from "../../../access/application/grant-checks.ts";
import type { RequestAccess } from "../../../access/composition.ts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { auditActorOf, type AuditActor } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { ApiKeyNotFoundError } from "../../domain/errors/api-key-errors.ts";
import type { ApiKeyDeps } from "../api-key-deps.ts";

/** Marks one key revoked and audits it, in one transaction. */
export const revokeKey = (deps: ApiKeyDeps, args: { apiKey: ApiKey; reason: ApiKeyRevokedReason; actor: AuditActor; requestId: string }): Promise<void> =>
  deps.unitOfWork.run(async (tx) => {
    const { apiKey } = args;
    deps.apiKeys.revoke(tx, { id: apiKey.id, reason: args.reason, updatedAt: deps.clock.now().toISOString(), actorId: args.actor.id });
    await deps.audit.record(
      { log: "tenant", tenantId: apiKey.tenantId, action: "API_KEY_REVOKED", actor: args.actor, target: { type: "api-key", id: apiKey.id }, node: apiKey.node, outcome: "success", requestId: args.requestId },
      tx,
    );
  });

export type RevokeApiKey = (command: { actor: UserPrincipal; access: RequestAccess; apiKeyId: ApiKeyId; requestId: string }) => Promise<Result<void, ApiKeyNotFoundError | AccessDeniedError>>;

/**
 * `DELETE /v1/api-keys/{apiKeyId}` (`core.api-key.revoke` at the key's node). Unknown keys and
 * keys of organizations the caller cannot see answer 404; revoking twice answers 204 again.
 */
export const makeRevokeApiKey =
  (deps: ApiKeyDeps): RevokeApiKey =>
  async ({ actor, access, apiKeyId, requestId }) => {
    const apiKey = await deps.apiKeys.get(undefined, apiKeyId);
    if (apiKey === null) return err(new ApiKeyNotFoundError());
    const allowed = await requirePermission({ access, actor, permission: "core.api-key.revoke", node: apiKey.node });
    if (!allowed.ok) return allowed;
    if (apiKey.status === "revoked") return ok(undefined);
    await revokeKey(deps, { apiKey, reason: "revoked", actor: auditActorOf(actor), requestId });
    return ok(undefined);
  };

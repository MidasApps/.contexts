import { apiKeyExpiryIssue, type ApiKey, type CreateApiKeyInput, type CreateApiKeyResponse, type TenantId, type UserPrincipal } from "@core/contracts";
import { requireNoEscalation, requirePermission } from "../../../access/application/grant-checks.ts";
import type { RequestAccess } from "../../../access/composition.ts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import type { EscalationForbiddenError } from "../../../access/domain/errors/escalation-forbidden-error.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { formatApiKey, generateApiKeyParts } from "../../domain/api-key-format.ts";
import { ApiKeyExpiryInvalidError } from "../../domain/errors/api-key-errors.ts";
import type { ApiKeyDeps } from "../api-key-deps.ts";

export type CreateApiKeyCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  /** Organization named by the route; the key's node must be inside it. */
  readonly tenantId: TenantId;
  readonly input: CreateApiKeyInput;
  readonly requestId: string;
};

export type CreateApiKeyError = AccessDeniedError | EscalationForbiddenError | ApiKeyExpiryInvalidError;

export type CreateApiKey = (command: CreateApiKeyCommand) => Promise<Result<CreateApiKeyResponse, CreateApiKeyError>>;

/**
 * Creates a scoped key (SP1 spec §5.3, §6.3): `core.api-key.create` at the node, scopes ⊆ the
 * actor's effective permissions there, expiry within 365 days. The full key is returned
 * once; only `sha256(secret)` is stored.
 */
export const makeCreateApiKey =
  (deps: ApiKeyDeps): CreateApiKey =>
  async (command) => {
    const { actor, input, tenantId } = command;
    if (input.node.tenantId !== tenantId) return err(new AccessDeniedError("NODE_NOT_FOUND"));
    const allowed = await requirePermission({ access: command.access, actor, permission: "core.api-key.create", node: input.node });
    if (!allowed.ok) return allowed;
    const within = await requireNoEscalation({ access: command.access, actor, node: input.node, requested: input.scopes });
    if (!within.ok) return within;
    const now = deps.clock.now();
    const issue = apiKeyExpiryIssue({ expiresAt: input.expiresAt, now });
    if (issue !== null) return err(new ApiKeyExpiryInvalidError(issue));
    const { publicId, secret } = generateApiKeyParts(deps.randomBytes);
    const apiKey: ApiKey = {
      id: deps.apiKeys.newId(),
      tenantId,
      name: input.name,
      publicId,
      scopes: [...input.scopes],
      node: input.node,
      ownerUid: actor.uid,
      expiresAt: new Date(input.expiresAt).toISOString(),
      lastUsedAt: null,
      status: "active",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const auditActor = auditActorOf(actor);
    await deps.unitOfWork.run(async (tx) => {
      deps.apiKeys.create(tx, { apiKey, secretHash: deps.hashSecret(secret), actorId: auditActor.id });
      await deps.audit.record(
        { log: "tenant", tenantId, action: "API_KEY_CREATED", actor: auditActor, target: { type: "api-key", id: apiKey.id }, node: input.node, outcome: "success", requestId: command.requestId },
        tx,
      );
    });
    return ok({ apiKey, secret: formatApiKey({ prefix: deps.apiKeyPrefix, publicId, secret }) });
  };

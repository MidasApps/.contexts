import type { ProjectsPort } from "@core/agents";
import { CreateProjectInputSchema, PrincipalSchema, TenantIdSchema } from "@core/contracts";
import type { AccessCore, TenancyServices } from "@core/services";

/**
 * Binds `ProjectsPort` to SP1's `createProject` (the use case `/v1` calls; it authorizes
 * `core.project.create` again and writes `PROJECT_CREATED` in the same unit of work).
 * Port values are unbranded mirrors: SP1's schemas re-brand them, and a malformed
 * value rejects (a bug), never creates.
 */
export const bindProjectsPort = (deps: { readonly tenancy: Pick<TenancyServices, "createProject">; readonly access: Pick<AccessCore, "forRequest"> }): ProjectsPort => ({
  createProject: async ({ principal, tenantId, requestId, input }) => {
    const result = await deps.tenancy.createProject({
      actor: PrincipalSchema.parse(principal),
      access: deps.access.forRequest(),
      requestId,
      tenantId: TenantIdSchema.parse(tenantId),
      input: CreateProjectInputSchema.parse(input),
    });
    return result.ok ? { ok: true, data: { projectId: result.data.id, name: result.data.name } } : { ok: false, error: "FORBIDDEN" };
  },
});

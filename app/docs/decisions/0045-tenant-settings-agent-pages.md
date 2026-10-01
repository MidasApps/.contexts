# 0045. Tenant settings for the agent runtime: routes, catalogs and what an organization can change

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/client/src/{views/settings-*,features,entities}` (agents, skills, knowledge, connectors, workflows, approvals, usage, traces, evals, flags), `app/packages/client/src/shared/lib/router`, `app/packages/contracts/src/contracts/{sp5-settings-endpoints.ts,agents/agent-catalog.schema.ts,workflows/workflow-catalog.schema.ts,access/endpoints.ts,knowledge/endpoints.ts}`, `app/packages/services/src/services/{usage,workflows,access,knowledge}` (handlers), `app/packages/agents/src/runtime/tenant-catalog-routes.ts`, `app/apps/web/src/app/v1/{agents,workflows,usage,me/grants,approval-requests/[approvalRequestId]}` (local decision; the framework is unchanged)
- **Records:** SP5 spec §7, §3.4; plan Task 14
- **Relates to:** decisions 0012 (route map), 0022 (knowledge namespaces), 0027 (connectors), 0029 (skills), 0030 A7 (grants), 0037, 0038, 0039, 0040, 0042, 0044 (staff agent catalog)

## Context

The settings area of an organization had three empty slots (connectors, agents, usage) and no page
for knowledge, skills, workflows, approvals, traces, evals or flags. The plan named page files that
do not exist in the app (`(app)/settings/...`); settings pages are one route with a section. Some
screens needed data no endpoint served. The product question is "can I create agents, skills, a
knowledge base?", so the pages must be exact about what an organization can and cannot do.

## Decision

1. **One settings route with a tail.** `Route` `settings` gains the sections `agents`, `skills`,
   `knowledge`, `connectors`, `workflows`, `approvals`, `usage`, `traces`, `evals`, `flags` and an
   optional `rest` for detail pages: `approvals/{approvalRequestId}`, `traces/{traceId}`,
   `workflows/runs/{runId}`. Web serves it at `settings/[section]/[[...rest]]`, desktop at
   `settings/$section/$`. The stable link of an approval is
   `/o/{organizationId}/settings/approvals/{approvalRequestId}`
   (`{ id: "settings", organizationId, section: "approvals", rest: approvalRequestId }`).
   Each section is a navigation item gated by its read permission.
2. **Agents, skills and workflows are defined in code.** The runtime has no notion of an agent,
   a skill or a workflow created by a tenant (decisions 0019, 0029). The pages therefore show what
   the core and the installed modules ship and let the organization: enable or disable an agent,
   opt in to web tools, choose the PII mode, add its own instructions per agent (the versioned,
   eval-gated addendum of decision 0038), and limit tools through connectors. The pages say this in
   plain copy. Creating agents or skills at runtime is a follow-up, not hidden behind "soon".
3. **Runtime catalogs.** `GET /tenant-catalog/agents` and `GET /tenant-catalog/workflows` are
   custom Mastra routes behind the context middleware. The first lists the supervisor's subagents
   with `enabled` (from `agent-settings.enabledAgents`), the tools each one resolves for the
   caller's tenant (`agent.listTools({ requestContext })`, so connector tools are included) and its
   skills (`agent.listSkills`). A tool is a `mutation` when Mastra asks a confirmation for it. The
   second lists the workflows whose policy is startable or schedulable, with the JSON Schema of
   their input (`z.toJSONSchema`). `/v1` exposes them as `GET /v1/agents`
   (`core.agent-settings.read`) and `GET /v1/workflows` (`core.workflow-run.read`) through the
   workflow gateway. One agent that fails to resolve is listed without tools; the list never fails
   for it. This is not the staff catalog of decision 0044 (`GET /v1/admin/agents`): that one has
   no user Bearer and no tenant, and lists what each definition declares
   (`AgentDefinition.catalog`). The tenant catalog is a user call and resolves the tools of that
   organization, connector tools included, plus its enabled state. Both read the same built
   agents; the tenant route should take source and module from the definitions instead of the id
   prefix (follow-up).
4. **Usage.** `GET /v1/usage?organizationId=&month=` (`core.usage.read`) answers the existing
   `usage.UsageSummary` use case. The tenant is the authorized organization.
5. **Approvals.** `GET /v1/approval-requests/{approvalRequestId}` reads one request with
   `core.approval.read` at its organization, the rule of the list. A missing request and one the
   caller may not see both answer 404. The client entity uses typed endpoint calls and keys under
   the organization. `GET /v1/me/grants` gets its route file; the inbox uses the grants to tell
   whether the viewer's access covers the node of a request. Grants carry nodes and roles, not
   permissions: actions stay gated by the access context.
6. **Knowledge collections are the existing namespaces.** A collection is the organization
   (`tenant`) or one of its projects (`project:<id>`). `POST .../knowledge/sources` accepts
   `?projectId=`: the write permission is checked at that project and the project goes into the
   run scope, so ingestion writes `project:<id>`. Named collections are not built: the search tool
   derives its namespaces from the request context, and a free namespace would need a store, a
   migration and a retrieval rule.
7. **Shared widgets use `common.*` messages** (`traceViewer`, `costCharts`, `runTimeline`,
   `scheduleTable`), so `/admin` and `/settings` render the same widgets.

## Consequences

- An organization admin can configure agents, see skills, fill the knowledge base, manage
  connectors, schedules and runs, read usage against the budget, and decide approvals, each over a
  real `/v1` endpoint.
- The tenant catalog costs one tool resolution per subagent per request, which loads the tenant's
  connectors (cached five minutes by the connector registry).
- Pages poll (approvals every 15 s, a non-terminal run every 2 s at most); there is no client
  Firestore listener yet.
- Limits kept visible in the UI and listed as follow-ups: tenant-created agents and skills, named
  knowledge collections, connection test and remote tool listing for connectors, clearing a flag
  override, usage by day/agent/user, dataset items for evals, instructions for module agents.

## Alternatives rejected

- **A hard-coded agent and skill list in the client.** It would drift from the runtime and could
  not show connector tools or module skills per organization.
- **Separate route ids per detail page.** Three more variants for the same shape; a tail keeps the
  route map small and both adapters unchanged.
- **Named collections as labels only.** A label that does not scope retrieval would look like a
  feature and change nothing an agent reads.
- **Staff-style console routes without the user's Bearer for the catalogs.** The tenant catalog is
  a user call; the runtime must authorize the same caller again.

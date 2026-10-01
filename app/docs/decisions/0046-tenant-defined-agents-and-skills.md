# 0046. Tenant-defined agents and skills

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/contracts/src/contracts/agents/custom-*.ts`, `app/packages/services/src/services/custom-agents`, `app/packages/agents/src/custom` (runtime), `app/packages/agents/src/chat` (agent lookup only), `app/apps/mastra/src/runtime`, `app/apps/web/src/app/v1/{agents,skills,agent-options,chat-agents}`, `app/packages/client/src/{entities,features,views}` (settings agents and skills), `app/firestore.rules` (local decision; the framework is unchanged)
- **Records:** SP5 plan Task 14b; follow-up 58
- **Relates to:** decisions 0019 (runtime composition, ceilings), 0021 (model roles), 0025 (tool pipeline), 0026 (guardrails, budget), 0027 (connectors), 0029 (skills), 0031 (durable chat), 0038 (prompt store), 0039 (plans), 0045 (settings pages; amended here)

## Context

Decision 0045 stated that agents and skills are defined in code and an organization can only
enable, limit and instruct them. The product owner's acceptance question is "can I create agents?
skills?", and the answer was no. The runtime needs a notion of an agent and a skill an
organization defines, without running tenant code and without a second, weaker pipeline.

Mastra 1.71.0 registers agents at boot (`new Mastra({ agents })`); `handleChatStream` and the
durable wrapper need a registered agent id. `instructions`, `model`, `tools`, `skills` and
`memory` of an agent accept a function of the request context (`DynamicArgument`).

## Decision

1. **A custom agent and a custom skill are configuration records.** Firestore `custom-agents/{id}`
   and `custom-skills/{id}` (automatic ids, `tenantId`, timestamps, `createdBy`), denied to every
   client by Security Rules and managed through `/v1`. A skill is a name, a description and
   markdown instructions. An agent is a name, a description, instructions, a model role, tool ids,
   an opt-in to the connectors' read-only tools, platform skill names, custom skill ids, a
   knowledge scope and an enabled flag. No tenant code runs.
2. **One registered agent runs every custom agent.** The runtime registers `custom-agent` (and its
   durable chat wrapper) once. Its instructions, model, tools and skills are functions of the
   request context: they load the record named by the context key `customAgentId` for the tenant of
   the verified context. The chat route is the only writer of that key: for a chat agent id that is
   not a code-defined one it loads the tenant's enabled record, sets the key and runs the generic
   durable agent. `custom-agent` is hidden from the built-in `/api/agents/*` routes, and the context
   middleware clears the key, so a client-sent value never survives. A missing, disabled or
   other-tenant record answers 404 before a run starts and fails the run if reached anyway.
3. **Same pipeline.** Auth and tenant context (context middleware), memory per `tenantId:uid`
   (the supervisor's memory instance), the `entry` guardrail profile (budget guard first, prompt
   injection, moderation, PII, token limit, scrubber, secret filter), the usage ledger (spans of
   `custom-agent`), tool approvals and the kill-switch are the ones the assistant uses.
4. **Instructions are untrusted.** The platform preamble `custom.v1.md` comes first; the record's
   name, description and instructions follow inside the delimited addendum section of
   `composeInstructions` (decision 0038), whose closing tag is neutralized. Guardrails and the
   preamble are outside tenant control.
5. **Permission ceiling per run, closed by default.** The tool pipeline asks a resolver for the
   ceiling of `custom-agent`: the permissions of the tools the record selected (plus the knowledge
   and connector permissions when those are on), intersected with the platform ceiling, which is
   the union of the code-defined subagents' ceilings. Without a loaded record the ceiling is empty.
   A custom agent therefore never holds more than a code-defined agent could, and every call is
   still authorized against the caller's own permissions.
6. **Tools.** Selectable tools are the registry's tools (core and modules) except the knowledge
   search (the knowledge scope decides it) and the web tools (they need the organization's opt-in
   and stay with the `web` agent). `/v1` validates the shape; the runtime drops ids that are not in
   the registry at load. Mutations keep `requireApproval`. Connector tools: the read-only slice the
   supervisor gets, behind `connectorTools`.
7. **Knowledge scope.** `none` gives no search tool; `organization` and `project` bind the search
   tool with the namespaces forced to `tenant` (plus the active project); `all` leaves it as the
   knowledge agent has it. The scope only narrows what the caller may already search.
8. **Model allowlist = model roles.** `chat` or `reasoning` (decision 0021 keeps model ids in the
   platform's configuration). A tenant cannot name a provider model.
9. **Skills.** Platform skills by name and the organization's enabled skills, exposed to the model
   as `org-<name>` so they cannot shadow a platform or module skill.
10. **Reachability: direct selection.** A custom agent's id is a chat agent id
    (`ChatAgentIdSchema`): `/v1/chat` accepts it for a new conversation when the record is enabled
    in the caller's organization. `GET /v1/chat-agents` (`core.chat.use`) lists what a member can
    chat with. The supervisor does not delegate to custom agents: one generic agent cannot be
    several distinct subagents in one run, and building agents per run inside the delegation hook
    is a larger change (follow-up).
11. **API.** `POST /v1/agents`, `GET|PATCH|DELETE /v1/agents/{agentId}`, `GET|POST /v1/skills`,
    `GET|PATCH|DELETE /v1/skills/{skillId}`, `GET /v1/agent-options`, `GET /v1/chat-agents`.
    `GET /v1/agents` (the catalog) also lists the custom agents with `source: "custom"`. Reads need
    `core.agent-settings.read`, writes `core.agent-settings.update` (no new permission: both are
    agent configuration of the organization).
12. **Limits.** `PlanLimits` gains optional `maxCustomAgents`, `maxCustomSkills` and
    `maxCustomInstructionChars`; absent values mean the platform defaults (5, 10, 8000). The
    schema's hard cap for instructions is 20 000 characters. A reached cap answers 422
    `CUSTOM_LIMIT_REACHED`. Counts are read before the write (not in its transaction).
13. **Audit.** `CUSTOM_AGENT_CREATED|UPDATED|DELETED` and `CUSTOM_SKILL_CREATED|UPDATED|DELETED`,
    with the changed field names, never the instructions.
14. **Cache.** The runtime caches a loaded record for 60 s per (tenant, agent). After a write `/v1`
    asks the runtime to drop the tenant's entries (`POST /tenant-catalog/custom-agents/invalidate`,
    best effort). With several runtime instances only the one that receives the call drops them;
    the others serve a change (a disable included) at most 60 s late.

## Consequences

- An organization admin creates, edits, enables, disables and deletes agents and skills, and
  members chat with an enabled agent by sending its id as `agentId`.
- Decision 0045 §2 no longer holds for agents and skills; workflows stay defined in code.
- Usage and traces name `custom-agent`, not the individual record (follow-up).
- Deleting a skill leaves its id in the agents that selected it; the runtime ignores it.
- A conversation of a deleted or disabled agent stays readable; sending a message answers 404.
- Fake mode: `custom-agent` has no keyword rule, so it echoes; tools run only through `[[fake:...]]`
  directives.
- No evals per custom agent and no versioning of its instructions (follow-up).

## Alternatives

- **One Mastra agent per record, registered at run time.** Needs dynamic registration of durable
  agents, their workflows and caches in every instance, and removal on delete. Rejected.
- **Custom agents as supervisor subagents.** See §10.
- **Provider model ids chosen by the tenant.** Breaks decision 0021 and the price table. Rejected.
- **New permissions `core.agent.read|write`.** More roles to seed and translate for the same
  audience as `core.agent-settings.*`. Rejected for now.

# 0064. Module commands reach only organizations that enabled the module

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `app/packages/agents/src/tools/commands/module-commands.ts`, `app/packages/agents/src/agents/action-agent.ts`, `app/packages/agents/src/tools/catalog/render-form.tool.ts`, `app/packages/agents/src/custom/{custom-agent-tools.ts,custom-agent-routes.ts,compose-custom-agents.ts}`, `app/packages/agents/src/runtime/compose-agent-runtime.ts` (local decision; the framework is unchanged)
- **Records:** SP0 follow-up 39
- **Refines:** decisions 0019 (amendment "module composition in `apps/mastra`", *Who sees what*), 0029 (module skills), 0046 (custom agents)

## Context

The action agent offered every `command.<module>.*` tool in every organization. Only the
module's permissions gated them, so an organization that never enabled a module still saw its
commands in the action agent's tool list. The same held for the data agent's
`catalog.renderForm`, which rendered a module command's form, and for custom agents, which could
select and run any registered command. Module skills and module agents already reach an
organization only when `agent-settings.enabledAgents` names the module or one of its agents
(`isModuleEnabled`, decision 0029).

## Decision

1. **One rule, same as module skills.** `module-commands.ts` holds it: a command belongs to
   module `m` when its tool id starts with `command.<m>.` (`moduleOfCommand`), and it is offered
   when it belongs to no installed module or when `isModuleEnabled(m, enabledAgents)` is true
   (`isCommandOffered`). Core commands (for example `command.tenancy.*`) are offered everywhere.
2. **Ownership by tool id.** Module commands reach the runtime through the command registry
   (`createCommands`) as well as `AgentModule.commands`, so the list they came from does not
   tell the module; the prefix does, and `defineAgentModule` already enforces it for
   `AgentModule.commands`.
3. **Action agent.** Its tools are resolved per run from the run's tenant settings
   (`tenantSettings`, memoized per request context); `createActionAgentDefinition` takes the
   installed `moduleIds`.
4. **`catalog.renderForm`.** A command of a disabled module answers `COMMAND_NOT_FOUND`, exactly
   like an unknown command, before the contract and permission checks. A tool call's context
   carries the tenant but not the request context, so the check
   (`createCommandOfferedCheck`) reads the tenant's agent settings by id through the settings
   port. A submitted form comes back to the supervisor and runs through the action agent, which
   no longer has the command either.
5. **Custom agents.** At run time, a selected command of a disabled module is dropped from the
   custom agent's tools (`createCustomToolsResolver`). `GET /tenant-catalog/agent-options`, which
   feeds the custom agent editor, lists only the caller's tenant's offered commands. A record
   that already selected such a command keeps it; it comes back when the module is enabled.
6. **Unreadable settings.** When the settings store fails, no module command is offered: the
   settings reader falls back to the core subagents, which name no module, and the render-form
   check uses an empty set. This matches module skills.

## Consequences

- An organization enables a module's commands the way it enables its skills: by naming the module
  (or one of its agents) in `enabledAgents`. No new switch or contract field.
- The action agent's ceiling (`actionCeilingOf`) and a custom agent's record ceiling still count
  every selected command permission; a ceiling is an upper bound, not the offered set.
- The staff catalog still lists module commands in the action agent's `tools`
  (`perOrganizationTools: true` already says the set varies per organization).
- Approvals and workflows run commands outside the agents and keep their own permission checks.
- A `catalog.renderForm` call for a module command reads the tenant's agent settings once.

## Alternatives rejected

- **Filtering only `AgentModule.commands`.** In production the module's commands come from the
  command registry, so this would miss them.
- **A per-module switch in agent settings.** The follow-up waited for one, but `enabledAgents`
  already gates module skills and agents; a second switch would let the two disagree.
- **Putting the request context in every tool call context.** It would let `catalog.renderForm`
  reuse the memoized settings reader, but it changes the tool pipeline for one tool.
- **Rejecting custom agent records that select a disabled module's command.** Enabling the module
  later would then require editing the record again; dropping the tool at run time is enough.

# 0064. Module commands reach only organizations that enabled the module

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `app/packages/agents/src/agents/action-agent.ts`, `app/packages/agents/src/runtime/compose-agent-runtime.ts` (local decision; the framework is unchanged)
- **Records:** SP0 follow-up 39
- **Refines:** decisions 0019 (amendment "module composition in `apps/mastra`", *Who sees what*), 0029 (module skills)

## Context

The action agent offered every `command.<module>.*` tool in every organization. Only the
module's permissions gated them, so an organization that never enabled a module still saw its
commands in the action agent's tool list. Module skills and module agents already reach an
organization only when `agent-settings.enabledAgents` names the module or one of its agents
(`isModuleEnabled`, decision 0029).

## Decision

1. **Same rule as module skills.** The action agent resolves its tools per run. It reads the
   run's tenant settings (`tenantSettings`, memoized per request context) and keeps a command
   when its tool id belongs to no installed module, or when `isModuleEnabled(module,
   enabledAgents)` is true (`offeredCommandsOf`).
2. **Ownership by tool id.** A command belongs to module `m` when its tool id starts with
   `command.<m>.`. Module commands reach the runtime through the command registry
   (`createCommands`) as well as `AgentModule.commands`, so the list they came from does not
   tell the module; the prefix does, and `defineAgentModule` already enforces it for
   `AgentModule.commands`. `createActionAgentDefinition` takes the installed `moduleIds`.
3. **Core commands are unchanged.** Commands whose prefix names no installed module (for example
   `command.tenancy.*`) stay in every organization.
4. **Unreadable settings.** When the settings store fails, the reader falls back to the core
   subagents, which name no module: module commands are hidden, like module skills.

## Consequences

- An organization enables a module's commands the way it enables its skills: by naming the module
  (or one of its agents) in `enabledAgents`. No new switch or contract field.
- The action agent's ceiling (`actionCeilingOf`) still lists every command permission; it is an
  upper bound, not the offered set.
- The staff catalog still lists module commands in the action agent's `tools`
  (`perOrganizationTools: true` already says the set varies per organization).
- Out of scope: `catalog.renderForm` (data agent) and custom agents still see every registered
  command; approvals and workflows run commands outside the action agent and keep their own
  permission checks.

## Alternatives rejected

- **Filtering only `AgentModule.commands`.** In production the module's commands come from the
  command registry, so this would miss them.
- **A per-module switch in agent settings.** The follow-up waited for one, but `enabledAgents`
  already gates module skills and agents; a second switch would let the two disagree.

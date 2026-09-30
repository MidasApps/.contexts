# 0019. Agent runtime layout, module composition and typed request context

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents` (`@core/agents`, new), `app/apps/mastra`, `app/packages/services` (new contexts), `app/packages/contracts` (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Records:** SP3 spec `docs/superpowers/specs/2026-09-29-sp3-agentic-runtime-design.md` D3-01, D3-02, D3-17 (§3, §4.3)

## Context

SP3 adds agents, tools, skills, workflows, memory, knowledge and connectors. Mastra needs them as properties of one `new Mastra({...})` in `apps/mastra`, while modules (`modules/*`, SP2 `defineModule()`) must be able to contribute capabilities without the core packages importing a module (umbrella D6). Every tool and agent also needs the tenant, the principal and the regional settings, and none of them may come from the client or from model output.

## Decision

1. **D3-01 — Layout and composition.** A new package `@core/agents` holds registries, tools, agents, processors, scorers, fake models and the auth provider (layout in spec §3.1). `defineAgentModule()` describes what a module adds (agents, tools, commands, skills, workflows); `composeAgentRuntime({ env, ports, modules })` returns the runtime parts (`agents`, `workflows`, `scorers`, `mcpServers`, `storage`, `vectors`, `observability`, `pubsub`, `auth`, `middleware`, `apiRoutes`). Modules reach Mastra only through `APP_MODULES` in `apps/mastra/src/modules.ts`; a manifest `CapabilityRef` without an implementation is a boot error. SP1/SP2 services are consumed only through ports in `packages/agents/src/runtime/runtime-ports.ts`, bound in `apps/mastra/src/runtime/create-runtime-ports.ts`. `agents` imports `services` only through its entry or `application/use-cases/**`, never `client`.
2. **D3-02 — Typed `AgentRequestContext`.** Contract `agents.AgentRequestContext` (`@core/contracts`) with `tenantId`, `projectId?`, `unitId?`, `userId`, `principalKind`, effective `permissions`, `locale`, `displayTimeZone`, `nodeTimeZone`, `currency`, `activeScreen?`, `requestId`, `conversationId?`, `organizationId` (= `tenantId`) and `aiMode`. A server middleware builds it from the verified principal, overwrites any client-sent key and sets `MASTRA_RESOURCE_ID_KEY` (`tenantId:uid`) and, when present, `MASTRA_THREAD_ID_KEY`. Agents declare `requestContextSchema`, so a missing key fails before the model runs. Forwarded header names (`X-Tenant-Id`, `X-Locale`, `traceparent`, ...) live once in `@core/contracts` (`forwarded-headers.ts`), shared by the `/v1` gateway and the middleware.
3. **D3-17 — New backend contexts.** `@core/services` gains `files`, `catalog` and `agents` (added to the umbrella §3 context list), next to the extended `knowledge`, `connectors` and `usage`.

## Consequences

- One place (`composeAgentRuntime`) decides what Mastra serves; `apps/mastra/src/mastra/index.ts` stays a thin entry that keeps `server` literal for `mastra build`.
- A naming drift in SP1/SP2 exports is fixed in one binding file.
- Tenant, permissions and regional data are never read from a request body or model output.

## Alternatives rejected

- **Agents inside `@core/services`.** Mixes the Mastra dependency tree into every backend consumer (web, Functions) and blurs the tool/use-case boundary.
- **Modules registering agents directly in `apps/mastra`.** The core would import module code, which umbrella D6 forbids.
- **Untyped `RequestContext` keys read ad hoc.** A missing tenant would default silently; the schema makes it fail closed.

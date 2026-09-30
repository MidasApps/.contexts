# 0027. Connectors, MCP client and server, web tools

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents/src/connectors`, `app/packages/agents/src/mcp-server`, `app/packages/agents/src/tools/web`, `app/packages/services/src/services/connectors`, `app/apps/web` (`/v1/mcp`) (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-14, D3-15, D3-16 (§8.5, §9, §14)

## Context

Tenants connect their own APIs (OpenAPI), MCP servers and databases; external clients want to use the core's read tools over MCP; agents need web search and scraping. Each of these reaches outside the trust boundary: secrets, SSRF, untrusted output and cross-tenant leakage are the risks (`rules/security.md`, `contracts/secrets.md`).

## Decision

1. **D3-14 — Connectors.** Firestore `connectors/{autoId}` (`tenantId`, `type` `openapi|mcp|postgres|browser`, `config`, `secretRef`, `toolPolicy { allow, readOnly }`); never the secret itself. Secrets go through a `SecretStore` port: Secret Manager (`connector-<tenantId>-<connectorId>`) remotely, a Firestore-emulator collection `local-secrets` in `local` only.
   - OpenAPI: `@apidevtools/swagger-parser` (dereferenced 3.0/3.1), one tool per allowed `operationId`, input converted to a strict Zod object; `GET`/`HEAD` read, others mutation (approval); https only to the spec's `servers` hosts; 15 s timeout; 100 KB response cap.
   - MCP client: one `MCPClient` per connector (`id` `<tenantId>:<connectorId>`), Streamable HTTP (stdio only in `local`), `allowedHosts` required, headers or OAuth tokens from `SecretStore`, `requireToolApproval` unless the tool is in `toolPolicy.readOnly`, 30 s timeout, per-call `toolsets` cached 5 min per tenant. Output is untrusted.
   - Postgres read-only connector: the same SQL guard with a connector-level allowlist, `READ ONLY` + `statement_timeout`, only for databases the tenant owns.
2. **D3-15 — Core MCP server.** `MCPServer` `core` exposes `listEntities`, `describeEntity`, `searchKnowledge`, `querySemanticSql`, the `assistant` agent and catalog resources the principal may read, with `requestState.key` from `MCP_REQUEST_STATE_KEY` (≥ 32 bytes outside local). Public entry `POST /v1/mcp` authenticates an API key (`service` principal) or a user Bearer, then the gateway proxies to Mastra `/api/mcp/core/mcp`. No mutation tools over MCP in v1.
3. **D3-16 — Web tools.** Firecrawl SDK (`firecrawl` package) for `webSearch`/`webScrape`, registered only when the tenant opted in (`webTools.firecrawl`) and a key exists; `url-guard.ts` rejects non-https, IP literals, private/loopback/link-local ranges after DNS resolution and non-default ports; output capped at 20 000 chars and wrapped as untrusted data. Browser automation only through a tenant `browser` MCP connector pointing at a Playwright MCP server (`--headless --isolated`), off by default, every tool with approval. `@mastra/agent-browser` is not adopted.

## Consequences

- No secret is stored in Firestore documents or returned by any API.
- A connector host outside its allowlist fails closed, including redirects.
- External clients get read-only capabilities over MCP until a later decision adds mutations with approval.

## Alternatives rejected

- **Secrets in the connector document (encrypted field).** Moves key management into app code; Secret Manager already provides rotation and audit.
- **`@mastra/agent-browser` / stagehand.** 0.x packages pinned behind upstream; a separate Playwright MCP service isolates the browser from the Mastra process.
- **Exposing mutation tools over MCP now.** MCP clients have no standard confirmation UI for our approval flow.
- **`@mendable/firecrawl-js`.** Same SDK as `firecrawl` 4.42.0; one package name is enough.

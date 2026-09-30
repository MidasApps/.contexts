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

## Amendments

- **2026-09-30 — connectors store and secret store (SP3 Task 21).**
  - *API.* `/v1/organizations/{organizationId}/connectors` (list with cursor pages, create 201),
    `.../connectors/{connectorId}` (get, patch, delete 204) and `PUT .../{connectorId}/secret`
    (write-only, 204; no read path). Reads need `core.connector.read`, changes
    `core.connector.write` (owner and admin). The path nests under the organization, like the
    knowledge routes, so the tenant is always explicit.
  - *Rules beyond the schema.* Every endpoint the connector calls first (MCP and browser `url`,
    OpenAPI `specUrl`) must be https on the default port with its host in `allowedHosts`; a
    patched config must still be a valid config of the connector's type. The server owns `id`,
    `tenantId`, `status` on create (`active`), `secretRef` and the audit fields.
  - *Secrets.* `secretRef` is set only by `PUT .../secret` to `connector-<tenantId>-<connectorId>`.
    Secret Manager (`@google-cloud/secret-manager` 7.1.1, automatic replication, a version per
    put, `latest` on read, loaded lazily) outside `local`; the `local-secrets` collection of the
    Firestore emulator in `local` (the adapter throws outside `local`). Deleting a connector
    deletes its document first, then its secret. Values never reach Firestore connector
    documents, responses, logs or audit entries.
  - *Audit.* `CONNECTOR_CREATED`, `CONNECTOR_UPDATED` (changed field names), `CONNECTOR_DELETED`,
    `CONNECTOR_SECRET_SET`, written with the change in one transaction.
  - *Storage.* `connectors/{autoId}` with `schemaVersion` and `updatedBy`; composite index
    `tenantId + createdAt desc`; Security Rules deny every client on `connectors` and
    `local-secrets`. The Mastra runtime reads active connectors and secrets through the
    `connectors` and `secrets` ports (server-side, tenant from the verified context).
- **2026-09-30 — connector tools, MCP client and SSRF guard (SP3 Task 22).**
  - *SSRF guard* (`tools/web/url-guard.ts`): https, default port, no credentials, a DNS name
    (no IP literal, no single-label, `.localhost` or `.internal` host), inside `allowedHosts`
    when the caller has one, and every resolved address public (loopback, private, link-local
    incl. `169.254.169.254`, CGNAT, unique-local, multicast and IPv4-mapped forms refused;
    DNS errors fail closed). `guardedFetch` follows redirects by hand, checking every hop,
    at most 5.
  - *Per-run tools, not body toolsets.* Clients cannot send `toolsets` (server-owned run
    options, Task 20), so agents resolve connector tools in their dynamic `tools` from the
    verified context: supervisor = read tools (OpenAPI GET/HEAD, MCP tools in
    `toolPolicy.readOnly`), action = every OpenAPI and MCP tool, data = Postgres query tools,
    web = browser MCP tools and only with `agent-settings.webTools.browser`. A tenant's
    connectors load once per 5 minutes (secrets read server-side); eviction disconnects MCP
    clients; a connector that fails to load is left out of the run.
  - *OpenAPI* (`@apidevtools/swagger-parser` 13.1.0, `openapi-types` 12.1.3 as its peer):
    JSON specs only (fetched through the guard, 15 s, 2 MB), validated and dereferenced with
    `resolve.external: false`; any `$ref` left unresolved is refused (the parser would fetch it
    outside the guard). One `defineCoreTool` per allowed `operationId` (`api.<connector>.<op>`),
    input `{ path, query, body }` strict, built with `z.fromJSONSchema` (present in Zod 4.6.5, no
    ajv needed). Requests only to the first `servers` URL (https inside `allowedHosts`), auth
    header from the secret, 15 s, 100 KB cap, answer wrapped as `<untrusted_api_response>`.
    These tools run the core pipeline (SP1 authorize, audit of mutations, timeout); their
    permission is `core.chat.use`: an admin enabled the connector and its allowlist
    (`core.connector.write`), and every mutation still asks the user.
  - *MCP client* (`@mastra/mcp` 2.1.1; peer `@mastra/core >=1.68`): one `MCPClient` per
    connector (`id` `<tenantId>:<connectorId>`), Streamable HTTP with `allowedHosts` plus our
    guard as its `fetch`, Bearer from the secret, 30 s; tools filtered by `toolPolicy.allow`;
    `requireToolApproval` answers per call: no approval only for `readOnly` tools of `mcp`
    connectors, always for `browser`. `listToolsetsWithErrors` is used so a server that fails
    is an error, not an empty toolset. MCP tools do not run the core pipeline (no per-call SP1
    authorize or audit); their gates are the admin-owned connector, the allowlist, the tenant
    from the context and the user's approval. stdio is only a local developer override
    (`McpStdioOverride`, refused outside `local`); stored connectors are https only. OAuth
    (`MCPOAuthClientProvider`) is not wired yet: `auth: "oauth"` connectors connect without a
    token until a later task stores OAuth tokens through the secret store.
  - *Postgres read-only connector*: `guardConnectorSql` (the semantic guard with qualified
    `schema.relation` names from `allowedRelations`), `BEGIN READ ONLY`, 5 s statement timeout,
    100/1000 row cap, the DSN host must resolve to public addresses; permission
    `core.catalog.query`; audited like semantic queries.
- **2026-09-30 — Firecrawl web tools and URL ingestion (SP3 Task 23).**
  - *SDK.* `firecrawl` 4.42.1 (MIT; the same SDK as `@mendable/firecrawl-js` 4.42.1, one name
    kept). It brings its own `zod` 3, `axios` and `zod-to-json-schema`, has no install script,
    and was admitted through `minimumReleaseAgeExclude` until 2026-10-07. The client always
    receives the key and API URL explicitly, so the SDK never reads `process.env`; 12 s
    timeout, one retry. The SDK takes no `AbortSignal`: a cancelled run abandons the call.
  - *Keys.* Per call, in this order: the tenant's own key in the secret store under
    `firecrawl-<tenantId>` (SP5 settings will write it), then the platform
    `FIRECRAWL_API_KEY`; a self-hosted `FIRECRAWL_API_URL` may run without a key. Without any
    of them the tools are absent and a URL source fails with `WEB_TOOLS_UNAVAILABLE`.
    `FIRECRAWL_API_URL` must be https outside `local`.
  - *Tools.* `web.search` (query ≤ 400 chars, 1–5 results, only https result addresses, titles
    and snippets returned as one wrapped Markdown list) and `web.scrape` (Markdown of the main
    content, 20 000-char cap with `truncated`), both `defineCoreTool` reads with permission
    `core.web-tools.use`. Output is wrapped as `<untrusted_web_content source="…">`; a
    closing tag inside the page text is escaped so the page cannot end the wrapper. The web
    agent offers them only when `agent-settings.webTools.firecrawl` is on **and** a client
    resolves for the run's tenant (the tenant comes from the verified context).
  - *SSRF.* Firecrawl fetches pages from its own network, but a self-hosted Firecrawl runs in
    ours, so `url-guard` checks the requested URL before the call and the final address
    Firecrawl reports (after its redirects) before any content is returned.
  - *Knowledge URL sources.* The `webContent` port (knowledge-ingest workflow) is bound to the
    same clients and guard (Markdown bounded to 500 000 chars). URL ingestion is an explicit
    `core.knowledge.write` action, so it needs a key but not the chat opt-in.
  - *Fake mode.* Fixture pages on `docs.example.com`; the guard's DNS resolves only the fixture
    hosts to a public test address and keeps real DNS (and its refusals) for every other host.
  - *Not done.* `extract-text`'s PDF hook is not wired to Firecrawl `parse`: it would send
    tenant documents to a third party, which needs a compliance decision
    (`.contexts/business/compliance.md` is still a template).
- **2026-09-30 — core MCP server and `POST /v1/mcp` (SP3 Task 24).**
  - *Server.* `MCPServer` `core` (`@mastra/mcp` 2.1.1, MCP revision 2026-07-28) with the read
    tools `listEntities`, `describeEntity`, `searchKnowledge`, `querySemanticSql` (the core
    pipeline, caller key `mcp` with ceiling `core.mcp.use`, `core.chat.use`,
    `core.catalog.read`, `core.catalog.query`, `core.knowledge.read`), the supervisor as
    `ask_assistant`, and the AI catalog entries the caller may read as `catalog://<id>`
    resources. `requestState.key` is `MCP_REQUEST_STATE_KEY` (≥ 32 bytes outside local, shared
    by every instance). No mutation tool is exposed.
  - *Context bridge.* `MCPServer` builds its own request context per MCP request, so the
    context middleware's keys would never reach the tools or `ask_assistant`. Mastra's
    `server.mcpOptions.setRequestAuth` copies the verified snapshot into `req.auth.extra`
    (server-side only), and the server's `mapAuthInfoToUser` writes it back with
    `writeAgentContext` (tenant, principal, resource and thread keys) and returns the uid that
    continuations are bound to. Without a snapshot the tools fail with `CONTEXT_MISSING`.
  - *Conversation.* An MCP call without `X-Conversation-Id` gets a new conversation owned by
    the caller (decision 0019 amendment), so `ask_assistant` runs the tenant memory.
  - *`POST /v1/mcp?organizationId=…`.* Auth (user Bearer or API key) → validate (a JSON-RPC 2.0
    message, loose because the protocol owns its fields) → `core.mcp.use` at the organization
    → the gateway posts to Mastra `/api/mcp/core/mcp` with the caller's own Bearer and scope.
    The organization is in the query, like `GET /v1/me/context`: users must name it (400
    `VALIDATION_FAILED` otherwise); an API key acts in its own organization and a different
    one is 403. The spec's path `/v1/mcp` is kept; nesting under
    `/v1/organizations/{id}` was rejected because an API key already names its tenant.
  - *Sessions.* The 2026-07-28 revision is stateless: the server never issues
    `Mcp-Session-Id`, so no instance affinity is needed on Cloud Run. The gateway forwards
    only the MCP transport headers (`Accept`, `Mcp-Method`, `Mcp-Name`, `Mcp-Param-*`,
    `MCP-Protocol-Version`, `Mcp-Session-Id`, `Last-Event-ID`) and passes back the status,
    `Content-Type` (JSON or SSE), `Mcp-Session-Id`, `MCP-Protocol-Version` and
    `X-Conversation-Id`; a 202 without a body passes through. Only POST is served (no GET
    listen stream, no DELETE). A non-2xx Mastra answer is mapped to the `/v1` envelope by
    status, as for every gateway call, so MCP protocol errors with a 4xx status reach the
    client as the envelope, not as JSON-RPC.
  - *Rate limit.* Policy `mcp-call`: 60 requests per minute per principal (an API key counts
    as its own principal).

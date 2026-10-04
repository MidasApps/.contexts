import type { Connector } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { inMemoryUnitOfWork } from "#/services/shared/firestore/unit-of-work.ts";
import type { ErrorEnvelope } from "#/services/shared/http/error-envelope.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import { createConnectorsServices } from "../../composition.ts";
import {
  createInMemoryConnectorRepository,
  createInMemorySecretStore,
} from "../driven/in-memory-connector-adapters.ts";
import { buildConnectorsRoutes } from "./connectors-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const SECRET = "tok_live_super_secret_value";

const setup = () => {
  const { pipeline, clock } = makeInMemoryPipeline({
    now: "2026-09-30T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
  });
  const repository = createInMemoryConnectorRepository();
  const secrets = createInMemorySecretStore();
  const connectors = createConnectorsServices({
    connectors: repository,
    secrets,
    audit: pipeline.audit,
    unitOfWork: inMemoryUnitOfWork,
    clock,
  });
  return { routes: buildConnectorsRoutes({ pipeline, connectors }), repository, secrets };
};

const MCP_BODY = {
  name: "docs-mcp",
  type: "mcp",
  toolPolicy: { allow: ["search"], readOnly: ["search"] },
  config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "bearer" },
};

const base = (tenantId: string) => `/v1/organizations/${tenantId}/connectors`;
const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;
const dataOf = async <T>(response: Response) => ((await response.json()) as { data: T }).data;

const create = async (routes: ReturnType<typeof setup>["routes"], body: unknown = MCP_BODY, as = "alice") =>
  callRoute(routes, "connectors.create", base(ORG_A), { method: "POST", as, body });

describe("/v1 connectors", () => {
  it("creates an active connector without a secret and lists it for connector readers", async () => {
    const { routes } = setup();
    const created = await create(routes);
    expect(created.status).toBe(201);
    const connector = await dataOf<Connector>(created);
    expect(connector).toMatchObject({ tenantId: ORG_A, status: "active", secretRef: null, createdBy: "alice" });
    expect(created.headers.get("location")).toBe(`${base(ORG_A)}/${connector.id}`);
    const listed = await callRoute(routes, "connectors.list", base(ORG_A), { as: "alice" });
    expect((await dataOf<Connector[]>(listed)).map((item) => item.id)).toEqual([connector.id]);
  });

  it("refuses members without core.connector.read/write and other tenants", async () => {
    const { routes } = setup();
    expect((await create(routes, MCP_BODY, "mia")).status).toBe(403);
    expect((await callRoute(routes, "connectors.list", base(ORG_A), { as: "mia" })).status).toBe(403);
    const connector = await dataOf<Connector>(await create(routes));
    expect((await callRoute(routes, "connectors.get", `${base(ORG_A)}/${connector.id}`, { as: "bob" })).status).toBe(
      404,
    );
    expect((await callRoute(routes, "connectors.get", `${base(ORG_B)}/${connector.id}`, { as: "bob" })).status).toBe(
      404,
    );
  });

  it("requires allowedHosts, https and an endpoint host inside the allowlist", async () => {
    const { routes } = setup();
    const noHosts = { ...MCP_BODY, config: { url: "https://mcp.example.com/mcp", auth: "none" } };
    expect((await create(routes, noHosts)).status).toBe(400);
    const plainHttp = { ...MCP_BODY, config: { ...MCP_BODY.config, url: "http://mcp.example.com/mcp" } };
    expect((await create(routes, plainHttp)).status).toBe(400);
    const outside = { ...MCP_BODY, config: { ...MCP_BODY.config, url: "https://evil.example.net/mcp" } };
    const refused = await create(routes, outside);
    expect(refused.status).toBe(400);
    expect((await errorOf(refused)).details).toEqual([{ field: "config.url", issue: "HOST_NOT_ALLOWED" }]);
    const ipHost = { ...MCP_BODY, config: { ...MCP_BODY.config, allowedHosts: ["127.0.0.1"] } };
    expect((await create(routes, ipHost)).status).toBe(400);
  });

  it("stores the secret write-only: 204, never in a response, deleted with the connector", async () => {
    const { routes, secrets } = setup();
    const connector = await dataOf<Connector>(await create(routes));
    const put = await callRoute(routes, "connectors.setSecret", `${base(ORG_A)}/${connector.id}/secret`, {
      method: "PUT",
      as: "alice",
      body: { value: SECRET },
    });
    expect(put.status).toBe(204);
    const name = `connector-${ORG_A}-${connector.id}`;
    expect(secrets.values.get(name)).toBe(SECRET);
    const read = await callRoute(routes, "connectors.get", `${base(ORG_A)}/${connector.id}`, { as: "alice" });
    const text = await read.text();
    expect(text).not.toContain(SECRET);
    expect((JSON.parse(text) as { data: Connector }).data.secretRef).toBe(name);
    const removed = await callRoute(routes, "connectors.delete", `${base(ORG_A)}/${connector.id}`, {
      method: "DELETE",
      as: "alice",
    });
    expect(removed.status).toBe(204);
    expect(secrets.values.has(name)).toBe(false);
  });

  it("patches name, status and policy; a config of another type is refused", async () => {
    const { routes } = setup();
    const connector = await dataOf<Connector>(await create(routes));
    const url = `${base(ORG_A)}/${connector.id}`;
    const patched = await callRoute(routes, "connectors.update", url, {
      method: "PATCH",
      as: "alice",
      body: { status: "disabled", name: "docs" },
    });
    expect(await dataOf<Connector>(patched)).toMatchObject({ status: "disabled", name: "docs" });
    const wrongType = await callRoute(routes, "connectors.update", url, {
      method: "PATCH",
      as: "alice",
      body: { config: { allowedRelations: ["public.orders"] } },
    });
    expect(wrongType.status).toBe(400);
    expect(
      (await callRoute(routes, "connectors.update", url, { method: "PATCH", as: "mia", body: { status: "active" } }))
        .status,
    ).toBe(403);
  });
});

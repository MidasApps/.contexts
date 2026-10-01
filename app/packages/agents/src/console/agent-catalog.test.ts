import type { Agent } from "@mastra/core/agent";
import { describe, expect, it } from "vitest";
import type { AgentDefinition } from "../runtime/agent-module.ts";
import { buildAgentCatalog, type CatalogAgent } from "./agent-catalog.ts";

const built = (name: string, description: string): CatalogAgent => ({ name, getDescription: () => description });
const never = (): Agent => {
  throw new Error("the catalog never builds an agent");
};

const definitions: AgentDefinition[] = [
  { id: "ping", ceiling: ["core.chat.use"], role: "entry", create: never, catalog: { tools: ["catalog.listEntities"], skills: [] } },
  {
    id: "data",
    ceiling: ["core.chat.use", "core.catalog.read"],
    role: "subagent",
    create: never,
    catalog: { tools: ["sql.querySemanticSql", "catalog.listEntities"], skills: ["data-catalog"], perOrganizationTools: true },
  },
  { id: "example-notes", ceiling: ["example.note.read"], create: never },
];

const source = {
  definitions,
  built: { assistant: built("Assistant", "Plans and delegates."), ping: built("Ping", "Answers a health check."), data: built("Data", "Explains the data catalog.") },
  isEntry: (definition: AgentDefinition) => definition.role === "entry",
  supervisor: { id: "assistant", ceiling: ["core.chat.use"] },
};

describe("agent catalog (decision 0044)", () => {
  it("lists the supervisor with its subagents first, then every registered agent with what it declares", () => {
    const catalog = buildAgentCatalog(source);
    expect(catalog.map((agent) => [agent.id, agent.role, agent.enablement])).toEqual([
      ["assistant", "supervisor", "always"],
      ["ping", "entry", "always"],
      ["data", "subagent", "per-organization"],
      ["example-notes", "subagent", "per-organization"],
    ]);
    expect(catalog[0]).toMatchObject({ name: "Assistant", subagents: ["data", "example-notes"], tools: [], toolsVaryByOrganization: true, permissions: ["core.chat.use"] });
    expect(catalog[2]).toMatchObject({
      name: "Data",
      description: "Explains the data catalog.",
      tools: ["catalog.listEntities", "sql.querySemanticSql"],
      toolsVaryByOrganization: true,
      skills: ["data-catalog"],
      permissions: ["core.catalog.read", "core.chat.use"],
    });
  });

  it("falls back to the id for an agent that declares nothing and was not built", () => {
    expect(buildAgentCatalog(source)[3]).toEqual({
      id: "example-notes",
      name: "example-notes",
      description: "",
      role: "subagent",
      enablement: "per-organization",
      subagents: [],
      tools: [],
      toolsVaryByOrganization: false,
      skills: [],
      permissions: ["example.note.read"],
    });
  });

  it("leaves out an agent that does not fit the contract instead of failing the list", () => {
    const long = { ...source, built: { ...source.built, ping: built("Ping", "x".repeat(1001)) } };
    expect(buildAgentCatalog(long).map((agent) => agent.id)).toEqual(["assistant", "data", "example-notes"]);
  });
});

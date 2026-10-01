import type { Agent } from "@mastra/core/agent";
import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort } from "../testing/fake-ports.ts";
import { createWorkflowCatalog, policyOf } from "../workflows/workflow-catalog.ts";
import { handleListAgentCatalog, handleListWorkflowCatalog, type TenantCatalogRouteDeps } from "./tenant-catalog-routes.ts";

type FakeTool = { id: string; requireApproval?: boolean };

// `seen` records the context each agent was asked with: tools and skills are resolved for the caller's tenant.
const fakeAgent = (args: { name: string; description: string; tools: FakeTool[]; skills?: { name: string; description: string }[] }, seen: unknown[]): Agent =>
  ({
    name: args.name,
    getDescription: () => args.description,
    listTools: ({ requestContext }: { requestContext: unknown }) => {
      seen.push(requestContext);
      return Promise.resolve(Object.fromEntries(args.tools.map((tool) => [tool.id.replace(/\./g, "_"), tool])));
    },
    listSkills: () => Promise.resolve(args.skills ?? []),
  }) as unknown as Agent;

const setup = (permissions: readonly string[], enabledAgents: string[] = ["knowledge", "example-helper"]) => {
  const seen: unknown[] = [];
  const settingsReads: string[] = [];
  const deps: TenantCatalogRouteDeps = {
    access: createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions }] }),
    subagents: {
      knowledge: fakeAgent(
        {
          name: "Knowledge",
          description: "Answers from the knowledge base.",
          tools: [{ id: "knowledge.searchKnowledge" }],
          skills: [{ name: "knowledge-citations", description: "How to cite." }],
        },
        seen,
      ),
      action: fakeAgent(
        {
          name: "Action",
          description: "Runs commands.",
          tools: [
            { id: "command.tenancy.CreateProjectInput", requireApproval: true },
            { id: "command.example.CreateNoteCommand", requireApproval: true },
            { id: "issues-api_createIssue", requireApproval: true },
          ],
          skills: [
            { name: "safe-actions", description: "How to act safely." },
            { name: "example-notes", description: "How to write notes." },
          ],
        },
        seen,
      ),
      "example-helper": fakeAgent({ name: "Helper", description: "A module agent.", tools: [{ id: "example.listNotes" }] }, seen),
    },
    moduleIds: ["example"],
    isRegisteredTool: (id) => !id.startsWith("issues-api"),
    settings: {
      getAgentSettings: ({ tenantId }) => {
        settingsReads.push(tenantId);
        return Promise.resolve({ enabledAgents } as never);
      },
    },
    catalog: createWorkflowCatalog([policyOf("approval-demo", { startable: true }), policyOf("usage-report", { schedulable: true }), policyOf("catalog-reindex")]),
    logger: { info: () => undefined, error: () => undefined },
  };
  return { deps, seen, settingsReads };
};

const context = () => new RequestContext<unknown>(buildAgentContextEntries());
const mastraWith = (workflows: Record<string, unknown>) => ({ getWorkflow: (id: string) => workflows[id] }) as unknown as Mastra;
const NO_MASTRA = mastraWith({});

describe("tenant catalog routes", () => {
  it("lists the subagents with their enabled state, tools and skills for the tenant of the caller", async () => {
    const { deps, seen, settingsReads } = setup(["core.agent-settings.read"]);
    const requestContext = context();
    const response = await handleListAgentCatalog(deps)({ mastra: NO_MASTRA, requestContext });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          key: "knowledge",
          name: "Knowledge",
          description: "Answers from the knowledge base.",
          source: "core",
          moduleId: null,
          enabled: true,
          tools: [{ id: "knowledge.searchKnowledge", kind: "read", source: "core" }],
          skills: [{ name: "knowledge-citations", description: "How to cite.", source: "core" }],
        },
        {
          key: "action",
          name: "Action",
          description: "Runs commands.",
          source: "core",
          moduleId: null,
          enabled: false,
          tools: [
            { id: "command.tenancy.CreateProjectInput", kind: "mutation", source: "core" },
            { id: "command.example.CreateNoteCommand", kind: "mutation", source: "module" },
            { id: "issues-api_createIssue", kind: "mutation", source: "connector" },
          ],
          skills: [
            { name: "safe-actions", description: "How to act safely.", source: "core" },
            { name: "example-notes", description: "How to write notes.", source: "module" },
          ],
        },
        {
          key: "example-helper",
          name: "Helper",
          description: "A module agent.",
          source: "module",
          moduleId: "example",
          enabled: true,
          tools: [{ id: "example.listNotes", kind: "read", source: "module" }],
          skills: [],
        },
      ],
    });
    expect(settingsReads).toEqual([TEST_TENANT]);
    expect(seen).toHaveLength(3);
    expect(seen.every((asked) => asked === requestContext)).toBe(true);
  });

  it("refuses the agent catalog without core.agent-settings.read and reads nothing", async () => {
    const { deps, seen, settingsReads } = setup(["core.workflow-run.read"]);
    expect((await handleListAgentCatalog(deps)({ mastra: NO_MASTRA, requestContext: context() })).status).toBe(403);
    expect(seen).toEqual([]);
    expect(settingsReads).toEqual([]);
  });

  it("keeps an agent whose tools cannot be resolved, with no tools, instead of failing the list", async () => {
    const { deps } = setup(["core.agent-settings.read"]);
    const broken = { name: "Web", getDescription: () => "Browses.", listTools: () => Promise.reject(new Error("connector down")), listSkills: () => Promise.resolve([]) } as unknown as Agent;
    const response = await handleListAgentCatalog({ ...deps, subagents: { web: broken } })({ mastra: NO_MASTRA, requestContext: context() });
    expect(await response.json()).toMatchObject({ data: [{ key: "web", enabled: false, tools: [], skills: [] }] });
  });

  it("lists the workflows a tenant may start or schedule, with the JSON Schema of their input", async () => {
    const { deps } = setup(["core.workflow-run.read"]);
    const mastra = mastraWith({
      "approval-demo": { description: "Asks a second person to approve a note.", inputSchema: z.strictObject({ title: z.string().min(1) }) },
      "usage-report": { description: undefined, inputSchema: undefined },
    });
    const response = await handleListWorkflowCatalog(deps)({ mastra, requestContext: context() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [
        { id: "approval-demo", description: "Asks a second person to approve a note.", startable: true, schedulable: false, inputSchema: { type: "object", required: ["title"] } },
        { id: "usage-report", description: "", startable: false, schedulable: true, inputSchema: null },
      ],
    });
  });

  it("refuses the workflow catalog without core.workflow-run.read", async () => {
    const { deps } = setup(["core.agent-settings.read"]);
    expect((await handleListWorkflowCatalog(deps)({ mastra: NO_MASTRA, requestContext: context() })).status).toBe(403);
  });
});

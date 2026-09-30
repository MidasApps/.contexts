import { ToolUiSchema } from "@core/contracts";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort } from "../../testing/fake-ports.ts";
import { runCoreTool } from "../core-tool-pipeline.ts";
import type { CoreToolDeps, ToolCallInfo } from "../define-core-tool.ts";
import { CoreToolError } from "../tool-errors.ts";
import { createAiCatalogReader } from "./ai-catalog-reader.ts";
import { FIXTURE_AI_CATALOG } from "./catalog-fixture.ts";
import { createDescribeEntityTool } from "./describe-entity.tool.ts";
import { createListEntitiesTool } from "./list-entities.tool.ts";
import { createRenderFormTool, type FormCommandCatalog } from "./render-form.tool.ts";

const MEMBER_PERMISSIONS = ["core.catalog.read", "example.note.read", "example.note.create"];

const commands: FormCommandCatalog = {
  get: (commandId) =>
    commandId === "example.CreateNoteCommand"
      ? {
          commandId,
          targetContractId: "example.Note",
          permission: "example.note.create",
          inputSchema: z.strictObject({ text: z.string().min(1), pinned: z.boolean().optional() }),
        }
      : undefined,
};

const setup = (granted: readonly string[] = MEMBER_PERMISSIONS) => {
  const access = createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: granted }] });
  const deps: CoreToolDeps = { access, audit: createFakeAuditPort(), approvals: createFakeApprovalPort() };
  const catalog = createAiCatalogReader(FIXTURE_AI_CATALOG);
  return {
    deps,
    listEntities: createListEntitiesTool({ catalog }),
    describeEntity: createDescribeEntityTool({ catalog }),
    renderForm: createRenderFormTool({ catalog, commands, access }),
  };
};

const call = (permissions: readonly string[] = MEMBER_PERMISSIONS): ToolCallInfo => ({
  requestContext: new RequestContext<unknown>(buildAgentContextEntries({ permissions })),
  agentId: "data",
  toolCallId: "call_1",
});

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof CoreToolError) return error.code;
    throw error;
  }
  return "NO_ERROR";
};

describe("listEntities", () => {
  it("lists only the contracts the principal may read", async () => {
    const { deps, listEntities } = setup();
    const result = await runCoreTool(listEntities, deps, { limit: 10 }, call());
    expect(result).toMatchObject({ total: 3, truncated: false });
    expect(JSON.stringify(result)).not.toContain("billing.Invoice");
  });

  it("uses the effective context permissions, not the membership alone", async () => {
    const { deps, listEntities } = setup();
    const result = (await runCoreTool(listEntities, deps, { limit: 10 }, call(["core.catalog.read"]))) as { total: number };
    expect(result.total).toBe(1);
  });

  it("refuses a limit above 50 and needs core.catalog.read", async () => {
    const { deps, listEntities } = setup();
    expect(await codeOf(runCoreTool(listEntities, deps, { limit: 51 }, call()))).toBe("TOOL_INPUT_INVALID");
    expect(await codeOf(runCoreTool(listEntities, setup(["example.note.read"]).deps, { limit: 5 }, call()))).toBe("FORBIDDEN");
  });
});

describe("describeEntity", () => {
  it("describes a visible contract with personal examples redacted", async () => {
    const { deps, describeEntity } = setup();
    const result = await runCoreTool(describeEntity, deps, { id: "example.Note" }, call());
    expect(result).toMatchObject({ id: "example.Note", examples: [{ text: "[redacted]" }] });
  });

  it("answers ENTITY_NOT_FOUND for a hidden contract, like for an unknown one", async () => {
    const { deps, describeEntity } = setup();
    expect(await codeOf(runCoreTool(describeEntity, deps, { id: "billing.Invoice" }, call()))).toBe("ENTITY_NOT_FOUND");
    expect(await codeOf(runCoreTool(describeEntity, deps, { id: "example.Missing" }, call()))).toBe("ENTITY_NOT_FOUND");
  });
});

describe("renderForm", () => {
  const input = { contractId: "example.Note", mode: "create", commandId: "example.CreateNoteCommand" } as const;

  it("returns a schema-form UI that validates against agents.ToolUi and writes nothing", async () => {
    const { deps, renderForm } = setup();
    const result = (await runCoreTool(renderForm, deps, { ...input, initialValues: { text: "Hi" } }, call())) as { ui: unknown };
    expect(ToolUiSchema.parse(result.ui)).toEqual({
      component: "schema-form",
      props: { contractId: "example.Note", commandId: "example.CreateNoteCommand", mode: "create", initialValues: { text: "Hi" } },
    });
  });

  it("strips unknown and invalid initial values", async () => {
    const { deps, renderForm } = setup();
    const result = (await runCoreTool(renderForm, deps, { ...input, initialValues: { text: "", pinned: true, tenantId: "other" } }, call())) as {
      ui: { props: { initialValues: unknown } };
    };
    expect(result.ui.props.initialValues).toEqual({ pinned: true });
  });

  it("rejects an unknown command and a command bound to another contract", async () => {
    const { deps, renderForm } = setup();
    expect(await codeOf(runCoreTool(renderForm, deps, { ...input, commandId: "example.DeleteNoteCommand" }, call()))).toBe("COMMAND_NOT_FOUND");
    expect(await codeOf(runCoreTool(renderForm, deps, { ...input, contractId: "tenancy.Organization" }, call()))).toBe("COMMAND_CONTRACT_MISMATCH");
  });

  it("requires the command permission and a visible target contract", async () => {
    const withoutCreate = ["core.catalog.read", "example.note.read"];
    const { deps, renderForm } = setup(withoutCreate);
    expect(await codeOf(runCoreTool(renderForm, deps, input, call(withoutCreate)))).toBe("FORBIDDEN");
    const withoutRead = ["core.catalog.read", "example.note.create"];
    const hidden = setup(withoutRead);
    expect(await codeOf(runCoreTool(hidden.renderForm, hidden.deps, input, call(withoutRead)))).toBe("ENTITY_NOT_FOUND");
  });
});

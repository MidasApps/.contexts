import { describe, expect, it } from "vitest";
import { buildSupervisorHarness, memberContext } from "../../agents/supervisor.fixture.ts";
import { isCommandOffered } from "./module-commands.ts";

const FORM_INPUT = { contractId: "example.Note", mode: "create", commandId: "example.CreateNoteCommand" } as const;

const renderNoteForm = async (enabledAgents: string[]): Promise<unknown> => {
  const harness = buildSupervisorHarness({ settings: { enabledAgents } });
  const renderForm = harness.runtime.tools.toMastraTools(["catalog.renderForm"])["catalog.renderForm"];
  try {
    return await renderForm?.execute?.(FORM_INPUT, { requestContext: memberContext(), agent: { agentId: "data", toolCallId: "call_1" } } as never);
  } catch (error: unknown) {
    return error;
  }
};

describe("module commands and module enablement", () => {
  it("offers core commands always and module commands only for an enabled module", () => {
    const off = new Set(["knowledge", "data", "action"]);
    expect(isCommandOffered("command.tenancy.CreateProjectInput", ["example"], off)).toBe(true);
    expect(isCommandOffered("command.example.CreateNoteCommand", ["example"], off)).toBe(false);
    expect(isCommandOffered("command.example.CreateNoteCommand", ["example"], new Set(["example-helper"]))).toBe(true);
  });

  it("renders no form for a command of a module the organization did not enable, as for an unknown command", async () => {
    expect(JSON.stringify(await renderNoteForm(["knowledge", "data", "action"]))).toContain("COMMAND_NOT_FOUND");
  });

  it("renders the form once the organization enabled the module", async () => {
    expect(JSON.stringify(await renderNoteForm(["knowledge", "data", "action", "example"]))).toContain("schema-form");
  });
});

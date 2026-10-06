// @vitest-environment node
import { AgentModuleError, defineAgentModule, type WorkflowCommandPort } from "@core/agents";
import { buildAgentContextEntries, TEST_REQUEST_ID, TEST_TENANT } from "@core/agents/testing";
import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { validateSkillContent } from "@mastra/core/skills";
import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it } from "vitest";
import { exampleManifest } from "../manifest.ts";
import { createExampleAgentModule } from "./example-agent-module.ts";
import { exampleNotesSkill } from "./notes-skill.ts";

const build = () => {
  const calls: Parameters<WorkflowCommandPort["run"]>[0][] = [];
  const workflowCommands: WorkflowCommandPort = {
    run: (command) => {
      calls.push(command);
      return Promise.resolve({ ok: true, output: { noteId: "note-1", title: "Kickoff" }, replayed: false });
    },
  };
  return { commands: { calls }, module: createExampleAgentModule({ ports: { workflowCommands } }) };
};

describe("createExampleAgentModule", () => {
  it("implements every skill and workflow the manifest names", () => {
    const { module } = build();
    expect(module.id).toBe("example");
    expect((module.skills ?? []).map((skill) => skill.name)).toEqual(exampleManifest.skills.map((ref) => ref.id));
    expect((module.workflows ?? []).map((entry) => String(entry.workflow.id))).toEqual(
      exampleManifest.workflows.map((ref) => ref.id),
    );
    expect(module.workflows?.[0]).toMatchObject({ startable: true });
  });

  it("fails at boot when the manifest names a capability without implementation", () => {
    const manifest = { ...exampleManifest, skills: [...exampleManifest.skills, { id: "example-missing" }] };
    expect(() => defineAgentModule({ ...build().module, manifest })).toThrow(AgentModuleError);
  });

  it("ships a valid Agent Skill that names the module's command tools", () => {
    expect(exampleNotesSkill.name).toBe("example-notes");
    expect(exampleNotesSkill.instructions).toContain("command.example.CreateNoteCommand");
    const content = `---\nname: ${exampleNotesSkill.name}\ndescription: ${exampleNotesSkill.description}\n---\n\n${exampleNotesSkill.instructions}`;
    expect(validateSkillContent({ content, directoryName: "example-notes" }).valid).toBe(true);
  });
});

describe("example-note-intake workflow", () => {
  const run = async (requestContext: RequestContext<unknown>) => {
    const { commands, module } = build();
    const workflow = module.workflows?.[0]?.workflow;
    if (workflow === undefined) throw new Error("the module must define its workflow");
    const mastra = new Mastra({ workflows: { [String(workflow.id)]: workflow }, storage: new InMemoryStore() });
    const workflowRun = await mastra.getWorkflow("example-note-intake").createRun();
    const result = await workflowRun.start({ inputData: { title: "Kickoff", body: "Agenda" }, requestContext });
    return { commands, result, runId: workflowRun.runId };
  };

  it("creates the note through the command registry as the caller, keyed by the run", async () => {
    const { commands, result, runId } = await run(
      new RequestContext<unknown>(buildAgentContextEntries({ permissions: ["example.note.create"] })),
    );
    expect(result.status).toBe("success");
    expect(result.status === "success" ? result.result : null).toEqual({
      outcome: "created",
      noteId: "note-1",
      code: null,
    });
    expect(commands.calls).toHaveLength(1);
    expect(commands.calls[0]).toMatchObject({
      tenantId: TEST_TENANT,
      node: { level: "organization", tenantId: TEST_TENANT },
      commandId: "example.CreateNoteCommand",
      input: { title: "Kickoff", body: "Agenda" },
      idempotencyKey: runId,
      requestId: TEST_REQUEST_ID,
    });
  });

  it("creates nothing without the server context", async () => {
    const { commands, result } = await run(new RequestContext<unknown>());
    expect(result.status === "success" ? result.result : null).toEqual({
      outcome: "failed",
      noteId: null,
      code: "CONTEXT_MISSING",
    });
    expect(commands.calls).toEqual([]);
  });
});

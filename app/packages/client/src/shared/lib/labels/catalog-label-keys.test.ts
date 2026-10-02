import { describe, expect, it } from "vitest";
import { agentLabelKeys, flagLabelKeys, normalizeToolId, permissionLabelKeys, toolLabelKeys, workflowInputLabelKeys, workflowLabelKeys } from "./catalog-label-keys.ts";

describe("workflowLabelKeys", () => {
  it("tries the core key first, then each possible module namespace", () => {
    expect(workflowLabelKeys("example-note-intake", "name")).toEqual([
      "common.workflows.example-note-intake.name",
      "example.workflows.note-intake.name",
      "example-note.workflows.intake.name",
    ]);
  });

  it("has only the core key for an id without a dash", () => {
    expect(workflowLabelKeys("reindex", "description")).toEqual(["common.workflows.reindex.description"]);
  });

  it("refuses ids that are not safe message paths", () => {
    expect(workflowLabelKeys("../evil", "name")).toEqual([]);
    expect(workflowLabelKeys("with space", "name")).toEqual([]);
  });
});

describe("flagLabelKeys", () => {
  it("nests the dotted key under common.flags", () => {
    expect(flagLabelKeys("chat.voice.realtime", "name")).toEqual(["common.flags.chat.voice.realtime.name"]);
  });
});

describe("normalizeToolId", () => {
  it("turns the stream's underscores back into the tool id's dots", () => {
    expect(normalizeToolId("knowledge_searchKnowledge")).toBe("knowledge.searchKnowledge");
    expect(normalizeToolId("command_tenancy_CreateProjectInput")).toBe("command.tenancy.CreateProjectInput");
    expect(normalizeToolId("web.search")).toBe("web.search");
  });
});

describe("toolLabelKeys", () => {
  it("tries the core chat.tools key, then the module namespace", () => {
    expect(toolLabelKeys("example.countNotes")).toEqual(["chat.tools.example.countNotes", "example.tools.countNotes"]);
  });

  it("gives no key for connector tools with names that are not message paths", () => {
    expect(toolLabelKeys("mcp search/v2")).toEqual([]);
  });
});

describe("agentLabelKeys", () => {
  it("tries the core agent name, then the module namespaces", () => {
    expect(agentLabelKeys("knowledge")).toEqual(["common.agents.knowledge"]);
    expect(agentLabelKeys("example-helper")).toEqual(["common.agents.example-helper", "example.agents.helper"]);
  });
});

describe("permissionLabelKeys", () => {
  it("reads core permissions from the permissions catalog and module ones from the module namespace", () => {
    expect(permissionLabelKeys("core.project.create")).toEqual(["permissions.core.project.create"]);
    expect(permissionLabelKeys("example.note.archive")).toEqual(["permissions.example.note.archive", "example.permissions.note.archive"]);
  });
});

describe("workflowInputLabelKeys", () => {
  it("names an input field under the workflow's core or module key", () => {
    expect(workflowInputLabelKeys("approval-demo", "title")).toEqual(["common.workflows.approval-demo.input.title", "approval.workflows.demo.input.title"]);
  });

  it("refuses fields and workflows that are not safe message paths", () => {
    expect(workflowInputLabelKeys("approval-demo", "a.b")).toEqual([]);
    expect(workflowInputLabelKeys("approval-demo", "with space")).toEqual([]);
    expect(workflowInputLabelKeys("../evil", "title")).toEqual([]);
  });
});

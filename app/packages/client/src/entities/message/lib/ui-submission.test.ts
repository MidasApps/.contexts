import { describe, expect, it } from "vitest";
import { formatUiSubmission, parseUiSubmission, type UiSubmission } from "./ui-submission.ts";

const form: UiSubmission = { kind: "schema-form", commandId: "example.CreateNoteCommand", contractId: "example.Note", mode: "create", values: { title: 'Kickoff "Q4"', body: "linha 1\nlinha 2 ``` cerca" } };
const choice: UiSubmission = { kind: "picker", values: ["north", "south"], labels: ["Norte", "Sul"] };

describe("ui submission", () => {
  it("writes an instruction the agent can act on, with the values as JSON", () => {
    const text = formatUiSubmission(form);
    expect(text.startsWith("[ui:schema-form] The user submitted the form of command example.CreateNoteCommand (create).")).toBe(true);
    expect(text).toContain('"commandId": "example.CreateNoteCommand"');
    expect(formatUiSubmission(choice)).toContain('The user chose: "Norte", "Sul".');
  });

  it.each([["a form", form], ["a choice", choice]])("round-trips %s", (_name, submission) => {
    expect(parseUiSubmission(formatUiSubmission(submission))).toEqual(submission);
  });

  it.each([
    "Olá, tudo bem?",
    "[ui:schema-form] sem bloco de dados",
    '[ui:schema-form] x\n```json\n{"commandId": 1}\n```',
    "[ui:picker] x\n```json\nnot json\n```",
    '[ui:unknown] x\n```json\n{}\n```',
  ])("treats %j as ordinary text", (text) => {
    expect(parseUiSubmission(text)).toBeNull();
  });
});

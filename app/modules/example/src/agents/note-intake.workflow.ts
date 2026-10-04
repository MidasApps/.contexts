import { nodeOfContext, readAgentContext, type WorkflowCommandPort } from "@core/agents";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { EXAMPLE_NOTE_INTAKE_WORKFLOW_ID } from "../capabilities.ts";
import { CreateNoteCommandContract, CreateNoteCommandSchema } from "../contracts/note-commands.schema.ts";

export const NoteIntakeResultSchema = z.strictObject({
  outcome: z.enum(["created", "failed"]),
  noteId: z.string().nullable(),
  /** Why nothing was created: CONTEXT_MISSING or the command's refusal code. */
  code: z.string().nullable(),
});
export type NoteIntakeResult = z.infer<typeof NoteIntakeResultSchema>;

const readNoteId = (output: unknown): string | null =>
  typeof output === "object" && output !== null && "noteId" in output && typeof output.noteId === "string"
    ? output.noteId
    : null;

const createNoteStep = (deps: { readonly commands: WorkflowCommandPort }) =>
  createStep({
    id: "create-note",
    description: "Runs example.CreateNoteCommand as the caller, once per run (idempotency key = run id).",
    inputSchema: CreateNoteCommandSchema,
    outputSchema: NoteIntakeResultSchema,
    execute: async ({ inputData, requestContext, runId }) => {
      const snapshot = readAgentContext(requestContext);
      if (!snapshot.ok) return { outcome: "failed" as const, noteId: null, code: "CONTEXT_MISSING" };
      const { context, principal } = snapshot.data;
      const result = await deps.commands.run({
        principal,
        tenantId: context.tenantId,
        node: nodeOfContext(context),
        commandId: CreateNoteCommandContract.id,
        input: inputData,
        idempotencyKey: runId,
        requestId: context.requestId,
      });
      return result.ok
        ? { outcome: "created" as const, noteId: readNoteId(result.output), code: null }
        : { outcome: "failed" as const, noteId: null, code: result.code };
    },
  });

/**
 * `example-note-intake`: creates a note through the command registry, like the form and the agent
 * tool do. The workflow command port re-authorizes the caller (`example.note.create`) and runs
 * the command at most once per run, so a retried step never creates a second note.
 */
export const createNoteIntakeWorkflow = (deps: { readonly commands: WorkflowCommandPort }) =>
  createWorkflow({
    id: EXAMPLE_NOTE_INTAKE_WORKFLOW_ID,
    description: "Creates a note in the caller's organization.",
    inputSchema: CreateNoteCommandSchema,
    outputSchema: NoteIntakeResultSchema,
  })
    .then(createNoteStep(deps))
    .commit();

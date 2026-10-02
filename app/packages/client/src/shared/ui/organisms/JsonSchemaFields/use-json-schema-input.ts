"use client";

import { useMemo, useState } from "react";
import { ApiError } from "#/shared/api/api-error.ts";
import { draftOfValue, readJsonInput, serverProblemsOf, type JsonInputDraft, type JsonInputProblems } from "./json-input-draft.ts";
import { planJsonSchemaFields, type JsonSchemaPlan } from "./json-schema-plan.ts";

const NO_PROBLEMS: JsonInputProblems = { fields: {}, json: false };

type Source = { readonly schema: Readonly<Record<string, unknown>> | null; readonly initial: Readonly<Record<string, unknown>> };

export type JsonSchemaInput = {
  readonly plan: JsonSchemaPlan;
  readonly draft: JsonInputDraft;
  readonly setDraft: (draft: JsonInputDraft) => void;
  readonly problems: JsonInputProblems;
  /** The value to send, or `null` after showing every problem next to its field. */
  readonly read: () => Record<string, unknown> | null;
  /**
   * Puts a refused call's `VALIDATION_FAILED` details on the fields; `true` when every detail
   * landed on a field (the dialog then needs no alert of its own).
   */
  readonly applyFailure: (error: unknown) => boolean;
};

/**
 * State of a workflow input edited through `JsonSchemaFields`: the draft follows the schema (a
 * different workflow starts from its own defaults, or from `initial`), with client and server
 * problems per field.
 */
export const useJsonSchemaInput = (schema: Readonly<Record<string, unknown>> | null, initial: Readonly<Record<string, unknown>> = {}): JsonSchemaInput => {
  const plan = useMemo(() => planJsonSchemaFields(schema), [schema]);
  const [source, setSource] = useState<Source>({ schema, initial });
  const [draft, setDraft] = useState<JsonInputDraft>(() => draftOfValue(plan, initial));
  const [problems, setProblems] = useState<JsonInputProblems>(NO_PROBLEMS);
  // Another workflow was chosen: start over from its schema (state adjusted during render, no effect).
  if (source.schema !== schema) {
    setSource({ schema, initial: source.initial });
    setDraft(draftOfValue(plan, source.initial));
    setProblems(NO_PROBLEMS);
  }
  const read = (): Record<string, unknown> | null => {
    const result = readJsonInput(plan, draft);
    setProblems(result.ok ? NO_PROBLEMS : result.problems);
    return result.ok ? result.value : null;
  };
  const applyFailure = (error: unknown): boolean => {
    if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED" || error.details === undefined) return false;
    const mapped = serverProblemsOf(plan, draft.mode, error.details);
    setProblems({ fields: mapped.fields, json: false });
    return !mapped.unmatched && Object.keys(mapped.fields).length > 0;
  };
  const edit = (next: JsonInputDraft): void => {
    setDraft(next);
    // A field the user is fixing drops its server error; client checks rerun on submit.
    if (problems !== NO_PROBLEMS) setProblems({ fields: Object.fromEntries(Object.entries(problems.fields).filter(([name]) => next.fields[name] === draft.fields[name])), json: problems.json && next.json === draft.json });
  };
  return { plan, draft, setDraft: edit, problems, read, applyFailure };
};

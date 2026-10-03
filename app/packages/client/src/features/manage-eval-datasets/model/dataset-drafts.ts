import type { AddEvalDatasetItemInput } from "@core/contracts";
import { ApiError } from "#/shared/api/api-error.ts";

/** Same cap as the API (`AddEvalDatasetItemInputSchema`). */
export const ITEM_TEXT_MAX = 4000;
export const DATASET_NAME_MAX = 200;

export type DatasetNameProblem = "nameRequired" | "nameTaken";

export const validateDatasetName = (name: string): DatasetNameProblem | undefined => (name.trim() === "" ? "nameRequired" : undefined);

/** 409: the organization already has a dataset of that name. Anything else is a general error. */
export const datasetRefusal = (error: unknown): DatasetNameProblem | null => (error instanceof ApiError && error.status === 409 ? "nameTaken" : null);

export type ItemDraft = { input: string; expectedOutput: string };
export type ItemDraftProblems = { input?: "inputRequired" };

export const validateItemDraft = (draft: ItemDraft): ItemDraftProblems => (draft.input.trim() === "" ? { input: "inputRequired" } : {});

/** The request body: trimmed texts, no expected answer when the field is empty. */
export const itemBody = (draft: ItemDraft): AddEvalDatasetItemInput => {
  const expectedOutput = draft.expectedOutput.trim();
  return { input: draft.input.trim(), ...(expectedOutput === "" ? {} : { expectedOutput }) };
};

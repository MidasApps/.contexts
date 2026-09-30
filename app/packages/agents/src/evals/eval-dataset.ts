import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { type EvalGroundTruth, EvalGroundTruthSchema } from "../scorers/eval-ground-truth.schema.ts";

/**
 * Versioned eval sets (decision 0028): `evals/datasets/<agent>.v<N>.jsonl`, one case
 * per line, the source of truth (`pnpm evals:seed` copies them into Mastra datasets).
 */

export const EVAL_AGENT_IDS = ["assistant", "knowledge", "data", "action"] as const;
export type EvalAgentId = (typeof EVAL_AGENT_IDS)[number];

/** Dataset version the gate runs; a new file version is a new Mastra dataset. */
export const CURRENT_DATASET_VERSION = 1;

/** `packages/agents/evals` (datasets and baselines). */
export const EVALS_DIR = path.resolve(import.meta.dirname, "../../evals");

export const EvalCaseSchema = EvalGroundTruthSchema.extend({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  /** The user message; fake directives (`[[fake:…]]`) only where no keyword rule applies. */
  input: z.string().min(1).max(4000),
  tags: z.array(z.string().regex(/^[a-z][a-z-]{0,31}$/)).max(5).default([]),
});

export type EvalCase = { readonly id: string; readonly input: string; readonly tags: readonly string[]; readonly groundTruth: EvalGroundTruth };

export type EvalDataset = {
  readonly agentId: string;
  readonly version: number;
  /** `<agent>.v<N>`: the Mastra dataset name. */
  readonly name: string;
  /** SHA-256 of the file: seeding skips an unchanged file, reports record it. */
  readonly sha256: string;
  readonly cases: readonly EvalCase[];
};

export const datasetFileOf = (agentId: string, version: number): string => path.join(EVALS_DIR, "datasets", `${agentId}.v${version}.jsonl`);

const toCase = (line: string, lineNumber: number): EvalCase => {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch (error: unknown) {
    throw new Error(`eval dataset line ${lineNumber} is not JSON`, { cause: error });
  }
  const parsed = EvalCaseSchema.safeParse(json);
  if (!parsed.success) throw new Error(`eval dataset line ${lineNumber} is invalid: ${z.prettifyError(parsed.error)}`);
  const { id, input, tags, ...groundTruth } = parsed.data;
  return { id, input, tags, groundTruth };
};

/**
 * Parses a JSONL eval set.
 * @throws {Error} naming the first invalid line (a broken dataset fails the gate loudly).
 */
export const parseEvalDataset = (args: { readonly agentId: string; readonly version: number; readonly text: string }): EvalDataset => {
  const cases = args.text.split(/\r?\n/).flatMap((line, index) => (line.trim() === "" ? [] : [toCase(line, index + 1)]));
  return {
    agentId: args.agentId,
    version: args.version,
    name: `${args.agentId}.v${args.version}`,
    sha256: createHash("sha256").update(args.text.replace(/\r\n/g, "\n")).digest("hex"),
    cases,
  };
};

export const loadEvalDataset = (agentId: string, version: number = CURRENT_DATASET_VERSION): EvalDataset =>
  parseEvalDataset({ agentId, version, text: readFileSync(datasetFileOf(agentId, version), "utf8") });

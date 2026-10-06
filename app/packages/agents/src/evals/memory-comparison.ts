import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { z } from "zod";
import { createMemory } from "../memory/create-memory.ts";
import { type AgentModels, createModelProvider, type ModelFactoryEnv } from "../models/model-factory.ts";
import { EVALS_DIR } from "./eval-dataset.ts";
import type { EvalMode } from "./eval-harness.ts";
import { EVAL_REPORT_DIR } from "./eval-report.ts";
import { InMemoryVector } from "./in-memory-vector.ts";
import { type ModelMeter, meterModels } from "./metered-models.ts";

/**
 * Observational Memory comparison (SP3 Task 28, spec §10, decision 0029): the same
 * multi-turn set runs against config A (the default memory: history, semantic recall,
 * working memory) and config B (the same memory with `AI_MEMORY_OBSERVATIONAL=true`,
 * exactly what the flag turns on). Each case states facts in one conversation and
 * asks for them in a new conversation of the same resource. Score = share of expected
 * terms in the answer; tokens and cost cover every text model call of the config.
 */

export const MemoryCaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  setup: z.array(z.string().min(1).max(2000)).min(1).max(20),
  probe: z.string().min(1).max(2000),
  expectedTerms: z.array(z.string().min(1).max(100)).min(1).max(5),
});
export type MemoryCase = z.infer<typeof MemoryCaseSchema>;

export type MemoryDataset = { readonly name: string; readonly sha256: string; readonly cases: readonly MemoryCase[] };

export const loadMemoryDataset = (version = 1): MemoryDataset => {
  const raw = readFileSync(path.join(EVALS_DIR, "datasets", `memory.v${version}.jsonl`), "utf8");
  const cases = raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => MemoryCaseSchema.parse(JSON.parse(line)));
  return { name: `memory.v${version}`, sha256: createHash("sha256").update(raw).digest("hex"), cases };
};

export type MemoryConfigId = "A-semantic-recall" | "B-observational";
export const MEMORY_CONFIGS: readonly { readonly id: MemoryConfigId; readonly observational: boolean }[] = [
  { id: "A-semantic-recall", observational: false },
  { id: "B-observational", observational: true },
];

export type MemoryCaseResult = {
  readonly caseId: string;
  readonly score: number;
  readonly answerExcerpt: string;
  readonly recallReachedPrompt: boolean;
};
export type MemoryConfigResult = {
  readonly configId: MemoryConfigId;
  readonly meanScore: number;
  readonly cases: readonly MemoryCaseResult[];
  readonly meter: ModelMeter;
};

/** Share of expected terms present in the answer (case-insensitive). */
export const scoreRecall = (answer: string, expectedTerms: readonly string[]): number => {
  const text = answer.toLowerCase();
  return expectedTerms.filter((term) => text.includes(term.toLowerCase())).length / expectedTerms.length;
};

const AGENT_ID = "memory-eval";
const EVAL_TENANT = "evalMemoryTenant0001";

const buildAgent = (models: AgentModels, observational: boolean) => {
  const storage = new InMemoryStore();
  const memory = createMemory({
    storage,
    vector: new InMemoryVector(),
    models,
    env: { AI_MEMORY_OBSERVATIONAL: observational },
  });
  const agent = new Agent({
    id: AGENT_ID,
    name: "Memory eval",
    instructions:
      "You are a workspace assistant. Answer the user's question in one or two sentences, using what you remember about the user.",
    model: models.language("chat", { agentId: AGENT_ID }),
    memory,
  });
  const mastra = new Mastra({ agents: { [AGENT_ID]: agent }, storage });
  return { agent: mastra.getAgent(AGENT_ID), memory };
};

const ANSWER_EXCERPT_CHARS = 300;

const runConfig = async (args: {
  env: ModelFactoryEnv;
  dataset: MemoryDataset;
  configId: MemoryConfigId;
  observational: boolean;
}): Promise<MemoryConfigResult> => {
  const metered = meterModels(createModelProvider(args.env), args.env);
  const { agent, memory } = buildAgent(metered.models, args.observational);
  const cases: MemoryCaseResult[] = [];
  for (const item of args.dataset.cases) {
    const resource = `${EVAL_TENANT}:member-${item.id}`;
    const threads = { setup: `${item.id}-setup`, probe: `${item.id}-probe` };
    await memory.createThread({ threadId: threads.setup, resourceId: resource });
    await memory.createThread({ threadId: threads.probe, resourceId: resource });
    for (const turn of item.setup) await agent.generate(turn, { memory: { thread: threads.setup, resource } });
    const promptsBefore = metered.chatPrompts.length;
    const answer = await agent.generate(item.probe, { memory: { thread: threads.probe, resource } });
    const probePrompts = metered.chatPrompts.slice(promptsBefore).join("\n");
    cases.push({
      caseId: item.id,
      score: scoreRecall(answer.text, item.expectedTerms),
      answerExcerpt: answer.text.slice(0, ANSWER_EXCERPT_CHARS),
      recallReachedPrompt: item.setup.some((turn) => probePrompts.includes(turn.slice(0, 40))),
    });
  }
  const meanScore = cases.reduce((sum, result) => sum + result.score, 0) / cases.length;
  return { configId: args.configId, meanScore, cases, meter: metered.meter() };
};

/** Max cost of B relative to A for OM to be enabled by default (plan Task 28). */
export const MAX_COST_RATIO = 1.2;

export type OmRecommendation = { readonly enableByDefault: boolean; readonly reason: string };

/** Enable OM only on a real run where B scores ≥ A at ≤ 1.2× A's cost; fake runs never decide. */
export const recommendObservational = (
  mode: EvalMode,
  a: MemoryConfigResult,
  b: MemoryConfigResult,
): OmRecommendation => {
  if (mode === "fake")
    return {
      enableByDefault: false,
      reason: "fake mode proves the harness only; scores of scripted models say nothing about quality",
    };
  if (a.meter.costMicroUsd === null || b.meter.costMicroUsd === null)
    return { enableByDefault: false, reason: "a called model has no verified price" };
  if (b.meanScore < a.meanScore)
    return { enableByDefault: false, reason: `B scored ${b.meanScore} < A ${a.meanScore}` };
  if (b.meter.costMicroUsd > a.meter.costMicroUsd * MAX_COST_RATIO)
    return {
      enableByDefault: false,
      reason: `B cost ${b.meter.costMicroUsd} > ${MAX_COST_RATIO} × A ${a.meter.costMicroUsd}`,
    };
  return {
    enableByDefault: true,
    reason: `B scored ${b.meanScore} ≥ A ${a.meanScore} at ≤ ${MAX_COST_RATIO} × A's cost`,
  };
};

export type MemoryComparisonReport = {
  readonly mode: EvalMode;
  readonly dataset: { readonly name: string; readonly sha256: string; readonly cases: number };
  readonly models: { readonly chat: string; readonly fast: string; readonly embedding: string };
  readonly configs: readonly MemoryConfigResult[];
  readonly recommendation: OmRecommendation;
  readonly generatedAt: string;
};

/** Runs both configs sequentially (fresh store, vector and meter each) and writes the report. */
export const runMemoryComparison = async (args: {
  readonly mode: EvalMode;
  readonly env: ModelFactoryEnv;
  readonly dataset?: MemoryDataset;
  readonly reportDir?: string | null;
  readonly now?: () => Date;
}): Promise<{ readonly report: MemoryComparisonReport; readonly reportPath: string | null }> => {
  const dataset = args.dataset ?? loadMemoryDataset();
  const configs: MemoryConfigResult[] = [];
  for (const config of MEMORY_CONFIGS)
    configs.push(await runConfig({ env: args.env, dataset, configId: config.id, observational: config.observational }));
  const [a, b] = configs as [MemoryConfigResult, MemoryConfigResult];
  const report: MemoryComparisonReport = {
    mode: args.mode,
    dataset: { name: dataset.name, sha256: dataset.sha256, cases: dataset.cases.length },
    models: { chat: args.env.AI_MODEL_CHAT, fast: args.env.AI_MODEL_FAST, embedding: args.env.AI_MODEL_EMBEDDING },
    configs,
    recommendation: recommendObservational(args.mode, a, b),
    generatedAt: (args.now ?? (() => new Date()))().toISOString(),
  };
  const dir = args.reportDir === undefined ? EVAL_REPORT_DIR : args.reportDir;
  if (dir === null) return { report, reportPath: null };
  mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, args.mode === "real" ? "memory-comparison.real.json" : "memory-comparison.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
};

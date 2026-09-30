import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EVALS_DIR } from "./eval-dataset.ts";

/**
 * Gate thresholds per scorer (`evals/baselines/<agent>.json`, decision 0028): a mean
 * below `minimum - tolerance` fails the gate. The band absorbs model noise in real
 * mode; in fake mode runs are deterministic, so baselines sit at the measured means.
 */
const BandSchema = z
  .strictObject({ minimum: z.number().min(0).max(1), tolerance: z.number().min(0).max(1) })
  .refine((value) => value.tolerance <= value.minimum, { error: "tolerance must not exceed minimum" });

/** `real` overrides the band for `pnpm evals:real` (real models drift; fake runs do not). */
const ScorerBaselineSchema = z.strictObject({
  minimum: z.number().min(0).max(1),
  tolerance: z.number().min(0).max(1),
  real: BandSchema.optional(),
}).refine((value) => value.tolerance <= value.minimum, { error: "tolerance must not exceed minimum" });

export const BaselineSchema = z.record(z.string().regex(/^[a-z][a-z-]{0,63}$/), ScorerBaselineSchema);
export type Baseline = z.infer<typeof BaselineSchema>;
/** One band per scorer, for the mode being gated. */
export type ResolvedBaseline = Readonly<Record<string, { readonly minimum: number; readonly tolerance: number }>>;

export const baselineFor = (baseline: Baseline, mode: "fake" | "real"): ResolvedBaseline =>
  Object.fromEntries(
    Object.entries(baseline).map(([scorerId, entry]) => [scorerId, mode === "real" && entry.real !== undefined ? entry.real : { minimum: entry.minimum, tolerance: entry.tolerance }]),
  );

export type ScorerGateResult = {
  readonly scorerId: string;
  /** `null` when every case was not scorable (a baselined scorer must score). */
  readonly mean: number | null;
  readonly minimum: number;
  readonly tolerance: number;
  readonly floor: number;
  readonly passed: boolean;
};

export type GateResult = { readonly passed: boolean; readonly scorers: readonly ScorerGateResult[] };

// 0.9 - 0.05 is 0.8500000000000001 in floating point; baselines use at most 4 decimals.
const roundFloor = (value: number): number => Math.round(value * 10_000) / 10_000;

/** Compares the mean score per scorer with the baseline; scorers without a baseline are reported elsewhere. */
export const evaluateGate = (args: { readonly means: Readonly<Record<string, number | null>>; readonly baseline: ResolvedBaseline }): GateResult => {
  const scorers = Object.entries(args.baseline).map(([scorerId, { minimum, tolerance }]) => {
    const mean = args.means[scorerId] ?? null;
    const floor = roundFloor(minimum - tolerance);
    return { scorerId, mean, minimum, tolerance, floor, passed: mean !== null && mean >= floor };
  });
  return { passed: scorers.every((scorer) => scorer.passed), scorers };
};

export const baselineFileOf = (agentId: string): string => path.join(EVALS_DIR, "baselines", `${agentId}.json`);

/** @throws {Error} when the baseline file is missing or invalid (the gate cannot run without it). */
export const loadBaseline = (agentId: string): Baseline => BaselineSchema.parse(JSON.parse(readFileSync(baselineFileOf(agentId), "utf8")));

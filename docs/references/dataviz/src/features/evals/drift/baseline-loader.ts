/**
 * Sprint 3.D, Task 14 — gold baseline loader.
 *
 * Le `gold-30.json` e devolve um mapa `{fixtureId: {scorerName: score}}`
 * a partir de `goldScores`. Reutilizado pelo detector de drift e por
 * eventuais validacoes em CI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BriefingFixtureArraySchema } from '../datasets/schema';
import type { BriefingFixture } from '../scorers/types';

export type GoldBaseline = Record<string, Record<string, number>>;

export function buildBaselineFromFixtures(fixtures: BriefingFixture[]): GoldBaseline {
  const out: GoldBaseline = {};
  for (const fx of fixtures) {
    if (!fx.goldScores) continue;
    const inner: Record<string, number> = {};
    for (const [k, v] of Object.entries(fx.goldScores)) {
      if (typeof v === 'number') inner[k] = v;
    }
    if (Object.keys(inner).length > 0) {
      out[fx.id] = inner;
    }
  }
  return out;
}

export async function loadGoldBaseline(
  path: string = join(process.cwd(), 'src/features/evals/datasets/gold-30.json'),
): Promise<GoldBaseline> {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const fixtures = BriefingFixtureArraySchema.parse(raw) as BriefingFixture[];
  return buildBaselineFromFixtures(fixtures);
}

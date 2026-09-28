/**
 * Valida datasets de eval (Sprint 3.D Tasks 9-10):
 * - smoke-30.json: 30 entries 100% parseaveis pelo Zod schema
 * - full-180.json: 180 entries 100% parseaveis (scaffold copia smoke 6x)
 * - gold-30.json: 30 entries com goldScores >=5 scorers
 * - ids unicos por arquivo
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BriefingFixtureArraySchema } from '../schema';

const ROOT = join(process.cwd(), 'src/features/evals/datasets');

function loadJson(file: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
}

describe('datasets/schema', () => {
  it('smoke-30.json parses 100% (30 entries valid)', () => {
    const raw = loadJson('smoke-30.json');
    const parsed = BriefingFixtureArraySchema.parse(raw);
    expect(parsed).toHaveLength(30);
  });

  it('full-180.json parses 100% (180 entries valid)', () => {
    const raw = loadJson('full-180.json');
    const parsed = BriefingFixtureArraySchema.parse(raw);
    expect(parsed).toHaveLength(180);
  });

  it('smoke-30 has unique ids', () => {
    const parsed = BriefingFixtureArraySchema.parse(loadJson('smoke-30.json'));
    const ids = new Set(parsed.map((f) => f.id));
    expect(ids.size).toBe(parsed.length);
  });

  it('full-180 has unique ids', () => {
    const parsed = BriefingFixtureArraySchema.parse(loadJson('full-180.json'));
    const ids = new Set(parsed.map((f) => f.id));
    expect(ids.size).toBe(parsed.length);
  });

  it('smoke-30 covers all 6 templateIds', () => {
    const parsed = BriefingFixtureArraySchema.parse(loadJson('smoke-30.json'));
    const templates = new Set(parsed.map((f) => f.templateId));
    expect(templates.size).toBe(6);
  });

  // Era "cobre os 4 clientes". Com um tenant só, o que ainda vale a pena
  // travar é que nenhum fixture aponte para tenant inexistente — o parse
  // sozinho garantiria isso, mas a asserção explícita é o que vai falhar de
  // forma legível se alguém adicionar um fixture de outro cliente.
  it('smoke-30 só referencia tenants existentes', () => {
    const parsed = BriefingFixtureArraySchema.parse(loadJson('smoke-30.json'));
    const clients = new Set(parsed.map((f) => f.clientId));
    expect([...clients]).toEqual(['vila-rosa']);
  });

  it('smoke-30 spans at least 6 distinct personas', () => {
    const parsed = BriefingFixtureArraySchema.parse(loadJson('smoke-30.json'));
    const personas = new Set(parsed.map((f) => f.personaId));
    expect(personas.size).toBeGreaterThanOrEqual(6);
  });

  it('gold-30.json parses 100% with goldScores populated', () => {
    const raw = loadJson('gold-30.json');
    const parsed = BriefingFixtureArraySchema.parse(raw);
    expect(parsed).toHaveLength(30);
    for (const f of parsed) {
      expect(f.goldScores).toBeDefined();
      const keys = Object.keys(f.goldScores ?? {});
      expect(keys.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('gold-30 has unique ids', () => {
    const parsed = BriefingFixtureArraySchema.parse(loadJson('gold-30.json'));
    const ids = new Set(parsed.map((f) => f.id));
    expect(ids.size).toBe(parsed.length);
  });
});

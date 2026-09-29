import { describe, it, expect } from 'vitest';
import { PersonaProfileSchema } from '../schemas';

const slugs = [
  'ceo-incorporadora','cfo-securitizadora','diretor-fii-cri','diretor-credito-banco',
  'gestor-credito-obra','gestor-repasse','controller','gestor-carteira-securitizadora',
  'analista-credito','analista-cobranca','corretor','backoffice-cartorario',
];

describe('persona profiles', () => {
  it('loads all 12 personas and validates each', async () => {
    for (const slug of slugs) {
      const mod = await import(`./${slug}.json`);
      expect(() => PersonaProfileSchema.parse(mod.default ?? mod)).not.toThrow();
    }
  });

  it('all persona ids are unique and slug-form', async () => {
    const ids: string[] = [];
    for (const slug of slugs) {
      const mod = await import(`./${slug}.json`);
      const parsed = PersonaProfileSchema.parse(mod.default ?? mod);
      ids.push(parsed.id);
      expect(parsed.id).toBe(slug);
    }
    expect(new Set(ids).size).toBe(slugs.length);
  });

  it('layer distribution: 4 estrategica, 4 tatica, 4 operacional', async () => {
    const counts = { estrategica: 0, tatica: 0, operacional: 0 };
    for (const slug of slugs) {
      const mod = await import(`./${slug}.json`);
      const parsed = PersonaProfileSchema.parse(mod.default ?? mod);
      counts[parsed.layer]++;
    }
    expect(counts.estrategica).toBe(4);
    expect(counts.tatica).toBe(4);
    expect(counts.operacional).toBe(4);
  });
});

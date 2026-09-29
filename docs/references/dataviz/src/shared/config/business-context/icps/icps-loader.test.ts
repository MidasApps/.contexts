import { describe, it, expect } from 'vitest';
import { IcpProfileSchema } from '../schemas';

const slugs = ['incorporadora-mcmv-grande','incorporadora-map','fundo-cri-listado','securitizadora','banco-grande','fintech-credito'];

describe('icp profiles', () => {
  it('loads all 6 icps and validates each', async () => {
    for (const slug of slugs) {
      const mod = await import(`./${slug}.json`);
      expect(() => IcpProfileSchema.parse(mod.default ?? mod)).not.toThrow();
    }
  });

  it('icp.id matches filename slug', async () => {
    for (const slug of slugs) {
      const mod = await import(`./${slug}.json`);
      const parsed = IcpProfileSchema.parse(mod.default ?? mod);
      expect(parsed.id).toBe(slug);
    }
  });
});

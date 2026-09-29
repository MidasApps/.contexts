import { describe, it, expect } from 'vitest';
import {
  PersonaProfileSchema,
  IcpProfileSchema,
} from './schemas';

const basePersona = {
  id: 'cfo-securitizadora',
  name: 'CFO de Securitizadora',
  layer: 'estrategica',
  language: 'executiva',
  horizon: 'longo',
  priorityKpis: ['oc', 'es'],
  preferredGranularity: 'carteira',
};

describe('PersonaProfileSchema', () => {
  it('validates layer enum', () => {
    expect(() => PersonaProfileSchema.parse({ ...basePersona, layer: 'foo' })).toThrow();
  });
  it('validates language and horizon enums', () => {
    expect(() => PersonaProfileSchema.parse({ ...basePersona, language: 'foo' })).toThrow();
    expect(() => PersonaProfileSchema.parse({ ...basePersona, horizon: 'foo' })).toThrow();
  });
  it('rejects empty priorityKpis', () => {
    expect(() => PersonaProfileSchema.parse({ ...basePersona, priorityKpis: [] })).toThrow();
  });
  it('accepts valid persona', () => {
    expect(() => PersonaProfileSchema.parse(basePersona)).not.toThrow();
  });
});

describe('IcpProfileSchema', () => {
  it('requires segment and primaryKpis non-empty', () => {
    expect(() =>
      IcpProfileSchema.parse({ id: 'i1', segment: 'X', decisionJourney: 'd', primaryKpis: [] }),
    ).toThrow();
  });
  it('accepts valid icp', () => {
    expect(() =>
      IcpProfileSchema.parse({
        id: 'fundo-cri',
        segment: 'Fundos de CRI',
        decisionJourney: 'avaliação trimestral',
        primaryKpis: ['oc', 'wal'],
      }),
    ).not.toThrow();
  });
});

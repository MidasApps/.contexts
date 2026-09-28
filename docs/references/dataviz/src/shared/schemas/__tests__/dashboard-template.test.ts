import { describe, it, expect } from 'vitest';
import {
  DashboardTemplateDoc,
  DashboardTemplate,
  TemplateId,
} from '../dashboard-template';

const baseDoc = {
  name: 'Visão Geral',
  description: 'KPIs principais',
  category: 'Carteira' as const,
  productRefs: ['credit'],
  blockMap: {},
  layout: [],
  metricRefs: ['dashboard.total_contratos'],
  status: 'active' as const,
  createdAt: new Date('2026-06-15T00:00:00Z'),
  updatedAt: new Date('2026-06-15T00:00:00Z'),
};

describe('TemplateId', () => {
  it('aceita kebab-case', () => {
    expect(() => TemplateId.parse('visao-geral')).not.toThrow();
    expect(() => TemplateId.parse('pdd')).not.toThrow();
  });
  it('rejeita maiúsculas e espaços', () => {
    expect(() => TemplateId.parse('Visao Geral')).toThrow();
    expect(() => TemplateId.parse('VisaoGeral')).toThrow();
  });
});

describe('DashboardTemplateDoc', () => {
  it('valida um doc mínimo e aplica defaults', () => {
    const parsed = DashboardTemplateDoc.parse({
      name: 'XY',
      description: 'desc',
      category: 'Risco',
      productRefs: ['credit'],
      createdAt: 0,
      updatedAt: 0,
    });
    expect(parsed.blockMap).toEqual({});
    expect(parsed.layout).toEqual([]);
    expect(parsed.metricRefs).toEqual([]);
    expect(parsed.status).toBe('active');
  });

  it('exige productRefs com ao menos 1 produto', () => {
    expect(() => DashboardTemplateDoc.parse({ ...baseDoc, productRefs: [] })).toThrow();
  });

  it('aceita múltiplos produtos', () => {
    const parsed = DashboardTemplateDoc.parse({ ...baseDoc, productRefs: ['credit', 'covenants'] });
    expect(parsed.productRefs).toEqual(['credit', 'covenants']);
  });

  it('rejeita category inválida', () => {
    expect(() => DashboardTemplateDoc.parse({ ...baseDoc, category: 'Foo' })).toThrow();
  });

  it('aceita segment opcional', () => {
    const parsed = DashboardTemplateDoc.parse({ ...baseDoc, segment: 'sbpe' });
    expect(parsed.segment).toBe('sbpe');
  });
});

describe('DashboardTemplate', () => {
  it('exige id válido', () => {
    expect(() => DashboardTemplate.parse({ ...baseDoc, id: 'visao-geral' })).not.toThrow();
    expect(() => DashboardTemplate.parse({ ...baseDoc, id: 'Bad Id' })).toThrow();
  });
});

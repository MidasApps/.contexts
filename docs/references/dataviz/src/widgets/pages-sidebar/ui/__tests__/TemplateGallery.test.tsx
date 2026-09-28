/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import type { Product } from '@/shared/schemas';
// Import direto da fonte de verdade (scripts/templates/*.template.mjs, mesmo
// import usado pelo seed em scripts/seed-covenants-templates.ts) para que o
// teste de escopo (productBindings) reflita o productRefs REAL do template, e
// não um literal fabricado — flagra regressão se a migração for revertida.
import covenantsTemplate from '../../../../../scripts/templates/covenants-v2-visao-executiva.template.mjs';

// ── Mocks dos hooks consumidos pela galeria ──────────────────────────────
const createMock = vi.fn(
  async (...args: unknown[]): Promise<string> => {
    void args;
    return 'new-report-id';
  },
);
const useTemplatesMock = vi.fn();
const useProductsListMock = vi.fn();
const useAvailableProductsMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/shared/hooks/useReports', () => ({
  useReports: () => ({ create: createMock }),
}));

vi.mock('@/shared/hooks/useTemplates', () => ({
  useTemplates: () => useTemplatesMock(),
}));

vi.mock('@/shared/hooks/useProducts', () => ({
  useProductsList: () => useProductsListMock(),
}));

vi.mock('@/shared/hooks/useActiveProduct', () => ({
  useAvailableProducts: () => useAvailableProductsMock(),
}));

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: { setActiveReport: () => void }) => unknown) =>
    selector({ setActiveReport: vi.fn() }),
}));

import { TemplateGallery } from '../TemplateGallery';

function product(o: Partial<Product>): Product {
  return {
    id: 'credit',
    name: 'Credit',
    slug: 'credit',
    icon: 'icon',
    color: '#10B981',
    status: 'active',
    description: null,
    contractRefs: [],
    entityRefs: [],
    metricRefs: [],
    indicators: [],
    routes: [],
    createdAt: null,
    updatedAt: null,
    ...o,
  } as Product;
}

function template(o: Partial<TemplateRecord>): TemplateRecord {
  return {
    id: 'tpl',
    name: 'Template',
    description: 'desc',
    category: 'Carteira',
    productRefs: ['credit'],
    blockMap: {},
    layout: [],
    metricRefs: [],
    status: 'active',
    ...o,
  };
}

describe('<TemplateGallery>', () => {
  beforeEach(() => {
    createMock.mockClear();
    pushMock.mockClear();
    useProductsListMock.mockReturnValue({
      products: [product({ id: 'credit', name: 'Credit' }), product({ id: 'covenants', name: 'Covenants' })],
    });
  });

  it('escopa templates e chips pelos produtos contratados do cliente', () => {
    useAvailableProductsMock.mockReturnValue([product({ id: 'credit', name: 'Credit' })]);
    useTemplatesMock.mockReturnValue({
      templates: [
        template({ id: 'tpl-credit', name: 'Carteira Credit', productRefs: ['credit'] }),
        template({ id: 'tpl-cov', name: 'Carteira Covenants', productRefs: ['covenants'] }),
      ],
      loading: false,
    });

    render(<TemplateGallery groupId="g1" onClose={() => {}} />);

    // Apenas o template do produto contratado aparece na lista lateral.
    expect(screen.getByRole('button', { name: /Carteira Credit/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Carteira Covenants/ })).not.toBeInTheDocument();

    // O chip de produto `covenants` (não contratado) NÃO aparece.
    expect(screen.queryByRole('button', { name: 'Covenants' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Credit' })).toBeInTheDocument();
  });

  it('não filtra quando não há produtos disponíveis (loading/sem bindings)', () => {
    useAvailableProductsMock.mockReturnValue([]);
    useTemplatesMock.mockReturnValue({
      templates: [
        template({ id: 'tpl-credit', name: 'Carteira Credit', productRefs: ['credit'] }),
        template({ id: 'tpl-cov', name: 'Carteira Covenants', productRefs: ['covenants'] }),
      ],
      loading: false,
    });

    render(<TemplateGallery groupId="g1" onClose={() => {}} />);

    expect(screen.getByRole('button', { name: /Carteira Credit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Carteira Covenants/ })).toBeInTheDocument();
  });

  it('cliente com binding liquid-play-plus vê o template de Covenants, sem refs de produto arquivado', () => {
    useAvailableProductsMock.mockReturnValue([product({ id: 'liquid-play-plus', name: 'Liquid Play+' })]);
    useTemplatesMock.mockReturnValue({
      templates: [
        // productRefs vem do arquivo real
        // (scripts/templates/covenants-v2-visao-executiva.template.mjs),
        // não de um literal fabricado.
        template({
          id: covenantsTemplate.id,
          name: covenantsTemplate.name,
          productRefs: covenantsTemplate.productRefs,
        }),
      ],
      loading: false,
    });

    render(<TemplateGallery groupId="g1" onClose={() => {}} />);

    // Só aparece se o productRefs do arquivo casar com o binding do cliente.
    expect(screen.getByRole('button', { name: new RegExp(covenantsTemplate.name) })).toBeInTheDocument();

    // `play` e `covenants` são produtos removidos na purga — nenhum binding
    // possível aponta para eles, então um template que ainda os referenciasse
    // ficaria invisível para todo cliente.
    expect(covenantsTemplate.productRefs).not.toContain('play');
    expect(covenantsTemplate.productRefs).not.toContain('covenants');
  });

  it('grava lineage (templateId/productRefs/metricRefs) ao importar', async () => {
    useAvailableProductsMock.mockReturnValue([product({ id: 'credit', name: 'Credit' })]);
    useTemplatesMock.mockReturnValue({
      templates: [
        template({
          id: 'tpl-credit',
          name: 'Carteira Credit',
          productRefs: ['credit'],
          metricRefs: ['pdd.total'],
          description: 'desc',
        }),
      ],
      loading: false,
    });

    render(<TemplateGallery groupId="g1" onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /usar este template/i }));

    // create chamado com lineage nos últimos 3 args:
    // (name, blockMap, layout, queries, description, filters, templateId, productRefs, metricRefs)
    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0];
    expect(args[6]).toBe('tpl-credit');
    expect(args[7]).toEqual(['credit']);
    expect(args[8]).toEqual(['pdd.total']);
  });
});

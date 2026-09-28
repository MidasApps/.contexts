/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';

const templates: TemplateRecord[] = [{
  id: 'pdd', name: 'PDD', description: 'd', category: 'Risco', productRefs: ['credit'],
  blockMap: {}, layout: [], metricRefs: [], status: 'active',
}];

vi.mock('@/features/admin/model/useAdminTemplates', () => ({
  useAdminTemplates: () => ({
    templates, loading: false, error: null,
    patch: vi.fn(), remove: vi.fn(), duplicate: vi.fn(), refetch: vi.fn(),
  }),
}));

vi.mock('@/features/admin/model/useAdminProducts', () => ({
  useAdminProducts: () => ({
    products: [{ id: 'credit', name: 'Credit', status: 'active' }],
    loading: false,
  }),
}));

import { TemplatesTab } from '../TemplatesTab';

/**
 * O admin deixou de ser oficina de template e virou prateleira: o conteúdo
 * (blocos, layout, filtros) nasce de uma PÁGINA, pelo "Salvar como template"
 * no menu dela. Aqui sobra a governança do catálogo.
 */
describe('<TemplatesTab>', () => {
  it('não oferece criar template do zero', () => {
    render(<TemplatesTab />);
    expect(screen.queryByRole('button', { name: /novo template/i })).not.toBeInTheDocument();
  });

  it('diz de onde vem um template novo', () => {
    render(<TemplatesTab />);
    expect(screen.getByText(/salvar como template/i)).toBeInTheDocument();
  });

  it('segue listando o catálogo', () => {
    render(<TemplatesTab />);
    expect(screen.getByText('PDD')).toBeInTheDocument();
  });
});

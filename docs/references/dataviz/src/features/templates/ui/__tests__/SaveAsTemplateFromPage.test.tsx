/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { SaveAsTemplateFromPage } from '../SaveAsTemplateFromPage';
import type { PageForTemplate } from '../SaveAsTemplateDialog';

const saveTemplate = vi.fn().mockResolvedValue({ id: 'x' });
const patchTemplate = vi.fn().mockResolvedValue(undefined);
const refetch = vi.fn();
let templates: TemplateRecord[] = [];

vi.mock('@/shared/lib/firestore/dashboard-templates', () => ({
  saveTemplate: (...args: unknown[]) => saveTemplate(...args),
  patchTemplate: (...args: unknown[]) => patchTemplate(...args),
}));

vi.mock('@/shared/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates, loading: false, refetch }),
}));

vi.mock('@/shared/hooks/useProducts', () => ({
  useProductsList: () => ({ products: [{ id: 'credit', name: 'Credit' }], loading: false }),
}));

function block(metricId: string): CanvasBlock {
  return { type: 'kpi', metricId } as unknown as CanvasBlock;
}

const basePage: PageForTemplate = {
  name: 'Inadimplência',
  blockMap: { b1: block('pdd_total') },
  layout: [],
};

function template(o: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    id: 'pdd', name: 'PDD', description: 'd', category: 'Risco', productRefs: ['credit'],
    blockMap: { velho: block('metrica_velha') }, layout: [],
    filters: { dropdowns: ['uf'] } as unknown as TemplateRecord['filters'],
    metricRefs: ['metrica_velha'], status: 'active', ...o,
  };
}

function renderDialog(page: PageForTemplate = basePage) {
  render(<SaveAsTemplateFromPage open onClose={() => {}} page={page} />);
}

const save = () => fireEvent.click(screen.getByRole('button', { name: /salvar template/i }));

describe('<SaveAsTemplateFromPage>', () => {
  beforeEach(() => {
    templates = [];
    saveTemplate.mockClear();
    patchTemplate.mockClear();
    refetch.mockClear();
  });

  it('grava template novo com o conteúdo da página', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Visão Geral' } });
    fireEvent.click(screen.getByLabelText('Credit'));
    save();

    await waitFor(() => expect(saveTemplate).toHaveBeenCalled());
    expect(saveTemplate.mock.calls[0]![0]).toMatchObject({
      id: 'visao-geral',
      blockMap: basePage.blockMap,
      metricRefs: ['pdd_total'],
    });
    expect(patchTemplate).not.toHaveBeenCalled();
  });

  /*
   * O POST faz `set(..., { merge: true })`, e merge no Firestore é PROFUNDO em
   * campos de mapa: sobrescrever um template por lá deixaria os blocos antigos
   * convivendo com os novos dentro do blockMap. O PATCH usa `update()`, que
   * troca o campo inteiro.
   */
  it('sobrescreve template existente pelo PATCH, e não pelo upsert', async () => {
    templates = [template()];
    renderDialog({ ...basePage, templateId: 'pdd' });

    save();

    await waitFor(() => expect(patchTemplate).toHaveBeenCalled());
    expect(patchTemplate.mock.calls[0]![0]).toBe('pdd');
    expect(patchTemplate.mock.calls[0]![1]).toMatchObject({
      blockMap: basePage.blockMap,
      metricRefs: ['pdd_total'],
    });
    expect(saveTemplate).not.toHaveBeenCalled();
  });

  it('apaga os filtros do template quando a página não tem nenhum', async () => {
    templates = [template()];
    renderDialog({ ...basePage, templateId: 'pdd' });

    save();

    await waitFor(() => expect(patchTemplate).toHaveBeenCalled());
    expect(patchTemplate.mock.calls[0]![1].filters).toBeNull();
  });

  it('recarrega a lista de templates depois de gravar', async () => {
    templates = [template()];
    renderDialog({ ...basePage, templateId: 'pdd' });

    save();

    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });
});

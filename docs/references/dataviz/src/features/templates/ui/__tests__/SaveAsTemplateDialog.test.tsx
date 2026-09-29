/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { SaveAsTemplateDialog, type PageForTemplate } from '../SaveAsTemplateDialog';

const products = [
  { id: 'credit', name: 'Credit' },
  { id: 'covenants', name: 'Covenants' },
];

function block(metricId?: string): CanvasBlock {
  return { type: 'kpi', ...(metricId ? { metricId } : {}) } as unknown as CanvasBlock;
}

function makePage(o: Partial<PageForTemplate> = {}): PageForTemplate {
  return {
    name: 'Inadimplência',
    description: 'como anda a carteira',
    blockMap: { b1: block('pdd_total'), b2: block('pdd_total'), b3: block() },
    layout: [{ id: 'r1', blocks: ['b1', 'b2'] }] as unknown as PageForTemplate['layout'],
    ...o,
  };
}

function template(o: Partial<TemplateRecord>): TemplateRecord {
  return {
    id: 'pdd', name: 'PDD', description: 'provisão', category: 'Risco',
    productRefs: ['credit'], blockMap: { antigo: block('velho') }, layout: [],
    metricRefs: ['velho'], status: 'active', ...o,
  };
}

function render_(props: Partial<React.ComponentProps<typeof SaveAsTemplateDialog>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <SaveAsTemplateDialog
      open
      onClose={() => {}}
      page={makePage()}
      templates={[]}
      products={products}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit };
}

const save = () => fireEvent.click(screen.getByRole('button', { name: /salvar template/i }));

describe('<SaveAsTemplateDialog>', () => {
  it('cria um template novo com os blocos da página', async () => {
    const { onSubmit } = render_();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Visão de Inadimplência' } });
    fireEvent.click(screen.getByLabelText('Credit'));
    save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'create',
        record: expect.objectContaining({
          id: 'visao-de-inadimplencia',
          name: 'Visão de Inadimplência',
          productRefs: ['credit'],
          blockMap: makePage().blockMap,
          layout: makePage().layout,
        }),
      }),
    );
  });

  it('deriva metricRefs dos blocos da página, sem repetir', () => {
    const { onSubmit } = render_();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Qualquer Coisa' } });
    fireEvent.click(screen.getByLabelText('Credit'));
    save();

    expect(onSubmit.mock.calls[0]![0].record.metricRefs).toEqual(['pdd_total']);
  });

  it('herda nome e descrição da página como sugestão inicial', () => {
    render_();
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Inadimplência');
    expect((screen.getByLabelText('Descrição') as HTMLInputElement).value).toBe('como anda a carteira');
  });

  it('atualiza o template escolhido, preservando o id e trocando o conteúdo', () => {
    const { onSubmit } = render_({ templates: [template({ id: 'pdd', name: 'PDD' })] });

    fireEvent.click(screen.getByLabelText(/atualizar template existente/i));
    fireEvent.change(screen.getByLabelText(/template a atualizar/i), { target: { value: 'pdd' } });
    save();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'update',
        record: expect.objectContaining({
          id: 'pdd',
          blockMap: makePage().blockMap,
          metricRefs: ['pdd_total'],
        }),
      }),
    );
  });

  it('carrega os metadados do template escolhido para atualizar', () => {
    render_({ templates: [template({ id: 'pdd', name: 'PDD', description: 'provisão' })] });

    fireEvent.click(screen.getByLabelText(/atualizar template existente/i));
    fireEvent.change(screen.getByLabelText(/template a atualizar/i), { target: { value: 'pdd' } });

    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('PDD');
    expect((screen.getByLabelText('Descrição') as HTMLInputElement).value).toBe('provisão');
  });

  it('já abre em "atualizar" quando a página veio de um template', () => {
    render_({
      page: makePage({ templateId: 'pdd' }),
      templates: [template({ id: 'pdd' })],
    });

    expect((screen.getByLabelText(/atualizar template existente/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/template a atualizar/i) as HTMLSelectElement).value).toBe('pdd');
  });

  it('recusa criar template com id que já existe', () => {
    const { onSubmit } = render_({ templates: [template({ id: 'pdd', name: 'PDD' })] });

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'PDD' } });
    fireEvent.click(screen.getByLabelText('Credit'));
    save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/já existe um template/i)).toBeInTheDocument();
  });

  it('recusa salvar sem nenhum produto', () => {
    const { onSubmit } = render_();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Sem Produto' } });
    save();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /*
   * O pai monta o objeto `page` inline, então ele muda de identidade a cada
   * render dele. Se o reset do formulário se guiar por essa identidade, o que
   * foi digitado some sozinho no meio do preenchimento.
   */
  it('não descarta o que foi digitado quando o pai re-renderiza', () => {
    const props = { open: true, onClose: () => {}, templates: [], products, onSubmit: vi.fn() };
    const { rerender } = render(<SaveAsTemplateDialog {...props} page={makePage()} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome Digitado' } });
    rerender(<SaveAsTemplateDialog {...props} page={makePage()} />);

    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Nome Digitado');
  });

  /*
   * O catálogo chega por fetch depois da montagem: no primeiro render
   * `templates` está vazio e o template de origem ainda não existe para ser
   * apontado.
   */
  it('aponta para o template de origem quando o catálogo chega depois', () => {
    const props = { open: true, onClose: () => {}, products, onSubmit: vi.fn(), page: makePage({ templateId: 'pdd' }) };
    const { rerender } = render(<SaveAsTemplateDialog {...props} templates={[]} />);

    expect((screen.getByLabelText(/criar template novo/i) as HTMLInputElement).checked).toBe(true);

    rerender(<SaveAsTemplateDialog {...props} templates={[template({ id: 'pdd' })]} />);

    expect((screen.getByLabelText(/atualizar template existente/i) as HTMLInputElement).checked).toBe(true);
  });

  it('não gera template de página com edições não salvas', () => {
    const { onSubmit } = render_({ pendingDraft: true });

    fireEvent.click(screen.getByLabelText('Credit'));
    save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/salve a página/i)).toBeInTheDocument();
  });
});

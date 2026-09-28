/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { TemplatesTable } from '../TemplatesTable';

function rec(o: Partial<TemplateRecord>): TemplateRecord {
  return {
    id: 'visao-geral', name: 'Visão Geral', description: 'd', category: 'Carteira',
    productRefs: ['credit'], blockMap: { a: {} as never, b: {} as never }, layout: [],
    metricRefs: ['m1'], status: 'active', ...o,
  };
}

describe('<TemplatesTable>', () => {
  const cbs = { onEditMeta: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };

  it('renderiza linhas com contagem de blocos', () => {
    render(<TemplatesTable rows={[rec({ id: 'a', name: 'A' }), rec({ id: 'b', name: 'B' })]} productNameById={{ credit: 'Credit' }} {...cbs} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  /*
   * O editor de template do admin acabou: o conteúdo de um template passou a
   * sair de uma PÁGINA ("Salvar como template" no menu da página), e esta
   * tabela ficou só com a governança do catálogo — metadados, status,
   * duplicar, excluir.
   */
  it('não oferece mais editor de conteúdo', () => {
    render(<TemplatesTable rows={[rec({ id: 'x', name: 'X' })]} productNameById={{ credit: 'Credit' }} {...cbs} />);
    expect(screen.queryByRole('button', { name: /abrir editor/i })).not.toBeInTheDocument();
  });

  it('chama onEditMeta ao clicar em editar metadados', () => {
    const onEditMeta = vi.fn();
    const r = rec({ id: 'x', name: 'X' });
    render(<TemplatesTable rows={[r]} productNameById={{ credit: 'Credit' }} {...cbs} onEditMeta={onEditMeta} />);
    fireEvent.click(screen.getByRole('button', { name: /editar metadados/i }));
    expect(onEditMeta).toHaveBeenCalledWith(r);
  });

  it('mostra estado vazio', () => {
    render(<TemplatesTable rows={[]} productNameById={{ credit: 'Credit' }} {...cbs} />);
    expect(screen.getByText('Nenhum template.')).toBeInTheDocument();
  });

  it('chama onDelete ao clicar em excluir', () => {
    const onDelete = vi.fn();
    const r = rec({ id: 'z', name: 'Z' });
    render(<TemplatesTable rows={[r]} productNameById={{ credit: 'Credit' }} {...cbs} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(onDelete).toHaveBeenCalledWith(r);
  });

  it('mostra nomes de produto a partir de productRefs', () => {
    render(<TemplatesTable rows={[rec({ id: 'a', name: 'A', productRefs: ['credit', 'covenants'] })]} productNameById={{ credit: 'Credit', covenants: 'Covenants' }} {...cbs} />);
    expect(screen.getByText(/Credit/)).toBeInTheDocument();
    expect(screen.getByText(/Covenants/)).toBeInTheDocument();
  });
});

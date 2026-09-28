/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { BlockInspector } from '../BlockInspector';

describe('<BlockInspector>', () => {
  it('edita label de KPI e dispara onChange', () => {
    const onChange = vi.fn();
    const block: CanvasBlock = { id: 'k', type: 'kpi', label: 'Antigo', value: '—', metricId: 'dashboard.x' };
    render(<BlockInspector block={block} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Novo' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ label: 'Novo' }));
  });

  it('edita dataKeys de chart como lista separada por vírgula', () => {
    const onChange = vi.fn();
    const block: CanvasBlock = { id: 'c', type: 'chart', chartType: 'bar', data: [], dataKeys: ['a'], xAxisKey: 'mes' };
    render(<BlockInspector block={block} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Data keys (vírgula)'), { target: { value: 'a, b' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dataKeys: ['a', 'b'] }));
  });

  /**
   * No relatório, `useReportData` renomeia as colunas da métrica (`bucket` /
   * `value`) para o `xAxisKey` e o `dataKeys[0]` do bloco. Editar esses campos
   * à mão só funciona enquanto casarem com o que a métrica devolve — quando
   * não casam, a série some sem dizer por quê. Por isso a amarração é visível,
   * mas não editável fora do editor de templates.
   */
  describe('bindingEditable=false (relatório)', () => {
    const chartWithMetric: CanvasBlock = {
      id: 'c', type: 'chart', chartType: 'bar', data: [], dataKeys: ['valor'],
      xAxisKey: 'mes', metricId: 'empreendimento.vgv',
    };

    it('trava os campos amarrados à métrica', () => {
      render(<BlockInspector block={chartWithMetric} onChange={vi.fn()} bindingEditable={false} />);
      expect(screen.getByLabelText('Eixo X (xAxisKey)')).toBeDisabled();
      expect(screen.getByLabelText('Data keys (vírgula)')).toBeDisabled();
      expect(screen.getByLabelText('Metric ID')).toBeDisabled();
    });

    it('mantém livre o que a métrica não define', () => {
      const onChange = vi.fn();
      render(<BlockInspector block={chartWithMetric} onChange={onChange} bindingEditable={false} />);
      expect(screen.getByLabelText('Título')).not.toBeDisabled();
      expect(screen.getByLabelText('Tipo de gráfico')).not.toBeDisabled();

      fireEvent.change(screen.getByLabelText('Tipo de gráfico'), { target: { value: 'line' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ chartType: 'line' }));
    });

    it('explica por que o campo está travado', () => {
      render(<BlockInspector block={chartWithMetric} onChange={vi.fn()} bindingEditable={false} />);
      expect(screen.getAllByText(/Definido pela métrica/i).length).toBeGreaterThan(0);
    });

    // Bloco sem métrica carrega os próprios dados: não há amarração a proteger.
    it('bloco sem métrica continua totalmente editável', () => {
      const unbound: CanvasBlock = { id: 'c2', type: 'chart', chartType: 'bar', data: [], dataKeys: ['a'], xAxisKey: 'mes' };
      render(<BlockInspector block={unbound} onChange={vi.fn()} bindingEditable={false} />);
      expect(screen.getByLabelText('Eixo X (xAxisKey)')).not.toBeDisabled();
    });
  });

  it('por padrão (editor de templates) a amarração é editável', () => {
    const block: CanvasBlock = {
      id: 'c', type: 'chart', chartType: 'bar', data: [], dataKeys: ['a'],
      xAxisKey: 'mes', metricId: 'dashboard.x',
    };
    render(<BlockInspector block={block} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Eixo X (xAxisKey)')).not.toBeDisabled();
  });

  it('edita conteúdo de texto', () => {
    const onChange = vi.fn();
    const block: CanvasBlock = { id: 't', type: 'text', content: 'oi' };
    render(<BlockInspector block={block} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Conteúdo (markdown)'), { target: { value: '## h2' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ content: '## h2' }));
  });

  // Medidor gravado em 2/6 que virou arco fica abaixo do mínimo do arco (3).
  // O select tem de mostrar a largura que o relatório desenha, não a 1ª opção.
  it('mostra a largura gravada mesmo abaixo do mínimo do contrato', () => {
    const block = {
      id: 'g', type: 'gauge', label: 'Inadimplência', value: 5, threshold: 10,
      display: 'arc', colSpan: 2,
    } as CanvasBlock;
    render(<BlockInspector block={block} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Largura (colSpan)')).toHaveValue('2');
  });
});

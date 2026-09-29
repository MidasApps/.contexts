import { describe, it, expect } from 'vitest';
import { reportPage } from './report-canvas';
import type { CanvasPage } from '@/shared/config/agents/types';

function page(id: string, block: string): CanvasPage {
  return {
    id,
    title: id,
    blockMap: { [block]: { id: block, type: 'text', content: id } as never },
    layout: [{ id: `row-${id}`, blockIds: [block] }],
  };
}

describe('reportPage', () => {
  it('acha a página do relatório pelo id', () => {
    const pages = [page('volumetria', 'b1')];
    expect(reportPage(pages, 'volumetria')?.blockMap.b1).toBeDefined();
  });

  /**
   * O caso que o `pages[0]` errava: a IA cria uma página nova durante a
   * conversa, ela entra no canvas, e salvar o relatório aberto gravava o
   * conteúdo da página errada.
   */
  it('ignora a posição — página nova no canvas não sequestra o save', () => {
    const pages = [page('nova-pela-ia', 'b0'), page('volumetria', 'b1')];
    expect(reportPage(pages, 'volumetria')?.id).toBe('volumetria');
  });

  it('sem correspondência não devolve página — melhor não gravar que gravar errado', () => {
    expect(reportPage([page('outra', 'b1')], 'volumetria')).toBeUndefined();
    expect(reportPage([], 'volumetria')).toBeUndefined();
  });
});

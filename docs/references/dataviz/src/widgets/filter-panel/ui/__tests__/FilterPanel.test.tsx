/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/shared/stores/app-store';

// O parâmetro precisa estar na assinatura: o mock é chamado com `opts` logo
// abaixo, e sem ele o TS infere uma função de zero argumentos.
const usePdfExportMock = vi.fn((_opts?: { title?: string }) => ({ exportPdf: vi.fn(), exporting: false }));
vi.mock('@/shared/hooks/usePdfExport', () => ({
  usePdfExport: (opts: { title?: string }) => usePdfExportMock(opts),
}));

/*
 * Repare no que NÃO está mockado: o `DataProvider`.
 *
 * Havia aqui um mock inteiro do `useDataFilters` porque o painel montava o eixo
 * do tempo. Ele migrou para a `PageToolbar`, e o que sobrou — testar como
 * usuário, modo debug e exportar PDF — lê a `app-store` e o `usePdfExport`, não
 * o contexto de datas. Todo teste deste arquivo renderiza o painel FORA de
 * qualquer `<DataProvider>`: é essa a prova de que a dependência morreu.
 */

import { FilterPanel } from '../FilterPanel';

/**
 * Bloco 3 (fix-final-review): o AppHeader monta <FiltersButton /> sem
 * pageTitle — antes da branch, os call sites de FilterPanel sempre
 * passavam o título real da página. Sem isso, usePdfExport caía no
 * default 'Dashboard' e todo PDF exportado passava a se chamar assim.
 * O PageHero registra o título corrente no app-store (currentPageTitle);
 * o FilterPanel lê esse fallback só quando pageTitle vem `undefined`
 * (não passado) — pageTitle="" explícito (uso do GlobalFilters dentro do
 * CanvasPanel, em /explore) continua caindo no default 'Dashboard' sem
 * tocar a store, porque ali não há PageHero nem título de página real.
 */
describe('FilterPanel — fallback de título do PDF (Bloco 3)', () => {
  beforeEach(() => {
    usePdfExportMock.mockClear();
    useAppStore.setState({ currentPageTitle: '' });
  });

  it('sem pageTitle (AppHeader → FiltersButton), usa o título registrado pelo PageHero na store', () => {
    useAppStore.setState({ currentPageTitle: 'Visão Geral' });
    render(<FilterPanel open={false} onClose={() => {}} />);
    expect(usePdfExportMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Visão Geral' }));
  });

  it('pageTitle explícito continua vencendo o título da store', () => {
    useAppStore.setState({ currentPageTitle: 'Visão Geral' });
    render(<FilterPanel open={false} onClose={() => {}} pageTitle="Relatório X" />);
    expect(usePdfExportMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Relatório X' }));
  });

  it('pageTitle="" explícito (GlobalFilters em /explore) não lê a store — cai no default "Dashboard"', () => {
    useAppStore.setState({ currentPageTitle: 'Visão Geral' });
    render(<FilterPanel open={false} onClose={() => {}} pageTitle="" />);
    expect(usePdfExportMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dashboard' }));
  });

  it('sem pageTitle e sem título registrado na store, cai no default "Dashboard"', () => {
    render(<FilterPanel open={false} onClose={() => {}} />);
    expect(usePdfExportMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dashboard' }));
  });
});

/**
 * O painel é quase todo token semântico, mas o contêiner tinha o fundo e a
 * sombra fixados em valores calibrados para o dark (`bg-[#080910]`,
 * `rgba(0,0,0,0.6)`). Cores hardcoded não respondem a [data-theme="light"],
 * então em light mode o conteúdo clareava e o painel continuava uma placa
 * quase preta — o defeito que o usuário reportou como "cores incompletas".
 */
describe('FilterPanel — superfície responde ao tema', () => {
  it('o contêiner do painel não fixa cor nem sombra em valor literal', () => {
    const { container } = render(<FilterPanel open onClose={() => {}} />);
    const panel = container.querySelector('.fixed.right-0');
    expect(panel).not.toBeNull();

    const classes = panel!.className;
    expect(classes).not.toMatch(/bg-\[#/);
    expect(classes).not.toMatch(/shadow-\[[^\]]*rgba/);
  });

  it('o contêiner usa o token de superfície do tema', () => {
    const { container } = render(<FilterPanel open onClose={() => {}} />);
    const panel = container.querySelector('.fixed.right-0');
    expect(panel!.className).toMatch(/\bbg-background\b/);
  });
});

/**
 * O painel carregava sete controles que não filtravam nada: Empreendimentos e
 * seis faixas de carteira com as opções escritas à mão no código. Nenhum
 * chegava à consulta — o catálogo em produção não tem uma métrica que aplique
 * filtro ambiente. Ficar de olho aqui evita que voltem por hábito.
 */
describe('FilterPanel — só o que vale para a página inteira', () => {
  it('não oferece filtro de carteira nem de empreendimento', () => {
    render(<FilterPanel open onClose={() => {}} />);

    for (const label of ['Empreendimentos', 'Rating', 'Elegibilidade', 'Faixa LTV', 'Faixa de Atraso', 'Tipo Proponente', 'Grupo Repasse']) {
      expect(screen.queryByText(label), label).toBeNull();
    }
  });

  /*
   * O eixo do tempo saiu daqui para a barra da página (`PageToolbar`): período,
   * modo e comparação respondem à mesma pergunta — "que recorte estou vendo?" —
   * e escondê-los atrás de um botão obrigava a abrir um painel para entender o
   * que já estava desenhado na tela. Duplicá-los nos dois lugares seria pior:
   * dois controles para o mesmo estado, e nenhum deles obviamente o principal.
   */
  it('não repete o eixo do tempo, que agora vive na barra da página', () => {
    render(<FilterPanel open onClose={() => {}} />);

    for (const label of ['Modo de visualização', 'Período analisado', 'Comparar períodos']) {
      expect(screen.queryByText(label), label).toBeNull();
    }
  });

  it('mantém o que não é filtro de página', () => {
    render(<FilterPanel open onClose={() => {}} />);

    for (const label of ['Testar como usuário', 'Modo debug']) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });
});

/*
 * Os listeners de Esc e clique-fora são registrados uma vez por abertura, mas
 * precisam chamar o `onClose` da última renderização — o pai pode trocar o
 * callback com o painel aberto.
 */
describe('FilterPanel — fechar chama o onClose mais recente', () => {
  it('Esc depois de o pai trocar o onClose chama o novo, não o antigo', () => {
    const old = vi.fn();
    const newValue = vi.fn();
    const { rerender } = render(<FilterPanel open onClose={old} />);
    rerender(<FilterPanel open onClose={newValue} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(newValue).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
  });

  it('clique fora do painel fecha com o onClose mais recente', () => {
    const old = vi.fn();
    const newValue = vi.fn();
    const { rerender } = render(<FilterPanel open onClose={old} />);
    rerender(<FilterPanel open onClose={newValue} />);

    fireEvent.mouseDown(document.body);

    expect(newValue).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
  });

  it('fechado, Esc não chama nada', () => {
    const onClose = vi.fn();
    render(<FilterPanel open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

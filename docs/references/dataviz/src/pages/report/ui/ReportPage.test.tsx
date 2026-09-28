/* @vitest-environment happy-dom */
/**
 * O ciclo "criar bloco → ver número" do relatório.
 *
 * Três defeitos vivem aqui e se explicam pela mesma fronteira — configuração
 * (o que o documento descreve) × dado materializado (o que a métrica devolve a
 * cada carga, ADR-0015):
 *
 * - F6: o bloco que a IA acabou de criar vive só no canvas-store, e a busca de
 *   dados era alimentada apenas pelo documento do Firestore. O `metricId` novo
 *   nunca entrava no batch: KPI com "—" ao lado dos antigos preenchidos.
 * - F10: Salvar gravava o `blockMap` do canvas verbatim, com `value`/`data[]`/
 *   `rows[]` dentro do documento de CONFIGURAÇÃO.
 * - F15: sem a página no canvas, Salvar não gravava e não avisava ninguém.
 *
 * O canvas-store é REAL nestes testes — é ele o segundo lado do ciclo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, configure } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CanvasBlock, CanvasPage } from '@/shared/config/agents/types';
import type { Report } from '@/shared/lib/firestore/reports';
import { useCanvasStore } from '@/shared/stores/canvas-store';

/** Como cada bloco aparece na tela — o suficiente para ver "—" virar número. */
const ui = vi.hoisted(() => ({
  summarize: (block: Record<string, unknown>): string => {
    if (block.type === 'kpi') return String(block.value ?? '—');
    if (block.type === 'chart') {
      const data = block.data as unknown[] | undefined;
      return data?.length ? `${data.length} pontos` : 'Sem dados para exibir';
    }
    if (block.type === 'table') {
      const rows = block.rows as unknown[] | undefined;
      return rows?.length ? `${rows.length} linhas` : 'Tabela vazia';
    }
    return String(block.type);
  },
}));

// ── Roteamento e contexto do app ──

// Mutável para exercer a troca de página sem remontar (App Router não remonta).
const route = vi.hoisted(() => ({ groupId: 'g1', reportId: 'r1', search: '' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: route.groupId, reportId: route.reportId }),
  useSearchParams: () => new URLSearchParams(route.search),
}));

const appStore = vi.hoisted(() => ({
  activeClientId: 'vila-rosa',
  setActiveReport: vi.fn(),
  setEditingReport: vi.fn(),
  setPageTrail: vi.fn(),
}));
vi.mock('@/shared/stores/app-store', () => {
  const useAppStore = (selector?: (s: typeof appStore) => unknown) =>
    selector ? selector(appStore) : appStore;
  useAppStore.getState = () => appStore;
  return { useAppStore };
});

vi.mock('@/shared/hooks/useGroups', () => ({ useGroups: () => ({ groups: [] }) }));
vi.mock('@/shared/hooks/useReports', () => ({ useReports: () => ({ reports: [] }) }));

const firestore = vi.hoisted(() => ({
  getReport: vi.fn(),
  updateReport: vi.fn(),
}));
vi.mock('@/shared/lib/firestore/reports', () => firestore);

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

// ── Dependências de `useReportData` (o hook em si é o real) ──

vi.mock('@/shared/hooks/useActiveClient', () => ({ useActiveDataset: () => 'proj.dataset' }));
vi.mock('@/shared/hooks/useActiveProduct', () => ({ useActiveProduct: () => ({ id: 'credito' }) }));

const FILTERS = {
  dataBase: '2026-06-30',
  dateRange: { start: '2025-06-30', end: '2026-06-30' },
  projetos: [] as string[],
  projeto: '' as string | string[],
  advancedFilters: {
    ratings: [] as string[], elegibilidade: [] as string[], faixaLtv: [] as string[],
    faixaAtraso: [] as string[], tipoProponente: [] as string[], gruposRepasse: [] as string[],
  },
};
vi.mock('@/shared/providers/DataProvider', () => ({ useDataFilters: () => FILTERS }));
vi.mock('@/shared/lib/external-token', () => ({ getExternalToken: () => 'tok-test' }));
vi.mock('@/shared/lib/firebase/config', () => ({ getFirebaseAuth: () => ({ currentUser: null }) }));

// ── Superfície de render (leve, mas fiel a QUEM lê o quê) ──

vi.mock('@/widgets/page-filter-bar', () => ({ PageFilterBar: () => null }));

vi.mock('@/shared/ui/scroll-area', async () => {
  const React = await import('react');
  return {
    ScrollArea: ({ children }: { children?: ReactNode }) =>
      React.createElement('div', null, children),
  };
});

/** Leitura: desenha do `blockMap` resolvido pela página. */
vi.mock('@/pages/explore/ui/CanvasBlockRenderer', async () => {
  const React = await import('react');
  return {
    CanvasBlockRenderer: ({ block }: { block: CanvasBlock }) =>
      React.createElement(
        'div',
        { 'data-testid': `leitura-${block.id}` },
        ui.summarize(block as unknown as Record<string, unknown>),
      ),
  };
});

/** Edição: desenha do canvas-store — é por aqui que o bloco novo aparece. */
vi.mock('@/pages/explore/ui/CanvasPanel', async () => {
  const React = await import('react');
  const { useCanvasStore: store } = await import('@/shared/stores/canvas-store');
  return {
    CanvasPanel: () => {
      const pages = store((s) => s.pages);
      const page = pages.find((p) => p.id === 'r1');
      return React.createElement(
        'div',
        { 'data-testid': 'canvas' },
        Object.values(page?.blockMap ?? {}).map((b) =>
          React.createElement(
            'div',
            { key: b.id, 'data-testid': `canvas-${b.id}` },
            ui.summarize(b as unknown as Record<string, unknown>),
          ),
        ),
      );
    },
  };
});

import { ReportPage } from './ReportPage';

// ── Fixtures ──

const VALUE_BY_METRIC: Record<string, number> = {
  'carteira.saldo': 111,
  'carteira.novo': 222,
};

function kpi(id: string, metricId: string, label: string): CanvasBlock {
  return { id, type: 'kpi', metricId, label, format: 'number', colSpan: 2 } as unknown as CanvasBlock;
}

function report(): Report {
  return {
    id: 'r1',
    name: 'Visão Executiva',
    order: 0,
    productRefs: ['credito'],
    blockMap: { k1: kpi('k1', 'carteira.saldo', 'Saldo devedor') },
    layout: [{ id: 'linha-1', blockIds: ['k1'] }],
  };
}

/** Os `metricIds` de cada POST em /api/metrics/batch, na ordem das chamadas. */
function requestedMetrics(fetchMock: ReturnType<typeof vi.fn>): string[][] {
  return fetchMock.mock.calls.map(
    (call) => JSON.parse((call[1] as { body: string }).body).metricIds as string[],
  );
}

/**
 * Deixa efeitos, promessas e escritas de store assentarem — contando TURNOS,
 * não milissegundos.
 *
 * A cadeia desta página é longa (getReport → import dinâmico do token → fetch →
 * json → estado → efeito → escrita no store → efeito), e a suíte roda 262
 * arquivos em paralelo: sob carga, um `sleep` de 50ms não cobre a cadeia e o
 * teste falha por relógio, não por defeito. Cada turno aqui é uma volta
 * completa de microtasks + macrotask, que acontece independentemente de quão
 * lenta a máquina esteja.
 */
async function settle(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/*
 * Orçamento de espera desta suíte.
 *
 * O default do RTL (1s por `waitFor`) e o do Vitest (5s por teste) foram
 * medidos com a suíte inteira: nas execuções em que ela leva ~110s em vez de
 * ~60s, tudo que espera cadeia assíncrona longa estoura o teto — aqui e em
 * arquivos que não são meus. O teto largo não esconde defeito (o teste continua
 * falhando se o estado final não chegar), só para de reprovar por carga.
 */
configure({ asyncUtilTimeout: 4_000 });
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

describe('ReportPage — dado ao vivo no canvas e save limpo', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    route.groupId = 'g1';
    route.reportId = 'r1';
    route.search = '';
    useCanvasStore.getState().reset();
    firestore.getReport.mockResolvedValue(report());
    firestore.updateReport.mockResolvedValue(undefined);
    fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { metricIds: string[] };
      const results: Record<string, unknown> = {};
      for (const id of body.metricIds) {
        results[id] = { ok: true, metricId: id, data: [{ value: VALUE_BY_METRIC[id] ?? 0 }] };
      }
      return { ok: true, json: async () => ({ results }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Estado de partida de quase todo teste: relatório aberto, número na tela. */
  let rerenderPage: () => void = () => {};
  async function openReport() {
    const view = render(<ReportPage />);
    rerenderPage = () => view.rerender(<ReportPage />);
    await waitFor(() => expect(screen.getByTestId('leitura-k1')).toHaveTextContent('111'));
    return view;
  }

  describe('troca de página e releitura do documento', () => {
    /**
     * O defeito: trocar de página rápido disparava dois `getReport`. Se o da
     * página anterior respondesse por último, ele virava o `report` da tela —
     * a página nova abria com o conteúdo (e a trilha) da antiga.
     */
    it('keeps the report of the current page when the old read lands last', async () => {
      const pending: Array<{ reportId: string; resolve: (r: Report) => void }> = [];
      firestore.getReport.mockImplementation(
        (_c: string, _g: string, reportId: string) =>
          new Promise<Report>((resolve) => { pending.push({ reportId, resolve }); }),
      );
      const { rerender } = render(<ReportPage />);
      await waitFor(() => expect(pending).toHaveLength(1));

      route.reportId = 'r2';
      rerender(<ReportPage />);
      await waitFor(() => expect(pending).toHaveLength(2));
      expect(pending.map((p) => p.reportId)).toEqual(['r1', 'r2']);

      await act(async () => pending[1].resolve({ ...report(), id: 'r2', name: 'Página B' }));
      await act(async () => pending[0].resolve({ ...report(), id: 'r1', name: 'Página A' }));
      await settle();

      expect(appStore.setPageTrail).toHaveBeenLastCalledWith('', 'Página B');
      expect(appStore.setPageTrail).not.toHaveBeenCalledWith('', 'Página A');
    });

    /**
     * O defeito: enquanto a página B carregava, `report` ainda era a A. Chegar
     * em B com `?edit=1` (navegação no cliente, sem remontar) disparava a
     * edição automática com A — `originalReport` virava A, e Cancelar punha o
     * documento de A na tela de B.
     */
    it('opening page B with ?edit=1 from page A edits B, never A', async () => {
      await openReport();
      expect(appStore.setPageTrail).toHaveBeenLastCalledWith('', 'Visão Executiva');

      let deliverB!: (r: Report) => void;
      firestore.getReport.mockImplementation(
        () => new Promise<Report>((resolve) => { deliverB = resolve; }),
      );
      appStore.setPageTrail.mockClear();
      route.reportId = 'r2';
      route.search = 'edit=1';
      rerenderPage();
      await settle();

      await act(async () => deliverB({
        ...report(),
        id: 'r2',
        name: 'Página B',
        blockMap: { kb: kpi('kb', 'carteira.novo', 'Inadimplência') },
        layout: [{ id: 'linha-1', blockIds: ['kb'] }],
      }));
      await settle();
      expect(appStore.setEditingReport).toHaveBeenCalledWith(true);

      // Sem mexer em nada, cancelar não pergunta — o original é o próprio B.
      fireEvent.click(screen.getByText('Cancelar'));
      expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument();
      await settle();

      expect(appStore.setPageTrail).not.toHaveBeenCalledWith('', 'Visão Executiva');
      expect(appStore.setPageTrail).toHaveBeenLastCalledWith('', 'Página B');
    });

    it('re-reads the report when the assistant changes this page\'s filters', async () => {
      await openReport();
      const readsBefore = firestore.getReport.mock.calls.length;

      act(() => {
        window.dispatchEvent(new CustomEvent('report-filters-changed', {
          detail: { groupId: 'g1', reportId: 'r1' },
        }));
      });
      await waitFor(() => expect(firestore.getReport.mock.calls.length).toBe(readsBefore + 1));

      // Evento de OUTRA página não relê esta.
      act(() => {
        window.dispatchEvent(new CustomEvent('report-filters-changed', {
          detail: { groupId: 'g1', reportId: 'outra' },
        }));
      });
      await settle();
      expect(firestore.getReport.mock.calls.length).toBe(readsBefore + 1);
    });
  });

  describe('F6 — o bloco que a IA acabou de criar busca o próprio dado', () => {
    it('inclui o metricId do bloco novo no batch e devolve o valor ao canvas', async () => {
      await openReport();
      expect(requestedMetrics(fetchMock)).toEqual([['carteira.saldo']]);

      // A IA cria o bloco: escreve no canvas-store, não no documento.
      act(() => {
        useCanvasStore.getState().addBlock(0, kpi('k2', 'carteira.novo', 'Inadimplência'));
      });

      // A alteração de conteúdo abre a edição — e agora o canvas alimenta a busca.
      await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
      await waitFor(() =>
        expect(requestedMetrics(fetchMock).at(-1)).toEqual(
          expect.arrayContaining(['carteira.saldo', 'carteira.novo']),
        ),
      );

      // O valor tem de VOLTAR para o bloco na tela: em edição quem desenha é o
      // CanvasPanel, que lê o store.
      await waitFor(() => expect(screen.getByTestId('canvas-k2')).toHaveTextContent('222'));
      expect(screen.getByTestId('canvas-k1')).toHaveTextContent('111');
      expect(
        (useCanvasStore.getState().pages[0].blockMap.k2 as { value?: string }).value,
      ).toBe('222');
    });

    /**
     * O laço que este desenho precisa evitar: store muda → hook recalcula →
     * escreve no store → store muda. A âncora é a ASSINATURA DA CONFIGURAÇÃO —
     * devolver dado ao bloco não mexe nela, então nada se realimenta.
     */
    it('não realimenta: busca e escritas no store param depois que o dado chega', async () => {
      await openReport();

      let storeWrites = 0;
      const unsubscribe = useCanvasStore.subscribe(() => {
        storeWrites += 1;
      });

      act(() => {
        useCanvasStore.getState().addBlock(0, kpi('k2', 'carteira.novo', 'Inadimplência'));
      });
      await waitFor(() => expect(screen.getByTestId('canvas-k2')).toHaveTextContent('222'));
      await settle();

      const fetchesAfterSettle = fetchMock.mock.calls.length;
      const writesAfterSettle = storeWrites;

      await settle();
      await settle();

      expect(fetchMock.mock.calls.length).toBe(fetchesAfterSettle);
      expect(storeWrites).toBe(writesAfterSettle);
      // Duas buscas no total: a do documento e a que o bloco novo provocou.
      expect(fetchesAfterSettle).toBe(2);
      unsubscribe();
    });

    it('mesmo com a edição já aberta pelo usuário, o bloco novo busca seu dado', async () => {
      await openReport();
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

      act(() => {
        useCanvasStore.getState().addBlock(0, kpi('k2', 'carteira.novo', 'Inadimplência'));
      });

      await waitFor(() => expect(screen.getByTestId('canvas-k2')).toHaveTextContent('222'));
    });

    it('dado que chega não conta como alteração: sozinho não abre a edição', async () => {
      await openReport();
      await settle();
      // Fora da edição não há CanvasPanel — se o valor devolvido ao canvas
      // contasse como "a IA mexeu", a página teria entrado em edição sozinha.
      expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    });
  });

  describe('F10 — Salvar grava configuração, não o dado', () => {
    it('tira value/data/rows/slices do que vai para o Firestore', async () => {
      await openReport();
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
      // O canvas está materializado — é exatamente esse mapa que era gravado.
      await waitFor(() => expect(screen.getByTestId('canvas-k1')).toHaveTextContent('111'));

      const page = useCanvasStore.getState().pages.find((p) => p.id === 'r1') as CanvasPage;
      act(() => {
        useCanvasStore.getState().addBlock(0, {
          ...(kpi('k2', 'carteira.novo', 'Inadimplência') as unknown as Record<string, unknown>),
        } as unknown as CanvasBlock);
      });
      expect(page).toBeDefined();

      await waitFor(() => expect(screen.getByTestId('canvas-k2')).toHaveTextContent('222'));

      fireEvent.click(screen.getByText('Salvar'));
      await waitFor(() => expect(firestore.updateReport).toHaveBeenCalled());

      const [, , , savedBlockMap] = firestore.updateReport.mock.calls[0];
      const saved = savedBlockMap as Record<string, Record<string, unknown>>;
      expect(Object.keys(saved).sort()).toEqual(['k1', 'k2']);
      for (const block of Object.values(saved)) {
        expect(block).not.toHaveProperty('value');
      }
      // ...e a configuração continua inteira.
      expect(saved.k2).toMatchObject({
        id: 'k2', type: 'kpi', metricId: 'carteira.novo', label: 'Inadimplência', colSpan: 2,
      });
    });

    it('gráfico e tabela também vão sem data[]/rows[]', async () => {
      firestore.getReport.mockResolvedValue({
        ...report(),
        blockMap: {
          c1: {
            id: 'c1', type: 'chart', metricId: 'carteira.saldo', chartType: 'line',
            xAxisKey: 'bucket', dataKeys: ['value'],
          },
          t1: {
            id: 't1', type: 'table', metricId: 'carteira.saldo', title: 'Contratos',
            columns: [{ header: 'Valor', accessorKey: 'value' }],
          },
        },
        layout: [{ id: 'linha-1', blockIds: ['c1', 't1'] }],
      } as unknown as Report);

      render(<ReportPage />);
      await waitFor(() => expect(screen.getByTestId('leitura-c1')).toHaveTextContent('1 pontos'));

      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByTestId('canvas-t1')).toHaveTextContent('1 linhas'));

      fireEvent.click(screen.getByText('Salvar'));
      await waitFor(() => expect(firestore.updateReport).toHaveBeenCalled());

      const saved = firestore.updateReport.mock.calls[0][3] as Record<string, Record<string, unknown>>;
      expect(saved.c1).not.toHaveProperty('data');
      expect(saved.c1).toMatchObject({ xAxisKey: 'bucket', dataKeys: ['value'] });
      expect(saved.t1).not.toHaveProperty('rows');
      expect(saved.t1).toMatchObject({ columns: [{ header: 'Valor', accessorKey: 'value' }] });
    });

    /**
     * Efeito colateral de gravar só configuração: o canvas passa a carregar
     * dado que o documento não tem. Comparar os dois cruamente acusaria
     * alteração em toda edição — e o usuário levaria "Descartar alterações?"
     * sem ter mexido em nada.
     */
    it('cancelar sem ter mexido em nada não pergunta nada', async () => {
      await openReport();
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByTestId('canvas-k1')).toHaveTextContent('111'));

      fireEvent.click(screen.getByText('Cancelar'));

      expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Editando')).not.toBeInTheDocument());
    });

    /**
     * Descartar tem de descartar. O efeito de carga repõe o canvas a partir do
     * documento, mas o de detecção roda no MESMO passo, ainda com o rascunho do
     * render anterior: sem repor o canvas dentro do próprio `confirmCancel`, o
     * bloco recusado reabria a edição logo em seguida.
     */
    it('descartar um bloco que a IA criou não reabre a edição', async () => {
      await openReport();
      act(() => {
        useCanvasStore.getState().addBlock(0, kpi('k2', 'carteira.novo', 'Inadimplência'));
      });
      await waitFor(() => expect(screen.getByTestId('canvas-k2')).toHaveTextContent('222'));

      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Descartar'));

      // Espera o ESTADO FINAL observável: o relatório de volta em leitura, com
      // o bloco original preenchido pela busca que o descarte provocou. Só aí
      // faz sentido perguntar se a edição reabriu.
      await waitFor(() => expect(screen.getByTestId('leitura-k1')).toHaveTextContent('111'));
      await settle();

      expect(screen.queryByText('Editando')).not.toBeInTheDocument();
      expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
      expect(screen.queryByTestId('leitura-k2')).not.toBeInTheDocument();
      expect(useCanvasStore.getState().pages[0].blockMap).not.toHaveProperty('k2');
    });

    it('depois de salvar não reabre a edição sozinho', async () => {
      await openReport();
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Salvar'));
      await waitFor(() => expect(firestore.updateReport).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByTestId('leitura-k1')).toBeInTheDocument());
      await settle();

      expect(screen.queryByText('Editando')).not.toBeInTheDocument();
      expect(screen.getByTestId('leitura-k1')).toHaveTextContent('111');
    });
  });

  /**
   * A grade da leitura é a mesma da edição.
   *
   * A leitura abria uma grade POR LINHA de `layout`, e cada linha virava um
   * corte rígido; a edição põe tudo numa grade só e deixa os blocos se
   * encaixarem na ordem. Enquanto toda linha somava 6 as duas coincidiam —
   * bastou estreitar um bloco para abrirem, e o desenho errado só aparecia
   * depois de salvar.
   *
   * A forma abaixo é a da página que denunciou o defeito (`plano-empresario`):
   * linhas gravadas `[k1]`, `[k2, k3]`, `[k4]`, todos com 3 colunas. Em linha
   * fixa isso desenha 3+vão / 3+3 / 3+vão; encaixando, 3+3 / 3+3.
   */
  describe('a leitura desenha a MESMA grade da edição', () => {
    const inFourBlocks = (): Report => ({
      id: 'r1',
      name: 'Plano Empresário',
      order: 0,
      productRefs: ['credito'],
      blockMap: {
        k1: { ...kpi('k1', 'carteira.saldo', 'Dívida atual'), colSpan: 3 } as CanvasBlock,
        k2: { ...kpi('k2', 'carteira.saldo', 'Contratado'), colSpan: 3 } as CanvasBlock,
        k3: { ...kpi('k3', 'carteira.saldo', 'Valor'), colSpan: 3 } as CanvasBlock,
        k4: { ...kpi('k4', 'carteira.saldo', 'Limite'), colSpan: 3 } as CanvasBlock,
      },
      layout: [
        { id: 'l1', blockIds: ['k1'] },
        { id: 'l2', blockIds: ['k2', 'k3'] },
        { id: 'l3', blockIds: ['k4'] },
      ],
    });

    /** A célula do grid é o pai do que o renderizador desenhou. */
    const cell = (id: string) => screen.getByTestId(`leitura-${id}`).parentElement;

    it('põe todos os blocos numa grade só, na ordem do layout', async () => {
      firestore.getReport.mockResolvedValue(inFourBlocks());
      const { container } = render(<ReportPage />);
      await waitFor(() => expect(screen.getByTestId('leitura-k4')).toBeInTheDocument());

      // Uma grade — não uma por linha gravada.
      expect(container.querySelectorAll('.grid')).toHaveLength(1);

      // E os quatro blocos moram nela, lado a lado, na ordem do `layout`.
      const grade = cell('k1')?.parentElement;
      for (const id of ['k2', 'k3', 'k4']) expect(cell(id)?.parentElement).toBe(grade);
      expect(
        Array.from(grade?.children ?? []).map((c) => c.firstElementChild?.getAttribute('data-testid')),
      ).toEqual(['leitura-k1', 'leitura-k2', 'leitura-k3', 'leitura-k4']);
    });

    it('respeita a largura declarada — não estica para fechar a linha', async () => {
      firestore.getReport.mockResolvedValue(inFourBlocks());
      render(<ReportPage />);
      await waitFor(() => expect(screen.getByTestId('leitura-k4')).toBeInTheDocument());

      // `k1` e `k4` estavam sozinhos na linha gravada e eram esticados até o
      // teto do tipo. Largura de bloco é declaração de quem edita: a régua do
      // trilho mostraria 3/6 enquanto a leitura desenhava outra coisa.
      for (const id of ['k1', 'k2', 'k3', 'k4']) {
        expect(cell(id)?.style.gridColumn).toBe('span 3');
      }
    });
  });

  describe('F15 — Salvar sem página no canvas avisa em vez de sumir', () => {
    it('não grava, avisa o usuário e mantém a edição aberta', async () => {
      await openReport();
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

      // O canvas passa a ter outra página (o assistente trocou de contexto):
      // `reportPage` não acha este relatório.
      act(() => {
        useCanvasStore.getState().loadPages([
          { id: 'outra', title: 'Outra', blockMap: {}, layout: [] },
        ]);
      });

      fireEvent.click(screen.getByText('Salvar'));
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());

      expect(firestore.updateReport).not.toHaveBeenCalled();
      expect(String(toastMock.error.mock.calls[0][0])).toContain('Não foi possível salvar');
      // O rascunho não pode sumir junto com o clique.
      expect(screen.getByText('Editando')).toBeInTheDocument();
    });

    it('falha do PATCH também chega ao usuário, sem sair da edição', async () => {
      firestore.updateReport.mockRejectedValue(new Error('Failed to update report'));
      await openReport();
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Salvar'));
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());

      expect(String(toastMock.error.mock.calls[0][0])).toContain('Failed to update report');
      expect(screen.getByText('Editando')).toBeInTheDocument();
    });
  });
});

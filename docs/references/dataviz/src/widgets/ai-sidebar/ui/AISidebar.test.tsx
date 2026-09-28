/* @vitest-environment happy-dom */
/**
 * Frente C — task 3: o AISidebar precisa plumbar o `clientId` real
 * (`clients/{id}`, slug om/brz/...) no body dos dois endpoints de chat,
 * separado do `dataset` (escopo BigQuery). Este teste captura o body
 * enviado via `sendMessage` e afirma que `clientId` === activeClientId.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Sem usuário autenticado o carregamento de histórico encerra sem buscar nada,
// e a conversa abre vazia — que é o estado exercido pela maioria destes testes.
// Mockado para não depender do módulo real do Firebase nem de rede; um teste
// troca `currentUser` para exercer a busca de histórico em voo.
const auth = vi.hoisted(() => ({
  currentUser: null as null | { getIdToken: () => Promise<string> },
}));
vi.mock('@/shared/lib/firebase/config', () => ({
  getFirebaseAuth: () => ({ currentUser: auth.currentUser }),
}));

// O histórico do usuário vem da coleção `conversations`. `loading` controlado
// para exercer o intervalo em que ainda não se sabe se há conversa anterior;
// `list` alimenta a tela de histórico, por onde se abre conversa antiga.
const convs = vi.hoisted(() => ({
  loading: false,
  list: [] as Array<Record<string, unknown>>,
}));
// Funções estáveis entre renders: elas entram em array de dependência de efeito,
// e recriá-las a cada render faria os efeitos rodarem sem parar.
const convFns = vi.hoisted(() => ({
  create: vi.fn(async () => 'c1' as string | null),
  // Assinatura declarada: é por `mock.calls` que se inspeciona o que foi
  // GRAVADO, e sem os parâmetros tipados o tuple de chamada nasce vazio.
  save: vi.fn(async (_id: string, _data: { messages: Array<{ parts: unknown[] }> }) => {}),
  load: vi.fn(async (_id: string) => null as null | { messages: unknown[] }),
  remove: vi.fn(async () => {}),
  pin: vi.fn(async () => {}),
}));
vi.mock('@/shared/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: convs.list,
    loading: convs.loading,
    create: convFns.create,
    save: convFns.save,
    load: convFns.load,
    remove: convFns.remove,
    pin: convFns.pin,
  }),
}));

// ── Capture do body enviado pelo chat transport ──
const sendMessageMock = vi.fn();

/**
 * `useChat` de verdade guarda as mensagens; o mock antigo devolvia sempre `[]` e
 * nem expunha `setMessages`, então nenhum teste conseguia exercer o que acontece
 * DEPOIS de as mensagens existirem — que é onde vivem os defeitos de aplicação
 * de tool no canvas. Aqui o estado é real (`useState`) e o teste ganha duas
 * alavancas: `chat.emitir` injeta mensagem como se tivesse chegado pelo stream,
 * e `chat.status` controla o fim do turno.
 */
const chat = vi.hoisted(() => ({
  status: 'ready' as string,
  emit: null as null | ((msgs: unknown[]) => void),
}));

vi.mock('@ai-sdk/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    useChat: () => {
      const [messages, setMessages] = React.useState<unknown[]>([]);
      chat.emit = setMessages as (msgs: unknown[]) => void;
      return { messages, sendMessage: sendMessageMock, status: chat.status, setMessages };
    },
  };
});

// A sidebar grava no Firestore a página que a IA montou — borda externa.
const updateReportMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/shared/lib/firestore/reports', () => ({
  updateReport: (...args: unknown[]) => updateReportMock(...(args as [])),
}));

// `DefaultChatTransport` só é instanciado (não exercido) no teste.
vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(public opts: unknown) {}
  },
}));

// react-markdown / remark-gfm são pesados e irrelevantes aqui.
vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => children }));
vi.mock('remark-gfm', () => ({ default: () => {} }));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  // A sidebar navega até a página que a IA cria (`report_page_created`).
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));

// Estado fake do app-store; `clientId` ativo distinto do dataset.
const ACTIVE_CLIENT_ID = 'om';
const fakeStoreState = {
  activeClientId: ACTIVE_CLIENT_ID,
  buildAIContext: () => 'ctx',
  currentThreadId: null,
  setCurrentThreadId: vi.fn(),
  currentPersonaId: 'cfo-securitizadora',
  currentIcpId: null,
  featureFlags: { useImprovedSupervisor: false, useVertexPromptCache: false },
  bumpReportsList: vi.fn(),
  setActiveReport: vi.fn(),
  // Relatório (`groups`) criado pela IA: sem o bump, `useGroups` só refaz o
  // fetch quando o cliente ativo muda — o seletor ficaria sem ele até o reload.
  bumpGroupsList: vi.fn(),
  setActiveGroup: vi.fn(),
};

vi.mock('@/shared/stores/app-store', () => {
  const useAppStore = (selector?: (s: typeof fakeStoreState) => unknown) =>
    selector ? selector(fakeStoreState) : fakeStoreState;
  useAppStore.getState = () => fakeStoreState;
  return { useAppStore };
});

/**
 * Canvas-store com estado de verdade: `createPage` cria página com id próprio e
 * a torna ativa, como o store real. Sem isso não dá para exercer o que acontece
 * quando o store é SUBSTITUÍDO no meio do turno (`loadPages`), que é o defeito
 * de gravação no documento errado.
 */
const canvas = vi.hoisted(() => {
  const state = {
    pages: [] as Array<{ id: string; title: string; blockMap: Record<string, unknown>; layout: unknown[] }>,
    activePage: 0,
    selectedBlockIds: [] as string[],
    clearSelection: vi.fn(),
    getPagesContext: () => [],
    addBlock: vi.fn(),
    removeBlock: vi.fn(),
    moveBlock: vi.fn(),
    updateBlockContent: vi.fn(),
    createPage: vi.fn((title: string) => {
      state.pages = [
        ...state.pages,
        { id: `pg-${state.pages.length + 1}`, title, blockMap: {}, layout: [] },
      ];
      state.activePage = state.pages.length - 1;
      return state.activePage;
    }),
  };
  return state;
});

vi.mock('@/shared/stores/canvas-store', () => {
  // Honra o seletor, como o zustand de verdade: o `SelectedBlocksChip` lê a
  // seleção por `useCanvasStore(s => s.selectedBlockIds)`, e um fake que
  // devolvesse sempre `{}` entregaria o objeto inteiro no lugar do campo.
  const useCanvasStore = (selector?: (s: typeof canvas) => unknown) =>
    (selector ? selector(canvas) : canvas);
  useCanvasStore.getState = () => canvas;
  return { useCanvasStore };
});

// dataset (escopo BQ) — propositalmente DIFERENTE do clientId para garantir
// que o componente não confunde os dois.
vi.mock('@/shared/hooks/useActiveClient', () => ({
  useActiveDataset: () => 'projeto.om_dataset',
}));

// Filtros controláveis por teste: o período de comparação precisa mudar entre
// renders para exercer o body montado com o valor corrente. Objeto novo a cada
// chamada, como o provider de verdade faz quando algum filtro muda.
const filterState = vi.hoisted(() => ({
  compareEnabled: false,
  comparePeriod: undefined as undefined | { start: string; end: string },
}));
vi.mock('@/shared/providers/DataProvider', () => ({
  useDataFilters: () => ({
    dateRange: { start: '2026-01-01', end: '2026-02-01' },
    projetos: [],
    advancedFilters: {
      ratings: [], elegibilidade: [], faixaLtv: [],
      faixaAtraso: [], tipoProponente: [], gruposRepasse: [],
    },
    compareEnabled: filterState.compareEnabled,
    comparePeriod: filterState.comparePeriod,
    viewMode: 'snapshot',
  }),
}));

import { AISidebar } from './AISidebar';

function lastBody() {
  expect(sendMessageMock).toHaveBeenCalled();
  const call = sendMessageMock.mock.calls[sendMessageMock.mock.calls.length - 1];
  return (call[1] as { body: Record<string, unknown> }).body;
}

/** Estado limpo entre testes — o canvas e o chat são compartilhados por hoisting. */
function resetEnvironment() {
  sendMessageMock.mockReset();
  auth.currentUser = null;
  convs.loading = false;
  convs.list = [];
  convFns.load.mockResolvedValue(null);
  convFns.create.mockResolvedValue('c1');
  chat.status = 'ready';
  chat.emit = null;
  canvas.pages = [];
  canvas.activePage = 0;
  canvas.addBlock.mockClear();
  canvas.createPage.mockClear();
  updateReportMock.mockClear();
  updateReportMock.mockResolvedValue(undefined);
  routerPush.mockClear();
  filterState.compareEnabled = false;
  filterState.comparePeriod = undefined;
}

/** Turno de autoria: assistente com texto e um `add_kpi_block` já concluído. */
function turnThatCreatedBlock(toolCallId: string) {
  return {
    id: `m-${toolCallId}`,
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Pronto, montei a página.' },
      {
        type: 'tool-add_kpi_block',
        toolCallId,
        state: 'output-available',
        output: { action: 'add_block', block: { id: `b-${toolCallId}`, type: 'kpi' } },
      },
    ],
  };
}

/** Turno em que a IA criou uma página de relatório no Firestore. */
function turnThatCreatedPage() {
  return {
    id: 'm-pagina',
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Criei a página.' },
      {
        type: 'tool-create_report_page',
        toolCallId: 'tc-pagina',
        state: 'output-available',
        output: {
          action: 'report_page_created',
          groupId: 'g1',
          reportId: 'r1',
          name: 'Inadimplência',
        },
      },
    ],
  };
}

/** Turno em que a IA criou um RELATÓRIO (`groups/{g}`) — o container, sem páginas. */
function turnThatCreatedReport() {
  return {
    id: 'm-relatorio',
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Criei o relatório Teste.' },
      {
        type: 'tool-create_report',
        toolCallId: 'tc-relatorio',
        state: 'output-available',
        output: { action: 'report_created', groupId: 'teste', name: 'Teste' },
      },
    ],
  };
}

describe('<AISidebar> clientId plumbing', () => {
  beforeEach(() => {
    resetEnvironment();
    vi.unstubAllGlobals();
  });

  /**
   * As sugestões só aparecem depois de o componente saber que NÃO há conversa
   * anterior — antes disso a área mostra esqueleto, para não afirmar que a
   * conversa está vazia sem saber. Daí o `waitFor`.
   */
  async function clickFirstSuggestion() {
    const suggestion = await waitFor(() => {
      const b = screen.getAllByRole('button').find((btn) =>
        /carteira|resumo|faixa|risco/i.test(btn.textContent ?? ''),
      );
      expect(b).toBeTruthy();
      return b!;
    });
    fireEvent.click(suggestion);
  }

  it('envia clientId = activeClientId (distinto do dataset) no body do /api/chat', async () => {
    render(<AISidebar open onClose={() => {}} />);
    await clickFirstSuggestion();

    const body = lastBody();
    expect(body.clientId).toBe(ACTIVE_CLIENT_ID);
    expect(body.dataset).toBe('projeto.om_dataset');
    expect(body.clientId).not.toBe(body.dataset);
  });

  /**
   * O defeito: `buildBody` é memoizado e suas dependências listavam
   * `compareEnabled` mas não `comparePeriod`. Trocar o período com a
   * comparação ligada mantinha o callback antigo, e o assistente recebia o
   * período anterior — respondia sobre outro intervalo sem avisar.
   */
  it('envia o período de comparação corrente, não o da primeira render', async () => {
    filterState.compareEnabled = true;
    filterState.comparePeriod = { start: '2025-01-01', end: '2025-02-01' };
    const { rerender } = render(<AISidebar open onClose={() => {}} />);

    filterState.comparePeriod = { start: '2025-06-01', end: '2025-07-01' };
    rerender(<AISidebar open onClose={() => {}} />);
    await clickFirstSuggestion();

    const filters = lastBody().filters as { compareEnabled: boolean; comparePeriod: unknown };
    expect(filters.compareEnabled).toBe(true);
    expect(filters.comparePeriod).toEqual({ start: '2025-06-01', end: '2025-07-01' });
  });

  it('envia clientId também no body do /api/canvas-chat (editMode)', async () => {
    render(<AISidebar open onClose={() => {}} editMode />);
    await clickFirstSuggestion();

    const body = lastBody();
    expect(body.clientId).toBe(ACTIVE_CLIENT_ID);
    expect(body.dataset).toBe('projeto.om_dataset');
  });
});

describe('<AISidebar> — resultado de tool e o canvas', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  /** Abre a lista de conversas e clica na conversa pelo título. */
  async function openOldConversation(title: string) {
    fireEvent.click(await screen.findByText('Conversas'));
    fireEvent.click(await screen.findByText(title));
  }

  /**
   * O defeito: o efeito que aplica resultado de tool guardava os `toolCallId` já
   * processados num `useRef` que nascia vazio. Ao abrir uma conversa ANTIGA, as
   * mensagens vinham do Firestore com as tool-parts `output-available`
   * ORIGINAIS — indistinguíveis de resultado recém-chegado — e todos os
   * `add_block` daquele dia eram reaplicados no relatório aberto agora.
   */
  it('não reaplica no canvas os blocos gravados numa conversa antiga', async () => {
    convs.list = [{
      id: 'c9',
      title: 'Página de inadimplência',
      messages: [],
      pinned: false,
      updatedAt: new Date('2026-08-01'),
    }];
    convFns.load.mockResolvedValue({ messages: [turnThatCreatedBlock('tc-de-ontem')] });

    render(<AISidebar open onClose={() => {}} />);
    await openOldConversation('Página de inadimplência');

    // Espera as mensagens da conversa antiga aparecerem na tela: é o instante em
    // que o efeito de aplicação já rodou sobre elas.
    await screen.findByText(/Pronto, montei a página/);
    expect(canvas.addBlock).not.toHaveBeenCalled();
  });

  it('aplica no canvas o resultado que chega no turno corrente', async () => {
    render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([turnThatCreatedBlock('tc-agora')]));

    await waitFor(() => expect(canvas.addBlock).toHaveBeenCalledTimes(1));
  });

  /**
   * O defeito: no fim de um turno que criou página, gravava-se
   * `canvas.pages[canvas.activePage]` — POSICIONAL. Um `loadPages` disparado
   * durante o stream substitui o store, e aí aquela posição é outra página: o
   * conteúdo do relatório ATUAL ia parar dentro do documento da página nova.
   */
  it('não grava o relatório atual dentro da página nova quando o store é substituído no meio do turno', async () => {
    chat.status = 'streaming';
    const { rerender } = render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([turnThatCreatedPage()]));
    await waitFor(() => expect(canvas.createPage).toHaveBeenCalledWith('Inadimplência'));

    // `loadPages` do relatório aberto: a página criada sai do store e a posição
    // ativa passa a apontar para o conteúdo de OUTRO relatório.
    canvas.pages = [{
      id: 'relatorio-aberto',
      title: 'Volumetria',
      blockMap: { doOutroRelatorio: { id: 'doOutroRelatorio' } },
      layout: [],
    }];
    canvas.activePage = 0;

    chat.status = 'ready';
    rerender(<AISidebar open onClose={() => {}} />);

    await screen.findByText(/não pôde ser salvo/i);
    expect(updateReportMock).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('grava o blockMap da página criada quando ela continua no canvas', async () => {
    chat.status = 'streaming';
    const { rerender } = render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([turnThatCreatedPage()]));
    await waitFor(() => expect(canvas.createPage).toHaveBeenCalled());

    // A IA preencheu a página recém-criada.
    canvas.pages = canvas.pages.map((p) =>
      p.id === 'pg-1' ? { ...p, blockMap: { b1: { id: 'b1' } } } : p,
    );

    chat.status = 'ready';
    rerender(<AISidebar open onClose={() => {}} />);

    await waitFor(() => expect(updateReportMock).toHaveBeenCalledTimes(1));
    expect(updateReportMock.mock.calls[0]).toEqual([
      'om', 'g1', 'r1', { b1: { id: 'b1' } }, [],
    ]);
    expect(routerPush).toHaveBeenCalledWith('/g/g1/r/r1');
  });

  /**
   * O documento da conversa era reescrito inteiro a cada ponto estável do turno,
   * com os `parts` completos — tool result e tudo. Medido no banco de dev: a
   * maior conversa tinha 252 KB (25% do teto DURO de 1 MiB) e o Firestore passou
   * a recusar com `resource-exhausted`, "exceeded their maximum bandwidth for
   * writes".
   *
   * A poda vale para o BANCO. Na tela as mensagens seguem inteiras — é delas que
   * o turno atual desenha tabela e gráfico.
   */
  it('grava a conversa sem o payload de tool, e não mexe no que está na tela', async () => {
    chat.status = 'streaming';
    const { rerender } = render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    const lines = Array.from({ length: 800 }, (_, i) => ({ i, valor: 'x'.repeat(40) }));
    const turn = {
      id: 'm-sql',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'A inadimplência subiu 3,2%.' },
        {
          type: 'tool-execute_sql',
          toolCallId: 'tc-sql',
          state: 'output-available',
          output: { rows: lines },
        },
      ],
    };

    act(() => chat.emit!([turn]));
    chat.status = 'ready';
    rerender(<AISidebar open onClose={() => {}} />);

    await waitFor(() => expect(convFns.save).toHaveBeenCalled());

    const saved = convFns.save.mock.calls.at(-1)![1];
    const bytes = Buffer.byteLength(JSON.stringify(saved), 'utf8');
    expect(bytes).toBeLessThan(5_000);

    // O texto do assistente sobrevive; o payload não.
    expect(JSON.stringify(saved)).toContain('inadimplência subiu 3,2%');
    expect(JSON.stringify(saved)).not.toContain(lines[799]!.valor + '","i":799');
    const toolPart = saved.messages.at(-1)!.parts.at(-1) as Record<string, unknown>;
    expect(toolPart.type).toBe('tool-execute_sql');
    expect((toolPart.output as Record<string, unknown>).podado).toBe(true);

    // Em memória, intacto: 800 linhas continuam lá para a tela desenhar.
    expect(turn.parts[1]!.output!.rows).toHaveLength(800);
  });

  /**
   * Relatório criado pela IA tem de aparecer no seletor e abrir, como acontece
   * pelo botão "Novo relatório" da barra lateral. Sem isso o assistente diria
   * "criei o relatório Teste" e a tela continuaria no relatório anterior — as
   * duas afirmações contraditórias que a criação de página já teve.
   */
  it('navega até o relatório que a IA criou e atualiza o seletor', async () => {
    chat.status = 'streaming';
    const { rerender } = render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([turnThatCreatedReport()]));

    chat.status = 'ready';
    rerender(<AISidebar open onClose={() => {}} />);

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/g/teste'));
    expect(fakeStoreState.bumpGroupsList).toHaveBeenCalled();
    expect(fakeStoreState.setActiveGroup).toHaveBeenCalledWith('teste');
    // Relatório não é página: nada de canvas envolvido.
    expect(canvas.createPage).not.toHaveBeenCalled();
    expect(updateReportMock).not.toHaveBeenCalled();
  });

  /**
   * "Crie o relatório X e monte a página Y nele": o destino final é a PÁGINA.
   * Navegar para o relatório vazio depois de gravar a página deixaria o usuário
   * numa tela em branco justamente no turno que produziu conteúdo.
   */
  it('criando relatório E página no mesmo turno, abre a página — não o relatório vazio', async () => {
    chat.status = 'streaming';
    const { rerender } = render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([turnThatCreatedReport(), turnThatCreatedPage()]));
    await waitFor(() => expect(canvas.createPage).toHaveBeenCalledWith('Inadimplência'));

    canvas.pages = canvas.pages.map((p) =>
      p.id === 'pg-1' ? { ...p, blockMap: { b1: { id: 'b1' } } } : p,
    );

    chat.status = 'ready';
    rerender(<AISidebar open onClose={() => {}} />);

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/g/g1/r/r1'));
    expect(routerPush).not.toHaveBeenCalledWith('/g/teste');
    // O seletor ainda precisa saber do relatório novo.
    expect(fakeStoreState.bumpGroupsList).toHaveBeenCalled();
  });
});

/**
 * A conversa sempre esteve gravada no Firestore; o que se perdia num refresh
 * era saber QUAL delas estava aberta — isso vivia num `useState`. O usuário
 * recarregava a página no meio de uma análise, via o chat vazio e concluía que
 * tinha perdido o que escreveu.
 */
describe('<AISidebar> — retomar a conversa depois de um refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    convFns.load.mockReset();
    convFns.load.mockResolvedValue(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('retoma a conversa que estava aberta neste cliente', async () => {
    localStorage.setItem('liquid:conversaAtiva:om', 'c-em-andamento');
    convFns.load.mockResolvedValue({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'como está a inadimplência?' }] }],
    });

    render(<AISidebar open onClose={() => {}} />);

    await waitFor(() => expect(convFns.load).toHaveBeenCalledWith('c-em-andamento'));
    expect(await screen.findByText(/como está a inadimplência/)).toBeInTheDocument();
  });

  // A conversa é sobre a carteira de UM cliente: retomar no cliente errado
  // traria uma discussão sobre outros números.
  it('não retoma a conversa guardada para outro cliente', async () => {
    localStorage.setItem('liquid:conversaAtiva:brz', 'c-de-outro-cliente');

    render(<AISidebar open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Como posso ajudar/i)).toBeInTheDocument());
    expect(convFns.load).not.toHaveBeenCalled();
  });

  it('sem nada guardado, abre limpo', async () => {
    render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Como posso ajudar/i)).toBeInTheDocument());
    expect(convFns.load).not.toHaveBeenCalled();
  });

  it('a conversa criada na primeira pergunta fica guardada para o próximo refresh', async () => {
    render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'oi' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'olá' }] },
    ]));

    await waitFor(() => expect(convFns.create).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem('liquid:conversaAtiva:om')).toBe('c1'));
  });

  it('"Nova conversa" esquece a guardada — começar do zero é uma escolha', async () => {
    localStorage.setItem('liquid:conversaAtiva:om', 'c-em-andamento');
    convFns.load.mockResolvedValue({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'texto antigo' }] }],
    });
    convs.list = [{ id: 'c-em-andamento', title: 'Antiga', messages: [], pinned: false, updatedAt: new Date() }];

    render(<AISidebar open onClose={() => {}} />);
    await screen.findByText(/texto antigo/);

    fireEvent.click(screen.getByRole('button', { name: /Conversas/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Nova conversa/i }));

    await waitFor(() => expect(localStorage.getItem('liquid:conversaAtiva:om')).toBeNull());
  });
});

describe('<AISidebar> — enquanto busca o histórico', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    // Lista de conversas ainda carregando: é o intervalo em que não se sabe se
    // existe conversa anterior.
    convs.loading = true;
  });

  afterEach(() => {
    convs.loading = false;
  });

  /**
   * O defeito: o modal abria com "Como posso ajudar?" e as sugestões — que
   * AFIRMAM que a conversa está vazia — e trocava para o histórico quando ele
   * chegava. Quem tinha conversa anterior via a tela dizer que não tinha, e
   * mudar de ideia depois.
   */
  it('não afirma que a conversa está vazia antes de saber', async () => {
    const { container } = render(<AISidebar open onClose={() => {}} />);

    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    });
    expect(screen.queryByText(/Como posso ajudar/i)).toBeNull();
  });
});

/**
 * O turno que não termina bem também é turno.
 *
 * Com `status !== 'ready'` como única porta, um stream cortado (servidor
 * reiniciado, rede, quota) levava embora a pergunta do usuário junto com a
 * resposta parcial — enquanto as tools daquele turno já tinham mudado o app.
 * Fechar e reabrir o chat mostrava a conversa como se nada tivesse acontecido.
 */
describe('AISidebar — a conversa sobrevive ao turno que quebra', () => {
  beforeEach(() => {
    convFns.create.mockClear();
    convFns.save.mockClear();
    chat.status = 'ready';
  });

  it('grava a pergunta assim que ela é enviada, antes da resposta', async () => {
    chat.status = 'submitted';
    render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'e aí?' }] }]));

    await waitFor(() => expect(convFns.save).toHaveBeenCalled());
  });

  it('grava o que sobrou quando o stream termina em erro', async () => {
    chat.status = 'streaming';
    const { rerender } = render(<AISidebar open onClose={() => {}} />);
    await waitFor(() => expect(chat.emit).toBeTruthy());

    act(() => chat.emit!([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'adicione um filtro de banco' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Adicionei o' }] },
    ]));
    // Em `streaming` nada é gravado — o turno ainda está em pé.
    expect(convFns.save).not.toHaveBeenCalled();

    chat.status = 'error';
    rerender(<AISidebar open onClose={() => {}} />);

    await waitFor(() => expect(convFns.save).toHaveBeenCalled());
    const last = convFns.save.mock.calls.at(-1) as unknown as [string, { messages: Array<{ role: string }> }];
    const saved = last[1];
    expect(saved.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});

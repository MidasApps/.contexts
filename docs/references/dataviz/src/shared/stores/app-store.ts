import { create } from 'zustand';
import type { Product, ClientProductBinding, Metric } from '@/shared/schemas';
import { clearQueryCache } from '@/shared/hooks/useQuery';
import {
  DEFAULT_AGENT_ID,
  resolveChatAgentId,
  type ChatAgentId,
} from '@/shared/config/agents/chat-agent-catalog';

// ─── Client config ───

export interface DatasetConfig {
  id: string;
  name: string;
  dataset: string;
  description?: string;
}

export interface ClientConfig {
  id: string;
  name: string;
  /** @deprecated transição para productBindings — alguns consumidores legados ainda lêem. */
  datasets?: DatasetConfig[];
  /** @deprecated single-dataset legado — manter para retrocompat. */
  dataset?: string;
  color: string;
  initial: string;
  schema?: Record<string, Record<string, string | null>> | null;
  productBindings?: ClientProductBinding[];
}

// ─── Filters per client ───

/**
 * O que se guarda de cada cliente ao trocar de um para outro.
 *
 * Guardava também `projetos` e os seis `advancedFilters`. Os controles que os
 * alimentavam saíram do painel — as opções eram literais no código e nenhuma
 * métrica do catálogo os aplicava. O que sobra é o que de fato recorta a tela.
 */
export interface ClientFilters {
  dateRange: { start: string; end: string };
  compareEnabled: boolean;
}

const DEFAULT_FILTERS: ClientFilters = {
  dateRange: { start: '', end: '' },
  compareEnabled: false,
};

// ─── Store ───

interface AppState {
  activeClientId: string;
  getActiveClient: () => ClientConfig | null;

  clients: ClientConfig[];
  setClients: (clients: ClientConfig[]) => void;
  clientsStatus: 'idle' | 'loading' | 'ready' | 'error';
  clientsError: string | null;
  setClientsLoading: () => void;
  setClientsError: (message: string) => void;

  // ── Products (Fase 5) ────────────────────────────────────────
  activeProductId: string | null;
  products: Product[];
  productsStatus: 'idle' | 'loading' | 'ready' | 'error';
  productsError: string | null;
  setProducts: (products: Product[]) => void;
  setProductsLoading: () => void;
  setProductsError: (message: string) => void;
  setActiveProductId: (productId: string | null) => void;
  getActiveProduct: () => Product | null;
  /** Produtos que o cliente ativo assina (derivado de productBindings). */
  getAvailableProductsForActiveClient: () => Product[];

  // ── Metrics (ADR-0015 — camada semântica) ───────────────────
  metrics: Metric[];
  metricsStatus: 'idle' | 'loading' | 'ready' | 'error';
  metricsError: string | null;
  setMetrics: (metrics: Metric[]) => void;
  /**
   * Sobe a cada catálogo novo gravado no store. É o que avisa quem depende do
   * CONTEÚDO do catálogo (recorte do "Último mês", escala do percentual) —
   * o tamanho não basta: corrigir uma métrica muda o catálogo sem mudá-lo.
   */
  metricsRevision: number;
  /** Pedido de recarga do catálogo — o chat criou ou alterou uma métrica. */
  metricsCatalogVersion: number;
  bumpMetricsCatalog: () => void;
  setMetricsLoading: () => void;
  setMetricsError: (message: string) => void;

  clientFilters: Record<string, ClientFilters>;

  // Navigation: active group and report
  activeGroupId: string;
  activeReportId: string;
  setActiveGroup: (groupId: string) => void;
  setActiveReport: (groupId: string, reportId: string) => void;

  // Edit mode for reports
  editingReport: boolean;
  setEditingReport: (editing: boolean) => void;

  // Título da página atual. Fallback para o título do PDF exportado quando o
  // FilterPanel é aberto pelo header global (AppHeader → FiltersButton), que
  // não conhece a página — só a sessão. Efêmero, não persistido.
  currentPageTitle: string;

  // Nome do RELATÓRIO que contém a página atual — a primeira perna da trilha
  // do header global (`Relatório › Página`). Fica aqui, e não num fetch do
  // próprio header, porque quem já tem os dois nomes em mãos é a página; o
  // header repetiria duas leituras de Firestore para descobrir o que ela
  // acabou de ler. Efêmero, não persistido.
  currentGroupName: string;
  setPageTrail: (groupName: string, pageTitle: string) => void;
  // Renomear pela coluna grava no Firestore, mas a trilha veio do documento que
  // a página leu ao abrir. Só troca o nome se o renomeado for o que está na
  // trilha agora — renomear outra página não pode reescrever o header.
  renameInTrail: (target: { groupId: string } | { reportId: string }, name: string) => void;

  // Coluna de navegação à esquerda: trilho de ícones (true) ou lista completa.
  // Persistido — quem colapsa quer a tela assim, não só neste carregamento.
  isNavCollapsed: boolean;
  toggleNavCollapsed: () => void;

  // Painel de chat à direita: aberto (true) ou ausente. Persistido.
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChatOpen: () => void;

  // Agente que atende o chat: o supervisor (padrão) ou um especialista
  // escolhido à mão no seletor do painel. Persistido — quem trocou quer
  // continuar com aquele agente na próxima sessão. Ver
  // `@/shared/config/agents/chat-agent-catalog`.
  chatAgentId: ChatAgentId;
  setChatAgentId: (id: ChatAgentId) => void;

  // Cross-instance refresh trigger for useReports hook (bumped by mutations)
  reportsListVersion: number;
  bumpReportsList: () => void;

  /*
   * Mesmo gatilho para a lista de RELATÓRIOS (`useGroups`).
   *
   * `useGroups` só refazia o fetch quando o cliente ativo mudava — bastava para
   * o `ReportSwitcher`, que cria e refetcha na mesma instância do hook. Quando a
   * IA passou a criar relatório, o criador virou outro componente: o assistente
   * dizia "criei o relatório Teste" e o seletor seguia sem ele até o reload.
   */
  groupsListVersion: number;
  bumpGroupsList: () => void;

  // Debug mode — shows SQL/code in chat tool steps
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;

  // Test as user mode — disables admin bypass for permissions
  testAsUser: boolean;
  setTestAsUser: (enabled: boolean) => void;

  // AI memory thread (Sprint 1.A) — persisted in-memory per session
  currentThreadId: string | null;
  setCurrentThreadId: (id: string | null) => void;

  // Persona/ICP for dynamic agent context (Sprint 1.D)
  currentPersonaId: string | null;
  currentIcpId: string | null;
  setCurrentPersonaId: (id: string | null) => void;
  setCurrentIcpId: (id: string | null) => void;

  // Sprint 2.B feature flag — gates the workflow-state-machine path in canvas orchestrator
  useWorkflowOrchestrator: boolean;
  setUseWorkflowOrchestrator: (v: boolean) => void;

  // Sprint 3.B feature flags — gradual rollout of supervisor improvements
  featureFlags: {
    useImprovedSupervisor: boolean;
    useVertexPromptCache: boolean;
  };
  setFeatureFlag: (
    key: 'useImprovedSupervisor' | 'useVertexPromptCache',
    value: boolean,
  ) => void;

  // Actions
  switchClient: (clientId: string, currentFilters: ClientFilters) => void;
  getFiltersForClient: (clientId: string) => ClientFilters;

  buildAIContext: () => string;
}

function readDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem('liquid:debugMode') === '1'; } catch { return false; }
}

function readActiveClientId(): string {
  if (typeof window === 'undefined') return '';
  try { return localStorage.getItem('liquid:activeClientId') ?? ''; } catch { return ''; }
}

function saveActiveClientId(id: string): void {
  try { localStorage.setItem('liquid:activeClientId', id); } catch {}
}

type FeatureFlagKey = 'useImprovedSupervisor' | 'useVertexPromptCache';
const FEATURE_FLAG_STORAGE_KEY = 'liquid:featureFlags';

function readFeatureFlags(): { useImprovedSupervisor: boolean; useVertexPromptCache: boolean } {
  const defaults = { useImprovedSupervisor: false, useVertexPromptCache: false };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(FEATURE_FLAG_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<typeof defaults>;
    return {
      useImprovedSupervisor: parsed.useImprovedSupervisor === true,
      useVertexPromptCache: parsed.useVertexPromptCache === true,
    };
  } catch {
    return defaults;
  }
}

function saveFeatureFlags(flags: { useImprovedSupervisor: boolean; useVertexPromptCache: boolean }): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(FEATURE_FLAG_STORAGE_KEY, JSON.stringify(flags)); } catch {}
}

function readActiveProductId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem('liquid:activeProductId') ?? null; } catch { return null; }
}

function saveActiveProductId(id: string | null): void {
  try {
    if (id) localStorage.setItem('liquid:activeProductId', id);
    else localStorage.removeItem('liquid:activeProductId');
  } catch {}
}

const CHAT_AGENT_STORAGE_KEY = 'liquid:chatAgent';

function readChatAgentId(): ChatAgentId {
  if (typeof window === 'undefined') return DEFAULT_AGENT_ID;
  // `resolveChatAgentId` filtra id de agente que deixou de existir entre
  // versões — o valor guardado não é contrato.
  try { return resolveChatAgentId(localStorage.getItem(CHAT_AGENT_STORAGE_KEY)); }
  catch { return DEFAULT_AGENT_ID; }
}

function saveChatAgentId(id: ChatAgentId): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CHAT_AGENT_STORAGE_KEY, id); } catch {}
}

const CHAT_OPEN_STORAGE_KEY = 'liquid:chatOpen';

function readChatOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CHAT_OPEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveChatOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_OPEN_STORAGE_KEY, open ? '1' : '0');
  } catch {}
}

const NAV_COLLAPSED_STORAGE_KEY = 'liquid:navColapsada';

/*
 * A coluna de navegação começa ABERTA e o estado é lembrado — como o do chat.
 * Quem trabalha numa tela estreita colapsa uma vez, não a cada recarga.
 */
function readNavCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveNavCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {}
}

export const useAppStore = create<AppState>((set, get) => ({
  activeClientId: readActiveClientId(),
  clients: [],
  clientsStatus: 'idle',
  clientsError: null,
  clientFilters: {},
  // Products (Fase 5)
  activeProductId: readActiveProductId(),
  products: [],
  productsStatus: 'idle',
  productsError: null,
  metrics: [],
  metricsStatus: 'idle',
  metricsError: null,

  activeGroupId: '',
  activeReportId: '',
  editingReport: false,
  setEditingReport: (editing) => set({ editingReport: editing }),
  currentPageTitle: '',
  currentGroupName: '',
  setPageTrail: (groupName, pageTitle) =>
    set({ currentGroupName: groupName, currentPageTitle: pageTitle }),
  renameInTrail: (target, name) => {
    const state = get();
    if ('groupId' in target) {
      if (target.groupId === state.activeGroupId && state.currentGroupName) set({ currentGroupName: name });
      return;
    }
    if (target.reportId === state.activeReportId && state.currentPageTitle) set({ currentPageTitle: name });
  },
  isNavCollapsed: readNavCollapsed(),
  toggleNavCollapsed: () => {
    const next = !get().isNavCollapsed;
    saveNavCollapsed(next);
    set({ isNavCollapsed: next });
  },
  chatAgentId: readChatAgentId(),
  setChatAgentId: (id) => {
    saveChatAgentId(id);
    set({ chatAgentId: id });
  },
  chatOpen: readChatOpen(),
  setChatOpen: (open) => {
    saveChatOpen(open);
    set({ chatOpen: open });
  },
  toggleChatOpen: () => {
    const next = !get().chatOpen;
    saveChatOpen(next);
    set({ chatOpen: next });
  },
  reportsListVersion: 0,
  bumpReportsList: () => set((s) => ({ reportsListVersion: s.reportsListVersion + 1 })),

  groupsListVersion: 0,
  bumpGroupsList: () => set((s) => ({ groupsListVersion: s.groupsListVersion + 1 })),
  debugMode: readDebugMode(),
  testAsUser: false,
  currentThreadId: null,
  setCurrentThreadId: (id) => set({ currentThreadId: id }),
  currentPersonaId: 'cfo-securitizadora',
  currentIcpId: null,
  setCurrentPersonaId: (id) => set({ currentPersonaId: id }),
  setCurrentIcpId: (id) => set({ currentIcpId: id }),

  // Sprint 2.B — default OFF (rollback soft)
  useWorkflowOrchestrator: false,
  setUseWorkflowOrchestrator: (v) => set({ useWorkflowOrchestrator: v }),

  // Sprint 3.B — default OFF for both; persisted via localStorage
  featureFlags: readFeatureFlags(),
  setFeatureFlag: (key: FeatureFlagKey, value: boolean) => {
    set((state) => {
      const next = { ...state.featureFlags, [key]: value };
      saveFeatureFlags(next);
      return { featureFlags: next };
    });
  },

  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),
  setActiveReport: (groupId, reportId) => set({ activeGroupId: groupId, activeReportId: reportId }),

  setDebugMode: (enabled) => {
    try { localStorage.setItem('liquid:debugMode', enabled ? '1' : '0'); } catch {}
    set({ debugMode: enabled });
  },

  setTestAsUser: (enabled) => set({ testAsUser: enabled }),

  getActiveClient: () => {
    const clients = get().clients;
    return clients.find((c) => c.id === get().activeClientId) ?? clients[0] ?? null;
  },

  setClients: (clients) => {
    clearQueryCache();
    return set((state) => {
      const savedId = state.activeClientId;
      const newId = clients.some((c) => c.id === savedId) ? savedId : (clients[0]?.id ?? '');
      saveActiveClientId(newId);
      return {
        clients,
        activeClientId: newId,
        clientsStatus: 'ready',
        clientsError: null,
      };
    });
  },

  setClientsLoading: () => set({ clientsStatus: 'loading', clientsError: null }),

  setClientsError: (message) => set({
    clients: [],
    activeClientId: '',
    clientsStatus: 'error',
    clientsError: message,
  }),

  // ── Products (Fase 5) ─────────────────────────────────────
  setProducts: (products) => set((state) => {
    // Se o produto salvo não existir mais, usa o primeiro disponível.
    const saved = state.activeProductId;
    const exists = saved ? products.some((p) => p.id === saved) : false;
    const nextActive = exists ? saved : (products[0]?.id ?? null);
    saveActiveProductId(nextActive);
    return {
      products,
      activeProductId: nextActive,
      productsStatus: 'ready',
      productsError: null,
    };
  }),

  setProductsLoading: () => set({ productsStatus: 'loading', productsError: null }),

  setProductsError: (message) => set({
    products: [],
    productsStatus: 'error',
    productsError: message,
  }),

  // ── Metrics (ADR-0015) ────────────────────────────────────
  setMetrics: (metrics) => set((st) => ({
    metrics, metricsStatus: 'ready', metricsError: null, metricsRevision: st.metricsRevision + 1,
  })),
  metricsRevision: 0,
  metricsCatalogVersion: 0,
  bumpMetricsCatalog: () => set((st) => ({ metricsCatalogVersion: st.metricsCatalogVersion + 1 })),
  setMetricsLoading: () => set({ metricsStatus: 'loading', metricsError: null }),
  setMetricsError: (message) => set({
    metrics: [],
    metricsStatus: 'error',
    metricsError: message,
  }),

  setActiveProductId: (productId) => {
    saveActiveProductId(productId);
    set({ activeProductId: productId });
  },

  getActiveProduct: () => {
    const { products, activeProductId } = get();
    if (!activeProductId) return products[0] ?? null;
    return products.find((p) => p.id === activeProductId) ?? products[0] ?? null;
  },

  getAvailableProductsForActiveClient: () => {
    const { products } = get();
    const client = get().getActiveClient();
    if (!client) return products;
    const bindings = client.productBindings ?? [];
    if (bindings.length === 0) return products; // cliente legacy: mostra todos
    const assigned = new Set(bindings.map((b) => b.productId));
    return products.filter((p) => assigned.has(p.id));
  },

  switchClient: (clientId, currentFilters) => {
    const prev = get().activeClientId;
    saveActiveClientId(clientId);
    set((state) => ({
      activeClientId: clientId,
      activeGroupId: '',
      activeReportId: '',
      clientFilters: {
        ...state.clientFilters,
        ...(prev ? { [prev]: currentFilters } : {}),
      },
    }));
  },

  getFiltersForClient: (clientId) => {
    return get().clientFilters[clientId] ?? { ...DEFAULT_FILTERS };
  },

  buildAIContext: () => {
    const client = get().getActiveClient();

    const lines: string[] = [];

    // Client info
    lines.push(`# Contexto do Dashboard`);
    if (client) {
      const dsNames = (client.datasets ?? []).map(d => d.name).join(', ');
      lines.push(`Cliente: ${client.name} (datasets: ${dsNames})`);
    } else {
      lines.push('Cliente: não selecionado');
    }

    return lines.join('\n');
  },
}));

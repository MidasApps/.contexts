import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './app-store';

describe('app-store currentThreadId', () => {
  beforeEach(() => {
    useAppStore.setState({ currentThreadId: null });
  });

  it('starts as null', () => {
    expect(useAppStore.getState().currentThreadId).toBeNull();
  });

  it('setCurrentThreadId updates the value', () => {
    useAppStore.getState().setCurrentThreadId('t-1');
    expect(useAppStore.getState().currentThreadId).toBe('t-1');
  });

  it('setCurrentThreadId(null) clears', () => {
    useAppStore.getState().setCurrentThreadId('t-1');
    useAppStore.getState().setCurrentThreadId(null);
    expect(useAppStore.getState().currentThreadId).toBeNull();
  });
});

describe('app-store currentPersonaId / currentIcpId', () => {
  beforeEach(() => {
    useAppStore.setState({ currentPersonaId: 'cfo-securitizadora', currentIcpId: null });
  });

  it('default currentPersonaId is cfo-securitizadora', () => {
    expect(useAppStore.getState().currentPersonaId).toBe('cfo-securitizadora');
  });

  it('default currentIcpId is null', () => {
    expect(useAppStore.getState().currentIcpId).toBeNull();
  });

  it('setCurrentPersonaId updates state', () => {
    useAppStore.getState().setCurrentPersonaId('controller');
    expect(useAppStore.getState().currentPersonaId).toBe('controller');
  });

  it('setCurrentIcpId accepts null', () => {
    useAppStore.getState().setCurrentIcpId('fundo-cri-listado');
    useAppStore.getState().setCurrentIcpId(null);
    expect(useAppStore.getState().currentIcpId).toBeNull();
  });
});

describe('app-store useWorkflowOrchestrator', () => {
  beforeEach(() => useAppStore.setState({ useWorkflowOrchestrator: false }));
  it('default is false', () => {
    expect(useAppStore.getState().useWorkflowOrchestrator).toBe(false);
  });
  it('setter toggles', () => {
    useAppStore.getState().setUseWorkflowOrchestrator(true);
    expect(useAppStore.getState().useWorkflowOrchestrator).toBe(true);
  });
});

describe('app-store featureFlags (Sprint 3.B)', () => {
  beforeEach(() => {
    try { localStorage.removeItem('liquid:featureFlags'); } catch {}
    useAppStore.setState({
      featureFlags: { useImprovedSupervisor: false, useVertexPromptCache: false },
    });
  });

  it('defaults both flags to false', () => {
    const f = useAppStore.getState().featureFlags;
    expect(f.useImprovedSupervisor).toBe(false);
    expect(f.useVertexPromptCache).toBe(false);
  });

  it('setFeatureFlag updates state correctly', () => {
    useAppStore.getState().setFeatureFlag('useImprovedSupervisor', true);
    expect(useAppStore.getState().featureFlags.useImprovedSupervisor).toBe(true);
    expect(useAppStore.getState().featureFlags.useVertexPromptCache).toBe(false);

    useAppStore.getState().setFeatureFlag('useVertexPromptCache', true);
    expect(useAppStore.getState().featureFlags.useVertexPromptCache).toBe(true);
  });

  it('persists to localStorage so it survives across rehydrate', () => {
    useAppStore.getState().setFeatureFlag('useImprovedSupervisor', true);
    const raw = localStorage.getItem('liquid:featureFlags');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.useImprovedSupervisor).toBe(true);
    expect(parsed.useVertexPromptCache).toBe(false);
  });
});

describe('app-store trilha da página', () => {
  beforeEach(() => {
    useAppStore.setState({ currentPageTitle: '', currentGroupName: '' });
  });

  it('starts as string vazia', () => {
    expect(useAppStore.getState().currentPageTitle).toBe('');
    expect(useAppStore.getState().currentGroupName).toBe('');
  });

  it('setPageTrail registra relatório e página — a trilha do header e o fallback do título do PDF', () => {
    useAppStore.getState().setPageTrail('Carteira', 'Visão Geral');
    expect(useAppStore.getState().currentGroupName).toBe('Carteira');
    expect(useAppStore.getState().currentPageTitle).toBe('Visão Geral');
  });

  /* Sair do relatório apaga a trilha; o header não pode seguir anunciando a
     última página aberta enquanto a pessoa está na home. */
  it('setPageTrail com strings vazias limpa a trilha', () => {
    useAppStore.getState().setPageTrail('Carteira', 'Visão Geral');
    useAppStore.getState().setPageTrail('', '');
    expect(useAppStore.getState().currentGroupName).toBe('');
    expect(useAppStore.getState().currentPageTitle).toBe('');
  });

  /* Renomear pela coluna não relê o documento da página; sem isto o header
     seguia com o nome antigo até o reload. */
  describe('renameInTrail', () => {
    beforeEach(() => {
      useAppStore.setState({ activeGroupId: 'g1', activeReportId: 'r1' });
      useAppStore.getState().setPageTrail('Carteira', 'Visão Geral');
    });

    it('renomear a página em tela troca o nome na trilha', () => {
      useAppStore.getState().renameInTrail({ reportId: 'r1' }, 'Resumo');
      expect(useAppStore.getState().currentPageTitle).toBe('Resumo');
      expect(useAppStore.getState().currentGroupName).toBe('Carteira');
    });

    it('renomear o relatório em tela troca o nome na trilha', () => {
      useAppStore.getState().renameInTrail({ groupId: 'g1' }, 'Carteira 2026');
      expect(useAppStore.getState().currentGroupName).toBe('Carteira 2026');
    });

    it('renomear outra página não mexe na trilha', () => {
      useAppStore.getState().renameInTrail({ reportId: 'r9' }, 'Outra');
      expect(useAppStore.getState().currentPageTitle).toBe('Visão Geral');
    });

    it('sem trilha (fora do relatório), renomear não cria uma', () => {
      useAppStore.getState().setPageTrail('', '');
      useAppStore.getState().renameInTrail({ reportId: 'r1' }, 'Resumo');
      useAppStore.getState().renameInTrail({ groupId: 'g1' }, 'Carteira 2026');
      expect(useAppStore.getState().currentPageTitle).toBe('');
      expect(useAppStore.getState().currentGroupName).toBe('');
    });
  });
});

describe('app-store chatOpen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ chatOpen: false });
  });

  it('começa fechado por padrão', () => {
    expect(useAppStore.getState().chatOpen).toBe(false);
  });

  it('toggleChatOpen alterna o valor', () => {
    useAppStore.getState().toggleChatOpen();
    expect(useAppStore.getState().chatOpen).toBe(true);
    useAppStore.getState().toggleChatOpen();
    expect(useAppStore.getState().chatOpen).toBe(false);
  });

  it('setChatOpen persiste em localStorage', () => {
    useAppStore.getState().setChatOpen(true);
    expect(localStorage.getItem('liquid:chatOpen')).toBe('1');
    useAppStore.getState().setChatOpen(false);
    expect(localStorage.getItem('liquid:chatOpen')).toBe('0');
  });

  it('toggleChatOpen também persiste', () => {
    useAppStore.getState().setChatOpen(false);
    useAppStore.getState().toggleChatOpen();
    expect(localStorage.getItem('liquid:chatOpen')).toBe('1');
  });

  it('lê o default do localStorage na inicialização', async () => {
    localStorage.clear();
    vi.resetModules();
    const m = await import('./app-store');
    expect(m.useAppStore.getState().chatOpen).toBe(false);
  });

  it('lê chatOpen=true quando a chave é "1"', async () => {
    localStorage.setItem('liquid:chatOpen', '1');
    vi.resetModules();
    const m = await import('./app-store');
    expect(m.useAppStore.getState().chatOpen).toBe(true);
  });
});

describe('app-store — catálogo de métricas', () => {
  it('cada catálogo gravado sobe a revisão, mesmo com o mesmo tamanho', () => {
    const before = useAppStore.getState().metricsRevision;
    useAppStore.getState().setMetrics([]);
    useAppStore.getState().setMetrics([]);
    expect(useAppStore.getState().metricsRevision).toBe(before + 2);
  });

  it('bumpMetricsCatalog pede uma recarga', () => {
    const before = useAppStore.getState().metricsCatalogVersion;
    useAppStore.getState().bumpMetricsCatalog();
    expect(useAppStore.getState().metricsCatalogVersion).toBe(before + 1);
  });
});

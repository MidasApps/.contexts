'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { Plus, ArrowLeft, FileText } from 'lucide-react';
import { useAppStore } from '@/shared/stores/app-store';
import { useGroups } from '@/shared/hooks/useGroups';
import { useReports } from '@/shared/hooks/useReports';
import { createReport as createReportDoc, type Report } from '@/shared/lib/firestore/reports';
import { SaveAsTemplateFromPage } from '@/features/templates/ui/SaveAsTemplateFromPage';
import { ChatContent, AgentPicker, useAssistantTab } from '@/widgets/chat-sidebar';
import { TabSelector } from './TabSelector';
import { PromptDialog, ConfirmDialog } from '@/shared/ui/prompt-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';
import { TopbarClientSwitcher } from '@/widgets/client-switcher';
import { TemplateGallery } from './TemplateGallery';
import { NavItem } from './NavItem';
import { NewPageDialog } from './NewPageDialog';
import { PageListItem } from './PageListItem';
import { ReportSwitcher } from './ReportSwitcher';

interface PromptState {
  title: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
}

interface ConfirmState {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface PagesSidebarProps {
  className?: string;
  /** Chamado após ações que tiram o usuário da gaveta (Sheet mobile) —
   * fecha o drawer ao navegar. Omitido na coluna fixa do desktop. */
  onNavigate?: () => void;
  /**
   * `false` ignora o colapso guardado na store.
   *
   * A gaveta do mobile é a MESMA coluna, mas o trilho de ícones não faz
   * sentido lá: a gaveta já é uma sobreposição que se abre e se fecha inteira.
   * Sem isto, quem colapsasse no desktop encontraria um trilho de 56px
   * flutuando dentro de uma gaveta de 240px.
   */
  collapsible?: boolean;
}

/**
 * A coluna de navegação: o cliente no topo, o seletor de aba abaixo dele, e o
 * corpo da coluna pertencendo à aba escolhida — o relatório (qual é, e as
 * páginas dele) ou o assistente.
 *
 * O cliente é o único que fica acima do seletor, porque é o escopo das DUAS
 * abas. O relatório não é: ele vive dentro da aba que leva o nome dele. Acima
 * do seletor, ele parecia governar também a conversa, e a lista que governava
 * de fato se chamava outra coisa — "Páginas" debaixo de "Covenants". Dentro
 * da aba, o dropdown de relatório e o seletor de agente ocupam o mesmo lugar:
 * um por aba.
 *
 * ─── O que mudou, e por quê ───
 *
 * A coluna já foi uma lista PLANA de páginas (um grupo escondido, "Minhas
 * páginas", engolindo tudo) e depois uma ÁRVORE de relatórios expansíveis.
 * A árvore mostrava a hierarquia certa mas não escalava: dez relatórios são
 * dez nós, cada um com um subnível dentro, disputando a mesma coluna — e a
 * página aberta some no meio.
 *
 * Agora o relatório é ESCOPO, não item de lista: troca-se no dropdown, como
 * se troca de cliente. A hierarquia continua a mesma no Firestore e na rota
 * (`clients/{id}/groups/{g}/reports/{r}` → `/g/:groupId/r/:reportId`); o que
 * mudou é que a tela mostra um ramo de cada vez.
 *
 * ⚠️ Vocabulário: o `group` do Firestore é o "relatório" da tela e o `report`
 * é a "página". Nenhuma migração é necessária por causa disto.
 */
export function PagesSidebar({ className, onNavigate, collapsible = true }: PagesSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    groups,
    loading: groupsLoading,
    create: createGroup,
    rename: renameGroup,
    remove: removeGroup,
  } = useGroups();

  const activeClientId = useAppStore((s) => s.activeClientId);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const activeReportId = useAppStore((s) => s.activeReportId);
  const isNavCollapsed = useAppStore((s) => s.isNavCollapsed);
  const toggleNavCollapsed = useAppStore((s) => s.toggleNavCollapsed);
  const clients = useAppStore((s) => s.clients);
  const collapsed = collapsible && isNavCollapsed;
  const activeClient = clients.find((c) => c.id === activeClientId) ?? clients[0] ?? null;
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const bumpReportsList = useAppStore((s) => s.bumpReportsList);
  const renameInTrail = useAppStore((s) => s.renameInTrail);
  const isEditingReport = useAppStore((s) => s.editingReport);
  /* `chatOpen` deixou de significar "o painel flutuante esta aberto" e passou
     a significar "a coluna esta mostrando o assistente". O nome ficou porque
     ele e persistido — renomear custaria migracao de store por nada. */
  const isShowingChat = useAppStore((s) => s.chatOpen);
  const setChatOpen = useAppStore((s) => s.setChatOpen);

  // Atalhos (⌘K, ⌘⇧A, ícone do header) e a abertura automática ao editar.
  useAssistantTab();

  const { isAdmin } = useUserPermissions();

  const {
    reports: pages,
    loading: pagesLoading,
    rename: renamePage,
    remove: removePage,
    duplicate: duplicatePage,
  } = useReports(activeGroupId || null);

  const [newPageIn, setNewPageIn] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesGroupId, setTemplatesGroupId] = useState<string | null>(null);
  const [pageToTemplate, setPageToTemplate] = useState<Report | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

  /*
   * A store nasce com `activeGroupId: ''`. Sem este fallback a coluna ficaria
   * muda até alguém navegar — nas rotas que não são de relatório (admin, a
   * home enquanto resolve o redirect) não há nada que preencha o escopo.
   *
   * O relatório da URL vem ANTES do primeiro da lista. `/g/:id` já diz qual
   * relatório está na tela, e ignorá-lo fazia a coluna contradizer o conteúdo:
   * a IA criava um relatório e navegava, ou a pessoa dava refresh em
   * `/g/teste-x`, e a coluna voltava para o primeiro — "Teste X" no meio da tela
   * e Covenants na barra lateral. `groups[0]` é o último recurso, não o padrão.
   */
  useEffect(() => {
    if (groupsLoading || groups.length === 0) return;
    if (groups.some((g) => g.id === activeGroupId)) return;
    const fromUrl = /^\/g\/([^/]+)/.exec(pathname ?? '')?.[1];
    // Id da URL só manda se existir no cliente: link velho ou relatório
    // excluído em outra aba não pode virar escopo.
    const target = fromUrl && groups.some((g) => g.id === fromUrl) ? fromUrl : groups[0]!.id;
    setActiveGroup(target);
  }, [groups, groupsLoading, activeGroupId, setActiveGroup, pathname]);

  /*
   * Trocar de relatório abre a primeira página dele — ficar no relatório novo
   * com o conteúdo do anterior na tela seria um estado sem sentido.
   *
   * A navegação espera as páginas chegarem porque no clique elas ainda não
   * existem: `useReports` só refaz a busca depois que `activeGroupId` muda.
   */
  useEffect(() => {
    if (!pendingSwitch || pendingSwitch !== activeGroupId || pagesLoading) return;
    setPendingSwitch(null);
    const first = pages[0];
    // Sem página, o destino é o próprio relatório (`/g/:id`), que mostra o
    // vazio e oferece a criação. Ficar na rota anterior deixaria o conteúdo
    // do relatório antigo na tela sob o nome do novo.
    router.push(first ? `/g/${activeGroupId}/r/${first.id}` : `/g/${activeGroupId}`);
    if (first) setActiveReport(activeGroupId, first.id);
    onNavigate?.();
  }, [pendingSwitch, activeGroupId, pagesLoading, pages, setActiveReport, router, onNavigate]);

  /*
   * O vazio de `/g/:groupId` pede uma página nova por evento — o diálogo mora
   * aqui, junto do relatório em que ela vai cair, e não faria sentido existir
   * em dois lugares. Mesmo padrão de `toggle-ai-sidebar`.
   */
  useEffect(() => {
    const requested = () => { if (activeGroupId) setNewPageIn(activeGroupId); };
    window.addEventListener('new-page-request', requested);
    return () => window.removeEventListener('new-page-request', requested);
  }, [activeGroupId]);

  const openPage = (reportId: string) => {
    setActiveReport(activeGroupId, reportId);
    router.push(`/g/${activeGroupId}/r/${reportId}`);
    onNavigate?.();
  };

  const handleSwitchReport = (groupId: string) => {
    if (groupId === activeGroupId) return;
    setActiveGroup(groupId);
    setPendingSwitch(groupId);
  };

  const handleNewReport = () => {
    setPromptState({
      title: 'Novo relatório',
      defaultValue: '',
      confirmLabel: 'Criar',
      onConfirm: async (name) => {
        if (!name.trim()) return;
        try {
          const id = await createGroup(name.trim());
          setActiveGroup(id);
          /*
           * Navegar faz parte de criar. Sem isto a rota continuava na página do
           * relatório ANTERIOR: a coluna passava a mostrar o relatório novo e
           * vazio enquanto o meio da tela seguia exibindo os blocos do antigo —
           * duas afirmações contraditórias na mesma tela.
           */
          router.push(`/g/${id}`);
          onNavigate?.();
        } catch (err) {
          console.error('Failed to create report:', err);
        }
      },
    });
  };

  const handleRenameReport = (groupId: string, currentName: string) => {
    setPromptState({
      title: 'Renomear relatório',
      defaultValue: currentName,
      confirmLabel: 'Salvar',
      onConfirm: async (name) => {
        if (name === currentName || !name.trim()) return;
        try {
          await renameGroup(groupId, name.trim());
          renameInTrail({ groupId }, name.trim());
        } catch (err) {
          console.error('Failed to rename report:', err);
        }
      },
    });
  };

  const handleDeleteReport = (groupId: string, name: string) => {
    setConfirmState({
      title: `Excluir relatório "${name}"`,
      description: 'Todas as páginas dentro dele serão perdidas. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeGroup(groupId);
          bumpReportsList();
          if (groupId === activeGroupId) router.push('/dashboard');
        } catch (err) {
          console.error('Failed to delete report:', err);
        }
      },
    });
  };

  /** Página em branco dentro do relatório em foco. */
  const handleNewBlankPage = async () => {
    const gid = newPageIn;
    setNewPageIn(null);
    if (!gid) return;
    try {
      const rid = await createReportDoc(activeClientId, gid, 'Nova página');
      bumpReportsList();
      setActiveReport(gid, rid);
      router.push(`/g/${gid}/r/${rid}?edit=1`);
      onNavigate?.();
    } catch (err) {
      console.error('Failed to create page:', err);
    }
  };

  const handleImportClick = () => {
    const gid = newPageIn;
    setNewPageIn(null);
    if (!gid) return;
    setActiveGroup(gid);
    setTemplatesGroupId(gid);
    setTemplatesOpen(true);
    onNavigate?.();
  };

  return (
    <>
      <aside
        className={cn(
          /* `lg:pt-2` casa com a calha do painel (`lg:p-2` no wrapper do
             `main`): sem ela os dois começam 8px defasados e o `h-14` de
             cada lado alinha alturas iguais em linhas diferentes. O fundo
             continua sangrando até o topo — quem recua é o conteúdo. */
          'flex h-full shrink-0 flex-col bg-[var(--color-chrome)] lg:pt-2',
          /* 360px, e nao 240px: o assistente divide esta coluna com a lista
             e nao cabe em menos (ver a docstring do ChatSidebar). A largura e
             a MESMA nas duas abas de proposito — trocar de aba nao pode
             redesenhar os graficos do relatorio ao lado. */
          collapsed ? 'w-14' : 'w-[360px]',
          className,
        )}
      >
        {collapsed ? (
          <>
            {/* O trilho guarda a ORIENTAÇÃO: qual cliente e quais páginas o
                relatório em foco tem. O relatório em si não cabe num ícone —
                quem precisa trocar de escopo expande. */}
            <div className="flex h-14 shrink-0 items-center justify-center px-2">
              <button
                onClick={toggleNavCollapsed}
                title={`${activeClient?.name ?? 'Cliente'} — expandir menu`}
                aria-label="Expandir menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-[11px] font-bold text-black transition-opacity hover:opacity-80"
                style={activeClient ? { backgroundColor: activeClient.color } : undefined}
              >
                {activeClient?.initial ?? '—'}
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2" aria-label="Páginas">
              <ul className="flex flex-col items-center gap-1">
                {pages.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => openPage(p.id)}
                      title={p.name}
                      aria-label={p.name}
                      aria-current={p.id === activeReportId ? 'page' : undefined}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                        p.id === activeReportId
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground',
                      )}
                    >
                      <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {isAdmin && (
              <div className="shrink-0 p-2">
                <NavItem label="Administração" href="/admin" icon="Shield" collapsed onClick={onNavigate} />
              </div>
            )}
          </>
        ) : (
        <>
        {/* `h-14`: a MESMA altura do header, para o cliente nascer na linha
            da trilha. A coluna e o painel são superfícies irmãs — se o
            primeiro item de cada uma não se alinha, a tela inteira parece
            fora de esquadro. */}
        <div className="flex h-14 shrink-0 items-center px-2">
          <TopbarClientSwitcher variant="bloco" />
        </div>

        {/* O seletor de aba vem logo abaixo do cliente, e o escopo de cada
            aba fica DENTRO dela. Com o relatório acima daqui, a coluna dizia
            que ele governava as duas — e a lista que ele governava se chamava
            "Páginas", outro nome. O cliente fica de fora porque é o escopo
            das duas: some-lo ao abrir o assistente esconderia de quem se está
            falando. */}
        <div className="shrink-0 px-2 pb-2">
          <TabSelector
            tab={isShowingChat ? 'assistente' : 'relatorio'}
            onSwitch={(tab) => setChatOpen(tab === 'assistente')}
          />
        </div>

        {isShowingChat ? (
          /* O assistente ocupa o corpo da coluna. O seletor de agente cai no
             MESMO lugar do dropdown de relatório da outra aba — um por aba. */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-2 pb-2">
              <AgentPicker />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ChatContent />
            </div>
          </div>
        ) : (
        <>
        <div className="shrink-0 px-2 pb-2">
          <ReportSwitcher
            reports={groups}
            activeGroupId={activeGroupId}
            loading={groupsLoading}
            onSwitch={handleSwitchReport}
            onNew={handleNewReport}
            onRename={handleRenameReport}
            onDelete={handleDeleteReport}
          />
        </div>

        <div className="flex h-9 shrink-0 items-center gap-2 px-3">
          <h2 className="flex-1 truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Páginas
          </h2>
          <button
            onClick={() => activeGroupId && setNewPageIn(activeGroupId)}
            disabled={!activeGroupId}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
            aria-label="Nova página"
            title="Nova página"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Páginas do relatório">
          {pagesLoading ? (
            <div className="space-y-1" data-testid="pages-skeleton">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-7 animate-pulse rounded-md bg-muted/40" />
              ))}
            </div>
          ) : (
            <>
              {pages.length === 0 && groups.length > 0 && (
                <p className="px-2 py-1.5 text-[11px] italic text-muted-foreground/50">
                  Nenhuma página ainda
                </p>
              )}

              <ul className="space-y-0.5">
                {pages.map((p) => (
                  <li key={p.id}>
                    <PageListItem
                      name={p.name}
                      active={p.id === activeReportId}
                      onOpen={() => openPage(p.id)}
                      onRename={() =>
                        setPromptState({
                          title: 'Renomear página',
                          defaultValue: p.name,
                          confirmLabel: 'Salvar',
                          onConfirm: async (name) => {
                            if (name === p.name || !name.trim()) return;
                            try {
                              await renamePage(p.id, name.trim());
                              renameInTrail({ reportId: p.id }, name.trim());
                            } catch (err) {
                              console.error('Failed to rename page:', err);
                            }
                          },
                        })
                      }
                      onDuplicate={async () => {
                        try {
                          const id = await duplicatePage(p.id);
                          if (id) openPage(id);
                        } catch (err) {
                          console.error('Failed to duplicate page:', err);
                        }
                      }}
                      /* Publicar template é ação de admin — o catálogo é
                         compartilhado por todos os clientes. */
                      onSaveAsTemplate={isAdmin ? () => setPageToTemplate(p) : undefined}
                      onDelete={() =>
                        setConfirmState({
                          title: `Excluir página "${p.name}"`,
                          description: 'Esta ação não pode ser desfeita.',
                          confirmLabel: 'Excluir',
                          destructive: true,
                          onConfirm: async () => {
                            try {
                              await removePage(p.id);
                              // Só sai da rota se a página excluída for a aberta.
                              if (p.id === activeReportId) router.push('/dashboard');
                            } catch (err) {
                              console.error('Failed to delete page:', err);
                            }
                          },
                        })
                      }
                    />
                  </li>
                ))}
              </ul>

              {/*
               * Criar página também é uma linha da lista, e não só o `+` do
               * cabeçalho: o fim das páginas que existem é onde o olho já
               * está quando a pergunta aparece.
               */}
              {groups.length > 0 && (
                <button
                  onClick={() => activeGroupId && setNewPageIn(activeGroupId)}
                  className="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <Plus className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                  Nova página
                </button>
              )}
            </>
          )}
        </nav>

        {isAdmin && (
          <div className="shrink-0 px-2 py-2">
            <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Sistema
            </p>
            <NavItem label="Administração" href="/admin" icon="Shield" collapsed={false} onClick={onNavigate} />
          </div>
        )}
        </>
        )}
        </>
        )}
      </aside>

      {templatesGroupId && (
        <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <DialogContent className="!w-[1280px] !max-w-[95vw] gap-0 overflow-hidden border-border bg-popover p-0 text-foreground">
            <DialogHeader className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTemplatesOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <DialogTitle className="text-[15px] text-foreground">
                  Importar template
                </DialogTitle>
              </div>
            </DialogHeader>
            <TemplateGallery
              groupId={templatesGroupId}
              onClose={() => setTemplatesOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {pageToTemplate && (
        <SaveAsTemplateFromPage
          open
          onClose={() => setPageToTemplate(null)}
          page={{
            name: pageToTemplate.name,
            description: pageToTemplate.description,
            blockMap: pageToTemplate.blockMap ?? {},
            layout: pageToTemplate.layout ?? [],
            filters: pageToTemplate.filters,
            queries: pageToTemplate.queries,
            templateId: pageToTemplate.templateId,
            productRefs: pageToTemplate.productRefs,
          }}
          /* O template sai do documento salvo. Se a página aberta está em
             edição, o que está na tela ainda não é o que seria publicado. */
          pendingDraft={isEditingReport && pageToTemplate.id === activeReportId}
        />
      )}

      <NewPageDialog
        open={newPageIn !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setNewPageIn(null); }}
        onBlank={handleNewBlankPage}
        onTemplate={handleImportClick}
      />

      <PromptDialog
        open={!!promptState}
        title={promptState?.title ?? ''}
        defaultValue={promptState?.defaultValue}
        confirmLabel={promptState?.confirmLabel}
        onConfirm={(v) => { promptState?.onConfirm(v); setPromptState(null); }}
        onCancel={() => setPromptState(null)}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        destructive={confirmState?.destructive}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
}

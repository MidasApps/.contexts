'use client';

import { Menu, MessageSquare, ChevronRight, LayoutGrid, PanelLeft } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAppStore } from '@/shared/stores/app-store';
import { FiltersButton } from '@/shared/ui/filters-button';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { UserMenu } from './UserMenu';

/**
 * Header global: identidade da página à esquerda, sessão à direita.
 *
 * ─── Por que a trilha e não o seletor de cliente ───
 *
 * O cliente ativo ficava aqui e o header não dizia em que página a pessoa
 * estava — quem dizia era um título de 32px logo abaixo, dentro do conteúdo.
 * Duas coisas mudaram de lugar: o cliente subiu para o topo da coluna, onde
 * dá escopo aos relatórios que ele lista, e a identidade da página virou a
 * trilha `Relatório › Página` aqui. Nada foi duplicado: o título grande saiu
 * do conteúdo junto.
 *
 * À direita, na ordem em que se procura: Filtros, assistente, tema e conta.
 * O avatar é o último item, que é o canto onde ele é procurado. Quem agrupa
 * é o espaçamento — não há traço vertical nenhum: eles picotavam a linha em
 * blocos e competiam com a borda do painel que já contém tudo isto.
 */
export function AppHeader({ className }: { className?: string }) {
  const reportName = useAppStore((s) => s.currentGroupName);
  const pageTitle = useAppStore((s) => s.currentPageTitle);
  const isNavCollapsed = useAppStore((s) => s.isNavCollapsed);
  const toggleNavCollapsed = useAppStore((s) => s.toggleNavCollapsed);

  return (
    <header
      className={cn(
        /* Sem cor própria: o header é a primeira linha do painel de conteúdo,
           não uma faixa sobre ele. O respiro lateral é o MESMO do conteúdo
           (p-5 lg:p-8), para a trilha nascer alinhada com a borda esquerda do
           primeiro card. */
        'flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-5 lg:px-8',
        className,
      )}
    >
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-nav-sidebar'))}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {/* Recolher a coluna é decisão de tela, não de página — por isso mora no
          header, no mesmo lugar em qualquer rota. Abaixo de `lg` não existe:
          lá a coluna já é uma gaveta que se abre e se fecha inteira. */}
      <button
        onClick={toggleNavCollapsed}
        className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground lg:flex"
        aria-label={isNavCollapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-expanded={!isNavCollapsed}
        title={isNavCollapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {/* A trilha só aparece quando a rota se registrou. Um "Dashboard"
          genérico de espera piscaria em toda navegação.

          Relatório sem página escolhida (`/g/:id`, recém-criado) tem trilha de
          uma perna só — e nela o nome do relatório é o fim do caminho, não um
          degrau: por isso o peso muda conforme haja página ou não. */}
      {(reportName || pageTitle) && (
        <nav aria-label="Trilha de navegação" className="flex min-w-0 items-center gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
          {reportName && (
            <span
              className={cn(
                'max-w-[180px] truncate text-[13px]',
                pageTitle ? 'text-muted-foreground/70' : 'font-medium text-foreground',
              )}
            >
              {reportName}
            </span>
          )}
          {reportName && pageTitle && (
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
              strokeWidth={1.5}
            />
          )}
          {pageTitle && (
            <span className="max-w-[280px] truncate text-[13px] font-medium text-foreground">
              {pageTitle}
            </span>
          )}
        </nav>
      )}

      <div className="flex-1" />

      {/* Espaçamento é o que agrupa aqui — os traços verticais que separavam
          Filtros do resto picotavam a direita em blocos e competiam com a
          borda do painel. */}
      <FiltersButton />

      {/* Rótulo neutro de propósito: abaixo de `lg` este botão controla o
          Sheet de chat do DashboardLayout, não o `chatOpen` do store — um
          rótulo/aria-expanded amarrado a `chatOpen` estaria errado nesse
          breakpoint (anunciaria um estado que o botão não controla). */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-ai-sidebar'))}
        /* O chat flutuante fecha ao clique fora, no `mousedown`. Sem esta
           marca ele fecharia aqui e o `click` seguinte reabriria — o botão
           nunca conseguiria fechar. Ver ChatSidebar. */
        data-chat-toggle
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        aria-label="Assistente"
        title="Assistente"
      >
        <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>

      <ThemeToggle />

      <UserMenu />
    </header>
  );
}

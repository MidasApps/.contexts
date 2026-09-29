'use client';

import { cn } from '@/shared/lib/utils';
import { Switch } from '@/shared/ui/switch';
import {
  X, Settings2, FileDown, Loader2, Bug, UserCheck,
} from 'lucide-react';
import { useEffect, useEffectEvent, useRef } from 'react';
import { usePdfExport } from '@/shared/hooks/usePdfExport';
import { useAppStore } from '@/shared/stores/app-store';

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  pageTitle?: string;
}

/**
 * O painel só carrega o que vale para a página INTEIRA.
 *
 * Havia aqui mais sete controles — Empreendimentos e seis "filtros avançados"
 * (Rating, Elegibilidade, Faixa LTV, Faixa de Atraso, Tipo Proponente, Grupo
 * Repasse), com as opções escritas à mão no código. Nenhum deles filtrava: só
 * alcançavam a consulta pela via *ambient*, e o catálogo em produção não tem
 * uma métrica sequer que a use. Marcar "Rating A" não mexia em número nenhum.
 *
 * Filtro que recorta de verdade é o de PÁGINA, na `PageFilterBar`, criado por
 * quem pede — não pré-instalado em toda tela.
 *
 * O eixo do tempo (período, modo, comparação) mudou-se para a `PageToolbar`,
 * onde fica visível junto dos números que governa. Com ele foi embora a última
 * leitura do `DataProvider`: o painel não consulta mais o contexto de datas, e
 * por isso deixou de se esconder fora dele. O que restou — testar como usuário,
 * modo debug e exportar PDF — não é filtro, e o cabeçalho passou a dizer
 * "Ajustes" para não prometer que é.
 */
function TestAsUserToggle() {
  const testAsUser = useAppStore((s) => s.testAsUser);
  const setTestAsUser = useAppStore((s) => s.setTestAsUser);

  return (
    <div className={cn('rounded-xl border px-4 py-3', testAsUser ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/40')}>
      <div className="flex items-center gap-3">
        <UserCheck className="h-4 w-4 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
        <div className="flex-1">
          <p className="text-[12px] font-medium text-foreground">Testar como usuário</p>
          <p className="text-[10px] text-muted-foreground/60">Desativa o bypass de admin para testar permissões</p>
        </div>
        <Switch
          checked={testAsUser}
          onCheckedChange={setTestAsUser}
          aria-label="Testar como usuário"
        />
      </div>
    </div>
  );
}

function DebugModeToggle() {
  const debugMode = useAppStore((s) => s.debugMode);
  const setDebugMode = useAppStore((s) => s.setDebugMode);

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <Bug className="h-4 w-4 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
        <div className="flex-1">
          <p className="text-[12px] font-medium text-foreground">Modo debug</p>
          <p className="text-[10px] text-muted-foreground/60">Exibe SQL e código no chat AI</p>
        </div>
        <Switch
          checked={debugMode}
          onCheckedChange={setDebugMode}
          aria-label="Modo debug"
        />
      </div>
    </div>
  );
}

export function FilterPanel({ open, onClose, pageTitle }: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Os listeners de clique-fora e Esc chamam sempre o `onClose` mais recente
  // sem precisar re-registrar a cada render do pai.
  const onCloseEvent = useEffectEvent(onClose);

  // Fallback só quando `pageTitle` não é passado (AppHeader → FiltersButton,
  // que não conhece a página): lê o título que o PageHero registrou no
  // app-store. `pageTitle=""` explícito (GlobalFilters dentro do
  // CanvasPanel, em /explore) não tem PageHero por perto — mantém o
  // default 'Dashboard' sem tocar a store.
  const currentPageTitle = useAppStore((s) => s.currentPageTitle);
  const effectiveTitle = pageTitle !== undefined ? pageTitle : currentPageTitle;

  const { exportPdf, exporting } = usePdfExport({
    title: effectiveTitle || 'Dashboard',
  });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCloseEvent();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseEvent();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-[3px] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[400px] max-w-[92vw]',
          'flex flex-col',
          // Tokens, não literais: o painel precisa acompanhar light/dark como
          // o resto do conteúdo. `bg-background` é o mesmo que o Sheet do
          // projeto usa (shared/ui/sheet.tsx) para superfície de slide-over.
          'bg-background border-l border-border',
          'shadow-2xl',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex h-[64px] shrink-0 items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <span className="text-[13px] font-semibold text-foreground">Ajustes</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
              aria-label="Fechar configurações"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* O eixo do tempo — período, modo e comparação — vive na barra
              da página (`PageToolbar`), visível junto dos números que ele
              governa. Aqui ficou só o que não é filtro. */}
          {/* ── Geral ── */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-1">Geral</p>

            {/* Test as user + Debug mode */}
            <TestAsUserToggle />
            <DebugModeToggle />
          </div>

          {/* ── Ações ── */}
          <div className="space-y-2 pt-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-1">Ações</p>

            <button
              onClick={exportPdf}
              disabled={exporting}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[12px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors disabled:opacity-40"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <FileDown className="h-4 w-4" strokeWidth={1.5} />
              )}
              Exportar página em PDF
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

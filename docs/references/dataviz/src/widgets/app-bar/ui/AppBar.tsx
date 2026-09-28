'use client';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Menu, Pencil } from 'lucide-react';
import { ThemeToggle } from '@/shared/ui/theme-toggle';

interface AppBarProps {
  /** Page title shown in the header (e.g. "Visão Geral" or a page name) */
  pageTitle?: string;
  /** @deprecated Use pageTitle instead */
  title?: string;
  /** @deprecated grupos não são mais expostos na UI (modelo flat de páginas) */
  groupName?: string;
  /** @deprecated navegação/gerência de páginas vive na coluna fixa (PagesSidebar) */
  groupId?: string;
  onToggleSidebar?: () => void;
  className?: string;
  /** @deprecated AppBar now manages its own content. Children are ignored. */
  children?: React.ReactNode;
  /** Show edit button for reports */
  editable?: boolean;
  /** Currently in edit mode */
  editing?: boolean;
  /** Callbacks for edit mode */
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  /** Save in progress */
  saving?: boolean;
}

/**
 * Header enxuto usado só nas páginas de admin (sem `PageHero`): título da
 * página, botão de editar, controles de modo de edição (Salvar/Cancelar) e
 * alternador de tema. Sem chat de IA nessas rotas — não há lupa.
 *
 * Navegação e gerência de páginas (dropdown, Nova página, Importar template,
 * renomear/duplicar/excluir) foram absorvidas pela coluna fixa `PagesSidebar`.
 */
export function AppBar({
  pageTitle,
  title,
  onToggleSidebar,
  className,
  editable,
  editing,
  onEdit,
  onSave,
  onCancel,
  saving,
}: AppBarProps) {
  const displayTitle = pageTitle || title || 'Dashboard';

  return (
    <header className={cn('sticky top-0 z-20 shrink-0 bg-[var(--color-canvas)]', className)}>
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        {/* Mobile menu */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8 text-muted-foreground/80 hover:text-foreground hover:bg-muted/50"
          onClick={() => {
            if (onToggleSidebar) onToggleSidebar();
            else window.dispatchEvent(new CustomEvent('toggle-nav-sidebar'));
          }}
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate px-1.5 py-1 text-[14px] font-semibold text-foreground">
            {displayTitle}
          </span>

          {editable && !editing && (
            <button
              onClick={onEdit}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
              title="Editar página"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {editing && (
          <div className="flex items-center gap-1.5 ml-3">
            <span className="text-[10px] text-primary/70 font-medium px-2 py-0.5 rounded-full bg-primary/10">
              Editando
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Edit mode: Save/Cancel */}
        {editing && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onCancel}
              disabled={saving}
              className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}

'use client';

import { Check, ChevronDown, FolderPlus, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

/**
 * O seletor de relatório — irmão do seletor de cliente, logo abaixo dele.
 *
 * ─── Por que dropdown e não árvore ───
 *
 * A coluna listava os relatórios como nós expansíveis, cada um com as
 * próprias páginas dentro. Com dez relatórios isso vira dez nós e dez
 * subníveis competindo pela mesma altura de tela, e a página em que se está
 * fica soterrada. Um relatório de cada vez resolve: o dropdown troca o
 * ESCOPO, a lista abaixo mostra só as páginas DELE.
 *
 * As ações do relatório (criar, renomear, excluir) moram aqui dentro, depois
 * da lista, porque agem sempre sobre o relatório em foco — o mesmo que o
 * botão exibe.
 */
interface ReportSwitcherProps {
  reports: Array<{ id: string; name: string }>;
  activeGroupId: string;
  loading: boolean;
  onSwitch: (groupId: string) => void;
  onNew: () => void;
  onRename: (groupId: string, name: string) => void;
  onDelete: (groupId: string, name: string) => void;
}

export function ReportSwitcher({
  reports,
  activeGroupId,
  loading,
  onSwitch,
  onNew,
  onRename,
  onDelete,
}: ReportSwitcherProps) {
  if (loading) {
    return <div data-testid="report-switcher-skeleton" className="h-9 animate-pulse rounded-lg bg-muted/40" />;
  }

  if (reports.length === 0) {
    return (
      <button
        onClick={onNew}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-[11px] text-muted-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <FolderPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        Criar o primeiro relatório
      </button>
    );
  }

  const isActive = reports.find((r) => r.id === activeGroupId) ?? reports[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-left text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60"
          title={`Relatório: ${isActive.name}`}
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{isActive.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[224px] border-border bg-popover">
        {reports.map((r) => (
          <DropdownMenuItem
            key={r.id}
            onSelect={(e) => { e.preventDefault(); setTimeout(() => onSwitch(r.id), 0); }}
            className="text-[12px] text-foreground"
          >
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {r.id === isActive.id && <Check className="ml-2 h-3 w-3 shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setTimeout(onNew, 0); }}
          className="text-[12px] text-foreground"
        >
          <Plus className="mr-2 h-3 w-3" aria-hidden="true" /> Novo relatório
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setTimeout(() => onRename(isActive.id, isActive.name), 0); }}
          className="text-[12px] text-foreground"
        >
          <Pencil className="mr-2 h-3 w-3" aria-hidden="true" /> Renomear relatório
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setTimeout(() => onDelete(isActive.id, isActive.name), 0); }}
          variant="destructive"
          className="text-[12px]"
        >
          <Trash2 className="mr-2 h-3 w-3" aria-hidden="true" /> Excluir relatório
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

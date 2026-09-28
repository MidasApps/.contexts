'use client';

import { cn } from '@/shared/lib/utils';
import { MoreHorizontal, Pencil, Copy, Trash2, LayoutTemplate } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export interface PageListItemProps {
  name: string;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /**
   * Publica a página como Dashboard Template. Ausente = quem está vendo não
   * pode criar template — a permissão é expressa pela falta do callback, não
   * por uma flag aqui dentro.
   */
  onSaveAsTemplate?: () => void;
}

/**
 * Item da lista de páginas: abre ao clique e expõe renomear/duplicar/excluir
 * num menu que, a partir de `lg` (telas com hover), aparece só no hover ou
 * no foco por teclado; abaixo disso (touch, sem hover) ele fica sempre
 * visível. Apresentacional — quem decide o que cada ação faz é a
 * PagesSidebar.
 */
export function PageListItem({
  name,
  active,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onSaveAsTemplate,
}: PageListItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center rounded-md',
        active ? 'bg-muted/50' : 'hover:bg-muted/40',
      )}
    >
      <button
        onClick={onOpen}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
          // Sem isto sobra o anel PADRAO do navegador: um retangulo preto que
          // aparece sem teclado nenhum, porque o Radix devolve o foco por
          // codigo ao fechar o menu de acoes. `ring-ring` e o token de foco do
          // design system, o mesmo de todo <Button> do app.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          active
            ? 'text-foreground'
            : 'text-muted-foreground/80 group-hover:text-foreground',
        )}
      >
        {active && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Ações da página ${name}`}
            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100 max-lg:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px] border-border bg-popover">
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setTimeout(onRename, 0); }}
            className="text-[12px] text-foreground"
          >
            <Pencil className="mr-2 h-3 w-3" /> Renomear
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setTimeout(onDuplicate, 0); }}
            className="text-[12px] text-foreground"
          >
            <Copy className="mr-2 h-3 w-3" /> Duplicar
          </DropdownMenuItem>
          {onSaveAsTemplate && (
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); setTimeout(onSaveAsTemplate, 0); }}
              className="text-[12px] text-foreground"
            >
              <LayoutTemplate className="mr-2 h-3 w-3" /> Salvar como template
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setTimeout(onDelete, 0); }}
            variant="destructive"
            className="text-[12px]"
          >
            <Trash2 className="mr-2 h-3 w-3" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

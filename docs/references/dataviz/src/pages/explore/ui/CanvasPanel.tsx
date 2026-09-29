'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Sparkles, RefreshCw, Calendar, Building2, X } from 'lucide-react';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { useAppStore } from '@/shared/stores/app-store';
import { CanvasBlockRenderer } from './CanvasBlockRenderer';
import { SelectionBar } from './SelectionBar';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { GlobalFilters } from '@/widgets/global-filters';
import { BlockPalette } from './BlockPalette';
import { BlockInspector } from './BlockInspector';
import { BlockRail, RAIL_HEIGHT } from './BlockRail';
import { ColumnGuides } from './ColumnGuides';
import { GRID_CLASS, widthStyle } from './block-grid';
import { useResizeHandle } from './use-resize-handle';
import { widthOf, widthContextOf, blockSpec } from '@/features/report-authoring/schema/block-specs';
import { makeEmptyBlock } from '@/shared/config/agents/template-blocks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import type { CanvasBlock, CanvasPage } from '@/shared/config/agents/types';
import { serializeBlocks } from '@/shared/config/agents/types';

// ── Helpers ──

function getBlockName(block: CanvasBlock): string {
  switch (block.type) {
    case 'text': return 'Texto';
    case 'kpi': return block.label;
    case 'kpis': return 'KPIs';
    case 'chart': return block.title ?? 'Grafico';
    case 'table': return block.title ?? 'Tabela';
    default: return 'Bloco';
  }
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return null;
  const fmt = (d: string) => {
    const [y, m] = d.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[parseInt(m, 10) - 1]}/${y}`;
  };
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  if (start) return `A partir de ${fmt(start)}`;
  return `Ate ${fmt(end!)}`;
}

// ── Bloco no canvas: célula da grade + trilho de controles ──

function BlockCard({
  block,
  pageIndex,
  gradeRef,
  isDragTarget,
  dragSide,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave,
  onEditContent,
  onNudge,
  onResize,
}: {
  block: CanvasBlock;
  pageIndex: number;
  /** A grade de 6 colunas — o puxador mede a calha e o passo nela. */
  gradeRef: React.RefObject<HTMLDivElement | null>;
  isDragTarget: boolean;
  dragSide: 'left' | 'right' | 'top' | 'bottom' | null;
  isDragging: boolean;
  onDragStart: (blockId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  /** Presente ⇒ o lápis aparece. Ausente ⇒ não há edição manual de conteúdo. */
  onEditContent?: (blockId: string) => void;
  /** Setas na pega: troca de posição com o vizinho. */
  onNudge: (blockId: string, direction: -1 | 1) => void;
  onResize: (isResizing: boolean) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [railSide, setRailSide] = useState<'acima' | 'abaixo'>('acima');
  const cellRef = useRef<HTMLDivElement>(null);

  /*
   * De que lado o trilho cabe — decidido ao entrar o ponteiro, não no render.
   *
   * O canvas rola dentro de um `overflow-y-auto`, que RECORTA o que sai do seu
   * topo. Um bloco encostado no limite superior da rolagem perdia o trilho
   * inteiro: os controles existiam, com opacidade 1, e simplesmente não eram
   * pintados. Medir na entrada do ponteiro (e não a cada quadro) basta porque
   * a posição só muda com rolagem, e rolar já tira o ponteiro do bloco.
   */
  const decideSide = useCallback(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const scrollParent = cell.closest('[data-rolagem]');
    const limit = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
    const fitsAbove = cell.getBoundingClientRect().top - RAIL_HEIGHT >= limit;
    setRailSide(fitsAbove ? 'acima' : 'abaixo');
  }, []);

  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const deselectBlock = useCanvasStore((s) => s.deselectBlock);
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const updateBlockContent = useCanvasStore((s) => s.updateBlockContent);
  const isStreaming = useCanvasStore((s) => s.isStreaming);
  const metrics = useAppStore((s) => s.metrics) ?? [];

  const isSelected = selectedBlockIds.includes(block.id);
  const hasSelection = selectedBlockIds.length > 0;
  const selectionIndex = isSelected ? selectedBlockIds.indexOf(block.id) + 1 : null;

  const colSpan = block.colSpan ?? 1;
  const contract = widthOf(block.type, widthContextOf(block));
  /*
   * Bloco gravado abaixo do mínimo do contrato — template antigo, importação —
   * não é empurrado para cima só porque o mouse passou por cima. O piso da
   * régua vira a largura ATUAL: dá para crescer, não para encolher. Mudar
   * largura de bloco existente é decisão do usuário, não efeito colateral de
   * hover.
   */
  const range = { ...contract, min: Math.min(contract.min, colSpan) };

  const applyWidth = useCallback((columns: number) => {
    updateBlockContent(pageIndex, block.id, { colSpan: columns } as Partial<CanvasBlock>);
  }, [updateBlockContent, pageIndex, block.id]);

  const { preview, onPointerDown } = useResizeHandle({
    gradeRef,
    cellRef,
    range,
    width: colSpan,
    onRelease: applyWidth,
    onStateChange: onResize,
  });

  // Durante o arrasto do puxador a largura é local: o store só recebe o valor
  // final. Ver a docstring de `useResizeHandle`.
  const visualWidth = preview ?? colSpan;
  const showsRail = isHovered || isSelected || preview !== null;

  return (
    <>
      <div
        ref={cellRef}
        onMouseEnter={() => { setIsHovered(true); decideSide(); }}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        style={widthStyle(visualWidth)}
        /*
         * `h-full` aqui e no invólucro do conteúdo, e não por decoração: é o
         * que fazia a edição desalinhar em relação à leitura.
         *
         * A corrente de altura precisa ser contínua da célula do grid até o
         * card. Em leitura ela é: item do grid (esticado pelo grid, altura
         * definida) → `WithFamilyFloor` com `h-full` → `BlockCard` com
         * `h-full`. Aqui faltavam os dois elos do meio — este `div` e o de
         * baixo. Sem altura definida no pai, o `h-full` de `WithFamilyFloor`
         * resolve como `auto`, e sobra só o `min-height` da família: a CÉLULA
         * media os 172px do degrau e o CARD desenhava os 150px do conteúdo.
         *
         * O efeito visível era a queixa: 22px de vazio embaixo de cada
         * indicador, o que faz a calha entre as linhas parecer 38px onde as
         * colunas mostram 16px — e cards da mesma linha terminando em alturas
         * diferentes (150 e 158) porque cada um parava no próprio conteúdo.
         */
        className={cn(
          'group relative h-full before:content-[""] before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 transition-all duration-200',
          showsRail && 'z-20',
          /*
           * A junta com o chapéu: o card perde o raio do lado onde o trilho
           * encosta, senão ele curva para dentro embaixo de uma peça de canto
           * reto e sobra um degrau de 16px em cada ponta.
           *
           * `[data-casca]` e não `.rounded-2xl`: a casca é desenhada em vários
           * lugares (`block-shell`, `ChartWidget`, `KpiCard`, `GhostBlock`) e o seletor
           * por classe pegaria junto todo `rounded-2xl` ANINHADO — os cards de
           * legenda de um donut, por exemplo. O atributo é o gancho declarado
           * para isto; ver a nota no `BlockCard` de `block-shell`.
           */
          showsRail && (railSide === 'acima'
            ? '[&_[data-casca]]:rounded-t-none'
            : '[&_[data-casca]]:rounded-b-none'),
          // `rounded-2xl` para casar com o raio do card: em `rounded-lg` o anel
          // cortava os cantos do bloco que ele deveria contornar.
          isSelected && 'rounded-2xl ring-1 ring-primary/40',
          isDragging && 'opacity-30',
          isDragTarget && dragSide === 'left' && 'border-l-[3px] border-l-[#3b82f6]',
          isDragTarget && dragSide === 'right' && 'border-r-[3px] border-r-[#3b82f6]',
          isDragTarget && dragSide === 'top' && 'border-t-[3px] border-t-[#3b82f6]',
          isDragTarget && dragSide === 'bottom' && 'border-b-[3px] border-b-[#3b82f6]',
        )}
      >
        <BlockRail
          block={block}
          metrics={metrics}
          side={railSide}
          visible={showsRail}
          selected={isSelected}
          selectionPosition={selectionIndex}
          width={visualWidth}
          range={range}
          widthRationale={blockSpec(block.type).widthRationale}
          draggable={!isStreaming}
          onToggleSelection={() => (isSelected ? deselectBlock(block.id) : selectBlock(block.id))}
          onEditContent={onEditContent ? () => onEditContent(block.id) : undefined}
          onDelete={() => setShowDeleteModal(true)}
          onChooseWidth={applyWidth}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
            // A miniatura arrastada é o BLOCO, e não o botão da pega: arrastar
            // um retângulo de 24px não diz o que está sendo movido.
            if (cellRef.current) {
              const r = cellRef.current.getBoundingClientRect();
              e.dataTransfer.setDragImage(cellRef.current, r.width / 2, 24);
            }
            onDragStart(block.id);
          }}
          onDragEnd={onDragEnd}
          onNudge={(direction) => onNudge(block.id, direction)}
        />

        {/*
          O puxador é atalho de PONTEIRO: quem redimensiona por teclado é a
          régua do trilho, que é um slider de verdade. Daí o `aria-hidden` —
          duplicar a função na navegação sequencial só faria o Tab passar duas
          vezes pela mesma coisa.
        */}
        <span
          aria-hidden="true"
          onPointerDown={isStreaming ? undefined : onPointerDown}
          className={cn(
            'absolute -right-[3px] bottom-[34%] top-[34%] z-30 w-1 rounded-full bg-primary transition-opacity',
            // A opacidade de repouso vem do ESTADO, não de `group-hover:`:
            // duas variantes de mesma especificidade dependeriam da ordem em
            // que o Tailwind emite as regras para decidir quem vence.
            isStreaming ? 'hidden' : 'cursor-col-resize hover:opacity-100',
            preview !== null ? 'opacity-100' : showsRail ? 'opacity-35' : 'opacity-0',
          )}
        />

        {/* Block content — `h-full` é o segundo elo da corrente de altura
            explicada acima. */}
        <div className={cn('h-full', hasSelection && !isSelected && 'opacity-50 transition-opacity duration-200')}>
          <CanvasBlockRenderer block={block} />
        </div>
      </div>

      {showDeleteModal && (
        <DeleteConfirmModal
          blockName={getBlockName(block)}
          onConfirm={() => { removeBlock(pageIndex, block.id); setShowDeleteModal(false); }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}

// ── Page header ──

function PageHeader({ page }: { page: CanvasPage }) {
  const hasFilters = page.filters && (
    (page.filters.dateRange?.start || page.filters.dateRange?.end) ||
    (page.filters.projetos && page.filters.projetos.length > 0)
  );

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        {page.description && (
          <p className="text-sm text-muted-foreground">{page.description}</p>
        )}
      </div>
      {hasFilters && (
        <div className="flex items-center gap-2 shrink-0">
          {page.filters?.dateRange && (page.filters.dateRange.start || page.filters.dateRange.end) && (
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" strokeWidth={1.5} />
              {formatDateRange(page.filters.dateRange.start, page.filters.dateRange.end)}
            </span>
          )}
          {page.filters?.projetos && page.filters.projetos.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
              <Building2 className="h-3 w-3" strokeWidth={1.5} />
              {page.filters.projetos.length === 1
                ? page.filters.projetos[0]
                : `${page.filters.projetos.length} projetos`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page Tab ──

function PageTab({
  page,
  index,
  isActive,
  totalPages,
  isDraggedOver,
  dropSide,
  onActivate,
  onRename,
  onDelete,
}: {
  page: CanvasPage;
  index: number;
  isActive: boolean;
  totalPages: number;
  isDraggedOver: boolean;
  dropSide: 'left' | 'right' | null;
  onActivate: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(page.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== page.title) onRename(trimmed);
    else setEditValue(page.title);
    setEditing(false);
  };

  return (
    <div
      draggable={!editing}
      data-tab-index={index}
      onClick={onActivate}
      onDoubleClick={() => { setEditValue(page.title); setEditing(true); }}
      className={cn(
        'group relative flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer select-none',
        isActive ? 'text-foreground' : 'text-muted-foreground/80 hover:text-foreground',
      )}
    >
      {/* Drop indicator */}
      {isDraggedOver && dropSide === 'left' && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[#3b82f6]" />
      )}
      {isDraggedOver && dropSide === 'right' && (
        <span className="absolute right-0 top-1 bottom-1 w-0.5 rounded-full bg-[#3b82f6]" />
      )}

      {/* Hidden measurer — always rendered to size the input */}
      <span ref={measureRef} className="invisible absolute whitespace-pre text-xs font-medium">
        {editValue || ' '}
      </span>

      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setEditValue(page.title); setEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ width: measureRef.current ? measureRef.current.offsetWidth + 4 : undefined }}
          className="bg-transparent border-b border-border outline-none text-xs text-foreground py-0"
        />
      ) : (
        <span>{page.title}</span>
      )}

      {/* Delete button — only show if more than 1 page */}
      {totalPages > 1 && !editing && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
          className="ml-1 opacity-0 group-hover:opacity-100 flex h-4 w-4 items-center justify-center rounded transition-all text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
        >
          <X className="h-2.5 w-2.5" strokeWidth={2} />
        </button>
      )}

      {isActive && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
      )}

      {confirmingDelete && (
        <DeleteConfirmModal
          blockName={`a página "${page.title}"`}
          onConfirm={() => { setConfirmingDelete(false); onDelete(); }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

// ── Tab strip with drag reorder ──

function PageTabStrip({
  pages,
  activePage,
  setActivePage,
  renamePage,
  deletePage,
  reorderPages,
}: {
  pages: CanvasPage[];
  activePage: number;
  setActivePage: (i: number) => void;
  renamePage: (i: number, title: string) => void;
  deletePage: (i: number) => void;
  reorderPages: (from: number, to: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; side: 'left' | 'right' } | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const tabEl = (e.target as HTMLElement).closest('[data-tab-index]');
    if (!tabEl) return;
    const idx = Number(tabEl.getAttribute('data-tab-index'));
    setDragFrom(idx);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const tabEl = (e.target as HTMLElement).closest('[data-tab-index]') as HTMLElement | null;
    if (!tabEl) { setDropTarget(null); return; }

    const idx = Number(tabEl.getAttribute('data-tab-index'));
    if (idx === dragFrom) { setDropTarget(null); return; }

    const rect = tabEl.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const side = e.clientX < midX ? 'left' : 'right';
    setDropTarget({ index: idx, side });
  }, [dragFrom]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dragFrom === null || !dropTarget) { setDragFrom(null); setDropTarget(null); return; }

    let toIndex = dropTarget.side === 'left' ? dropTarget.index : dropTarget.index + 1;
    // Adjust for removal shift
    if (dragFrom < toIndex) toIndex--;

    if (toIndex !== dragFrom) {
      reorderPages(dragFrom, toIndex);
    }

    setDragFrom(null);
    setDropTarget(null);
  }, [dragFrom, dropTarget, reorderPages]);

  const handleDragEnd = useCallback(() => {
    setDragFrom(null);
    setDropTarget(null);
  }, []);

  return (
    <div
      className="shrink-0 flex items-center gap-1 border-b border-border px-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      {pages.map((page, i) => (
        <PageTab
          key={page.id}
          page={page}
          index={i}
          isActive={i === activePage}
          totalPages={pages.length}
          isDraggedOver={dropTarget?.index === i}
          dropSide={dropTarget?.index === i ? dropTarget.side : null}
          onActivate={() => setActivePage(i)}
          onRename={(title) => renamePage(i, title)}
          onDelete={() => deletePage(i)}
        />
      ))}
    </div>
  );
}

// ── Main component ──

export function CanvasPanel({
  authoring = false,
  showFilters = true,
  editBlocks = authoring,
}: {
  /** Editor de templates do admin: paleta de blocos no lugar dos filtros. */
  authoring?: boolean;
  showFilters?: boolean;
  /**
   * Lápis de "editar conteúdo" em cada bloco, abrindo o BlockInspector.
   *
   * Separado de `authoring` porque as duas coisas eram a mesma prop, e o
   * relatório não podia ganhar o inspetor sem herdar junto a paleta de blocos
   * e a supressão do aviso de filtros — que ali não fazem sentido. Default
   * segue `authoring`, então o editor de templates não muda.
   */
  editBlocks?: boolean;
} = {}) {
  const pages = useCanvasStore((s) => s.pages);
  const activePage = useCanvasStore((s) => s.activePage);
  const setActivePage = useCanvasStore((s) => s.setActivePage);
  const renamePage = useCanvasStore((s) => s.renamePage);
  const deletePage = useCanvasStore((s) => s.deletePage);
  const reorderPages = useCanvasStore((s) => s.reorderPages);
  const filtersStale = useCanvasStore((s) => s.filtersStale);
  const setFiltersStale = useCanvasStore((s) => s.setFiltersStale);
  const moveBlock = useCanvasStore((s) => s.moveBlock);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const updateBlockContent = useCanvasStore((s) => s.updateBlockContent);
  const [inspectingId, setInspectingId] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ blockId: string; side: 'left' | 'right' | 'top' | 'bottom' } | null>(null);
  // As guias de coluna são da GRADE, não do bloco: quem as liga é o puxador de
  // um bloco, mas quem as desenha precisa cobrir todas as colunas.
  const [isResizing, setIsResizing] = useState(false);
  const gradeRef = useRef<HTMLDivElement>(null);

  const hasBlocks = pages.some((p) => p.layout.length > 0 || Object.keys(p.blockMap).length > 0);
  const currentPage = pages[activePage];

  // A store troca a página por um objeto novo a cada mudança, então a
  // identidade de `currentPage` basta como chave — e `nudgeBlock` para de
  // ser recriado em todo render.
  const blocks = useMemo(
    () => (currentPage ? serializeBlocks(currentPage) : []),
    [currentPage],
  );

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent, targetBlockId: string) => {
    if (!draggedId || draggedId === targetBlockId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xRatio = x / rect.width;
    const yRatio = y / rect.height;

    // Determine drop side based on mouse position
    let side: 'left' | 'right' | 'top' | 'bottom';
    if (yRatio < 0.25) side = 'top';
    else if (yRatio > 0.75) side = 'bottom';
    else if (xRatio < 0.5) side = 'left';
    else side = 'right';

    setDropTarget({ blockId: targetBlockId, side });
  }, [draggedId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedId || !dropTarget) return;

    const position = dropTarget.side === 'left' ? 'left' as const
      : dropTarget.side === 'right' ? 'right' as const
      : dropTarget.side === 'top' ? 'before' as const
      : 'after' as const;

    moveBlock(activePage, draggedId, dropTarget.blockId, position);
    setDraggedId(null);
    setDropTarget(null);
  }, [draggedId, dropTarget, moveBlock, activePage]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  /*
   * Setas na pega do trilho: troca de posição com o vizinho.
   *
   * Mora aqui, e não no bloco, porque só quem monta a grade sabe quem é o
   * vizinho. Antes disto não havia forma nenhuma de reordenar sem mouse — a
   * alça era um `<div draggable>`, e `draggable` não tem equivalente de
   * teclado.
   */
  const nudgeBlock = useCallback((blockId: string, direction: -1 | 1) => {
    const ordem = blocks.map((b) => b.id);
    const fromHere = ordem.indexOf(blockId);
    const neighbor = ordem[fromHere + direction];
    if (fromHere === -1 || !neighbor) return;
    moveBlock(activePage, blockId, neighbor, direction === -1 ? 'left' : 'right');
  }, [blocks, activePage, moveBlock]);

  if (pages.length === 0 || !hasBlocks) {
    return (
      <div className="flex h-full flex-col">
        {(authoring || showFilters) && (
          <div className="shrink-0 border-b border-border px-6 py-3">
            {authoring ? (
              <BlockPalette onAdd={(type) => addBlock(activePage, makeEmptyBlock(type))} />
            ) : (
              <GlobalFilters pageTitle="" />
            )}
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {authoring ? 'Template vazio' : 'Comece perguntando algo ao assistente'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {authoring ? 'Use "Adicionar bloco" acima para compor o template.' : 'Os resultados aparecerao aqui como blocos visuais.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filters bar */}
      {(authoring || showFilters) && (
        <div className="shrink-0 border-b border-border px-6 py-3">
          {authoring ? (
            <BlockPalette onAdd={(type) => addBlock(activePage, makeEmptyBlock(type))} />
          ) : (
            <GlobalFilters pageTitle="" />
          )}
        </div>
      )}

      {/* Page tabs */}
      {pages.length >= 1 && (
        <PageTabStrip
          pages={pages}
          activePage={activePage}
          setActivePage={setActivePage}
          renamePage={renamePage}
          deletePage={deletePage}
          reorderPages={reorderPages}
        />
      )}

      {/* Page content */}
      {/* `data-rolagem`: é este limite que o trilho do bloco consulta para
          decidir se vira para baixo — ver `decideSide`. */}
      <div data-rolagem className="flex-1 overflow-y-auto">
        {!authoring && filtersStale && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mx-6 mt-6">
            <RefreshCw className="h-4 w-4 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200">Os filtros foram alterados</p>
              <p className="text-xs text-amber-200/60">
                Peca ao assistente para atualizar a analise, ou digite &quot;atualizar&quot; no chat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersStale(false)}
              className="shrink-0 text-amber-400/50 hover:text-amber-400/80 transition-colors"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {currentPage && (
          <div className="p-6 space-y-2">
            <PageHeader page={currentPage} />

            {/*
              O invólucro relativo existe para as guias de coluna: elas cobrem a
              grade inteira e precisam de um pai posicionado que NÃO seja a
              própria grade — filho absoluto de um grid vira item do grid.
            */}
            <div className="relative">
              {/* A MESMA grade da leitura — ver `block-grid.ts`. */}
              <div ref={gradeRef} className={GRID_CLASS}>
                {blocks.map((block) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    pageIndex={activePage}
                    gradeRef={gradeRef}
                    isDragTarget={dropTarget?.blockId === block.id}
                    dragSide={dropTarget?.blockId === block.id ? dropTarget.side : null}
                    isDragging={draggedId === block.id}
                    onDragStart={setDraggedId}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, block.id)}
                    onDrop={handleDrop}
                    onDragLeave={() => setDropTarget(null)}
                    onEditContent={editBlocks ? (id) => setInspectingId(id) : undefined}
                    onNudge={nudgeBlock}
                    onResize={setIsResizing}
                  />
                ))}
              </div>
              {isResizing && <ColumnGuides />}
            </div>

            <SelectionBar />
          </div>
        )}
      </div>

      {editBlocks && inspectingId && currentPage?.blockMap[inspectingId] && (
        <Dialog open onOpenChange={(v) => { if (!v) setInspectingId(null); }}>
          {/* `2xl`: o inspetor passou a duas colunas, e um bloco de gráfico
              chega a quinze campos — em 448px cada coluna teria ~200px. */}
          <DialogContent className="bg-popover border-border text-foreground sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar bloco</DialogTitle>
            </DialogHeader>
            <BlockInspector
              block={currentPage.blockMap[inspectingId]}
              // Fora do editor de templates a amarração com a métrica é só de
              // leitura — ver a docstring de `bindingEditable`.
              bindingEditable={authoring}
              onChange={(updates) => updateBlockContent(activePage, inspectingId, updates)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

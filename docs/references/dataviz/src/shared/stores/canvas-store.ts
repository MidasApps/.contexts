import { create } from 'zustand';
import type { CanvasBlock, CanvasPage, CanvasPageContext, CanvasPageFilters, CanvasRow } from '@/shared/config/agents/types';
import { migratePage, serializeBlocks } from '@/shared/config/agents/types';

/*
 * O encaixe de linha mede em colunas do grid de 6, vindas do contrato de bloco.
 *
 * Havia aqui uma tabela `MIN_SLOTS` própria (`table: 2, kpis: 2, chart: 1, …`)
 * contra um `SLOTS_POR_LINHA = 3` — uma terceira régua, diferente da do renderer
 * (`grid-cols-6`) e da das tools de autoria. Ela não tinha entrada para `kpi`,
 * `donut` nem `gauge`, que caíam no default 1, e era justamente nos três que 1/6
 * não cabe. Largura de bloco agora se decide num lugar só.
 */
import { fitsInRow, blockWidth } from '@/features/report-authoring/schema/block-specs';

interface CanvasStore {
  sessionId: string | null;
  conversationId: string | null;
  pages: CanvasPage[];
  activePage: number;
  isStreaming: boolean;
  filtersStale: boolean;
  selectedBlockIds: string[];

  setConversationId: (id: string | null) => void;
  createPage: (title: string, description?: string, filters?: CanvasPageFilters) => number;
  addBlock: (pageIndex: number, block: CanvasBlock, position?: number) => void;
  removeBlock: (pageIndex: number, blockId: string) => void;
  moveBlock: (pageIndex: number, blockId: string, targetBlockId: string, position: 'before' | 'after' | 'left' | 'right') => void;
  updateBlockContent: (pageIndex: number, blockId: string, updates: Partial<CanvasBlock>) => void;
  replaceBlock: (pageIndex: number, slotId: string, block: CanvasBlock) => void;
  selectBlock: (blockId: string) => void;
  deselectBlock: (blockId: string) => void;
  clearSelection: () => void;
  renamePage: (pageIndex: number, title: string) => void;
  deletePage: (pageIndex: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  setActivePage: (index: number) => void;
  setStreaming: (streaming: boolean) => void;
  setFiltersStale: (stale: boolean) => void;
  loadPages: (pages: CanvasPage[]) => void;
  reset: () => void;
  getActivePage: () => CanvasPage | null;
  getPagesContext: () => CanvasPageContext[];
  getPageBlocks: (pageIndex: number) => CanvasBlock[];
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  sessionId: null,
  conversationId: null,
  pages: [],
  activePage: 0,
  isStreaming: false,
  filtersStale: false,
  selectedBlockIds: [],

  setConversationId: (conversationId) => set({ conversationId }),

  createPage: (title, description, filters) => {
    const id = crypto.randomUUID();
    const newPage: CanvasPage = { id, title, description, blockMap: {}, layout: [], filters };
    set((state) => {
      const pages = [...state.pages, newPage];
      return { pages, activePage: pages.length - 1 };
    });
    return get().pages.length - 1;
  },

  addBlock: (pageIndex, block, position) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page) return state;

      const blockMap = { ...page.blockMap, [block.id]: block };
      const layout = [...page.layout];

      // Posição explícita é escolha de quem chamou: linha própria, onde pediu.
      if (position !== undefined && position >= 0 && position <= layout.length) {
        layout.splice(position, 0, { id: crypto.randomUUID(), blockIds: [block.id] });
        pages[pageIndex] = { ...page, blockMap, layout };
        return { pages };
      }

      /*
       * Sem posição, o bloco tenta caber na última linha antes de abrir outra.
       *
       * `addBlock` SEMPRE abria linha nova, então cada bloco virava uma linha de
       * um card só — página em coluna única, com o resto da linha vazio ao lado.
       * Passava despercebido enquanto blocos só nasciam de template (que traz o
       * layout pronto); o assistente criando bloco a bloco pôs isso na tela.
       */
      const widthOf = (b: CanvasBlock | undefined) => (b ? blockWidth(b) : 1);
      const lastRow = layout.at(-1);
      const usedWidth = lastRow
        ? lastRow.blockIds.reduce((sum, id) => sum + widthOf(blockMap[id]), 0)
        : 0;

      if (lastRow && fitsInRow(usedWidth, widthOf(block))) {
        layout[layout.length - 1] = { ...lastRow, blockIds: [...lastRow.blockIds, block.id] };
      } else {
        layout.push({ id: crypto.randomUUID(), blockIds: [block.id] });
      }

      pages[pageIndex] = { ...page, blockMap, layout };
      return { pages };
    });
  },

  removeBlock: (pageIndex, blockId) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page) return state;

      const blockMap = { ...page.blockMap };
      delete blockMap[blockId];

      const layout = page.layout
        .map((row) => ({
          ...row,
          blockIds: row.blockIds.filter((id) => id !== blockId),
        }))
        .filter((row) => row.blockIds.length > 0);

      const selectedBlockIds = state.selectedBlockIds.filter((id) => id !== blockId);

      pages[pageIndex] = { ...page, blockMap, layout };
      return { pages, selectedBlockIds };
    });
  },

  moveBlock: (pageIndex, blockId, targetBlockId, position) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page) return state;

      const block = page.blockMap[blockId];
      const targetBlock = page.blockMap[targetBlockId];
      if (!block || !targetBlock) return state;

      // Find target row
      const targetRowIndex = page.layout.findIndex((r) => r.blockIds.includes(targetBlockId));
      if (targetRowIndex === -1) return state;

      // Normalize position: left/right → same row placement, before/after → new row
      const isSameRow = position === 'left' || position === 'right';
      const normalizedPosition = (position === 'left' || position === 'before') ? 'before' : 'after';

      // Remove block from its current row first
      let layout = page.layout.map((row) => ({
        ...row,
        blockIds: row.blockIds.filter((id) => id !== blockId),
      }));

      // Recalculate target row after removal (block might have been in same row)
      const updatedTargetRow = layout[targetRowIndex];
      if (!updatedTargetRow) return state;
      const updatedTargetIndex = updatedTargetRow.blockIds.indexOf(targetBlockId);

      /*
       * Mede o encaixe DEPOIS de tirar o bloco da linha de origem, para não
       * contá-lo duas vezes quando origem e destino são a mesma linha.
       *
       * Media por uma tabela de tipo (`getMinSlots`) e ignorava o `colSpan`, que
       * é o que o grid de fato usa: três gráficos de `colSpan: 6` "cabiam" na
       * mesma linha (1+1+1 = 3) e o CSS os empilhava. Agora usa a mesma régua do
       * `addBlock` e do renderer.
       */
      const widthInRow = (id: string) => {
        const b = page.blockMap[id];
        return b ? blockWidth(b) : 1;
      };
      const usedInTarget = updatedTargetRow.blockIds.reduce(
        (sum, id) => sum + widthInRow(id),
        0,
      );
      const canFitInRow = fitsInRow(usedInTarget, blockWidth(block));

      if (isSameRow && canFitInRow && updatedTargetRow.blockIds.length > 0) {
        // Insert into same row as target
        const insertIndex = normalizedPosition === 'before' ? updatedTargetIndex : updatedTargetIndex + 1;
        const newBlockIds = [...updatedTargetRow.blockIds];
        newBlockIds.splice(insertIndex, 0, blockId);
        layout[targetRowIndex] = { ...updatedTargetRow, blockIds: newBlockIds };
      } else {
        // Create a new row before or after the target row
        const newRow: CanvasRow = { id: crypto.randomUUID(), blockIds: [blockId] };
        const insertRowIndex = normalizedPosition === 'before' ? targetRowIndex : targetRowIndex + 1;
        layout.splice(insertRowIndex, 0, newRow);
      }

      // Clean empty rows
      layout = layout.filter((row) => row.blockIds.length > 0);

      pages[pageIndex] = { ...page, layout };
      return { pages };
    });
  },

  updateBlockContent: (pageIndex, blockId, updates) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page || !page.blockMap[blockId]) return state;

      /*
       * Update parcial não constrói bloco de outro tipo.
       *
       * As tools `update_*_block` carregam o `type` no payload. Aplicada ao
       * bloco errado — a IA erra o alvo quando não conhece os tipos da página
       * — a mesclagem rasa produzia um híbrido: um "chart" com os campos de um
       * KPI e sem `data`/`dataKeys`, que não existe em lugar nenhum do
       * domínio. Converter tipo é `replaceBlock`, com o bloco inteiro.
       */
      const currentType = page.blockMap[blockId].type;
      if (updates.type && updates.type !== currentType) {
        console.warn(
          `[canvas-store] update ignorado: bloco "${blockId}" é do tipo "${currentType}", `
          + `e o update pedia "${updates.type}". Trocar de tipo exige recriar o bloco.`,
        );
        return state;
      }

      const blockMap = {
        ...page.blockMap,
        [blockId]: { ...page.blockMap[blockId], ...updates } as CanvasBlock,
      };

      pages[pageIndex] = { ...page, blockMap };
      return { pages };
    });
  },

  replaceBlock: (pageIndex, slotId, block) => {
    set((state) => {
      const page = state.pages[pageIndex];
      if (!page || !page.blockMap[slotId]) return state;
      const existing = page.blockMap[slotId];
      // Preserve the current colSpan if the new block doesn't specify one
      const colSpan = block.colSpan ?? existing.colSpan;
      const pages = [...state.pages];
      pages[pageIndex] = {
        ...page,
        blockMap: { ...page.blockMap, [slotId]: { ...block, id: slotId, colSpan } },
      };
      return { pages };
    });
  },

  selectBlock: (blockId) => {
    set((state) => {
      if (state.selectedBlockIds.includes(blockId)) return state;
      return { selectedBlockIds: [...state.selectedBlockIds, blockId] };
    });
  },

  deselectBlock: (blockId) => {
    set((state) => ({
      selectedBlockIds: state.selectedBlockIds.filter((id) => id !== blockId),
    }));
  },

  clearSelection: () => set({ selectedBlockIds: [] }),

  renamePage: (pageIndex, title) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page) return state;
      pages[pageIndex] = { ...page, title };
      return { pages };
    });
  },

  deletePage: (pageIndex) => {
    set((state) => {
      const pages = state.pages.filter((_, i) => i !== pageIndex);
      if (pages.length === 0) return state;
      const activePage = Math.min(state.activePage, pages.length - 1);
      return { pages, activePage, selectedBlockIds: [] };
    });
  },

  reorderPages: (fromIndex, toIndex) => {
    set((state) => {
      const pages = [...state.pages];
      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, moved);
      let activePage = state.activePage;
      if (activePage === fromIndex) activePage = toIndex;
      else if (fromIndex < activePage && toIndex >= activePage) activePage--;
      else if (fromIndex > activePage && toIndex <= activePage) activePage++;
      return { pages, activePage };
    });
  },

  setActivePage: (index) => set({ activePage: index, selectedBlockIds: [] }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setFiltersStale: (filtersStale) => set({ filtersStale }),

  loadPages: (pages) => set({
    pages: pages.map((p) => migratePage(p as Parameters<typeof migratePage>[0])),
    activePage: 0,
  }),

  reset: () => set({
    sessionId: null,
    conversationId: null,
    pages: [],
    activePage: 0,
    isStreaming: false,
    filtersStale: false,
    selectedBlockIds: [],
  }),

  getActivePage: () => {
    const { pages, activePage } = get();
    return pages[activePage] ?? null;
  },

  getPagesContext: () => {
    return get().pages.map((p) => {
      const blocks = serializeBlocks(p);
      return {
        id: p.id,
        title: p.title,
        blocks: blocks.map((b) => {
          const base: { id: string; type: string; title?: string; label?: string; metrics?: string[]; columns?: string[] } = {
            id: b.id,
            type: b.type,
          };
          switch (b.type) {
            case 'kpi':
              base.label = b.label;
              base.title = b.value;
              break;
            case 'kpis':
              base.metrics = b.items?.map((it) => it.label) ?? [];
              break;
            case 'chart':
              base.title = b.title;
              base.metrics = b.dataKeys;
              break;
            case 'table':
              base.title = b.title;
              base.columns = b.columns?.map((c) => c.header) ?? [];
              break;
            case 'text':
              base.title = b.content?.slice(0, 60);
              break;
          }
          return base;
        }),
        layout: p.layout.map((row, i) => ({
          rowIndex: i,
          blockIds: row.blockIds,
        })),
      };
    });
  },

  getPageBlocks: (pageIndex) => {
    const page = get().pages[pageIndex];
    if (!page) return [];
    return serializeBlocks(page);
  },
}));

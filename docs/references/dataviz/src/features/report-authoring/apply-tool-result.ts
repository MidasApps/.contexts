import type { CanvasBlock } from '@/shared/config/agents/types';
import { blockWidth } from './schema/block-specs';

/**
 * Aplica no canvas o resultado de uma tool de autoria.
 *
 * O mesmo `switch` vivia copiado em `AISidebar` e em `ChatPanel`, e as cópias já
 * tinham divergido: só uma delas checava `action === 'update_block'` antes de
 * mesclar, e cada uma resolvia o índice de página de um jeito. Divergência aqui
 * significa a IA fazer coisas diferentes conforme a tela de onde foi chamada —
 * exatamente o que este plano existe para acabar.
 *
 * Puro de propósito: recebe o resultado e as dependências, não lê store global
 * nem React. Dá para testar cada ação sem renderizar nada.
 */

/** O pedaço do canvas-store que a aplicação usa. Lido a cada chamada. */
export interface CanvasState {
  pages: ReadonlyArray<{ blockMap: Record<string, CanvasBlock> }>;
  addBlock: (pageIndex: number, block: CanvasBlock, position?: number) => void;
  removeBlock: (pageIndex: number, blockId: string) => void;
  moveBlock: (
    pageIndex: number,
    blockId: string,
    targetBlockId: string,
    position: 'before' | 'after' | 'left' | 'right',
  ) => void;
  updateBlockContent: (pageIndex: number, blockId: string, updates: Partial<CanvasBlock>) => void;
  /**
   * Troca o conteúdo de um bloco preservando id, posição no layout e largura.
   * É o que "substituir" significa: o bloco novo herda o LUGAR do antigo.
   */
  replaceBlock: (pageIndex: number, blockId: string, block: CanvasBlock) => void;
}

export interface ApplyDeps {
  /** Sempre chamado na hora: o store muda entre uma tool e a seguinte. */
  getState: () => CanvasState;
  /** Qual página do store recebe o bloco. Sem isto, a primeira. */
  resolvePageIndex?: (serverPageIndex: number | undefined) => number;
  /**
   * Relatório (`groups/{g}`) criado no Firestore — a tela atualiza o seletor e
   * navega até ele.
   *
   * Não é conteúdo de canvas: relatório é o container, não tem blocos. E não
   * aparece sozinho — `useGroups` só refaz o fetch quando o cliente ativo muda.
   */
  onReportCreated?: (info: { groupId: string; name: string }) => void;
  /** Página de relatório criada no Firestore — a tela navega até ela. */
  onReportPageCreated?: (info: { groupId: string; reportId: string; name: string }) => void;
  /**
   * Filtro da página mudou no Firestore — a tela precisa reler o documento.
   *
   * Filtro não é conteúdo de canvas: ele vive em `filters.metricPageFilters` do
   * relatório, e o `handleSave` grava só `blockMap`/`layout`. A ferramenta
   * escreve direto no banco; sem este aviso, o seletor só apareceria no próximo
   * carregamento da página.
   */
  onPageFilterChanged?: (info: { groupId: string; reportId: string }) => void;
  /** O chat criou, corrigiu, variou ou reverteu uma métrica: recarregar o catálogo. */
  onMetricCatalogChanged?: () => void;
}

/**
 * Ações das tools de métrica. Nenhuma mexe no canvas, mas todas mudam o
 * catálogo que a página usa para recortar o período e escalar o percentual —
 * sem recarregá-lo, a métrica recém-criada entrava na página como
 * desconhecida: faixa inteira no lugar do mês, e sem escala declarada.
 */
const METRIC_CATALOG_ACTIONS = new Set([
  'metric_created', 'metric_updated', 'metric_variant_created', 'metric_reverted',
]);

export interface ToolResult {
  toolName: string;
  result: Record<string, unknown> | null | undefined;
}

function isTool(toolName: string, prefix: string): boolean {
  return toolName.startsWith(prefix) && toolName.endsWith('_block');
}

/**
 * Última cerca antes do store: garante que a largura está dentro da faixa do
 * tipo.
 *
 * As tools já normalizam, mas elas não são o único produtor — resultado de tool
 * também chega de conversa carregada do histórico, gravada por uma versão
 * anterior do schema, quando o teto ainda era 3 e a legenda dizia "1 = 1/3".
 */
function withValidWidth(block: CanvasBlock): CanvasBlock {
  const colSpan = blockWidth(block);
  return colSpan === block.colSpan ? block : { ...block, colSpan } as CanvasBlock;
}

/**
 * Aplica um resultado de tool. Devolve se algo foi aplicado — resultado sem
 * ação reconhecida, ou recusado pela própria tool (`{ ok:false }` sem `action`),
 * não mexe em nada.
 */
export function applyToolResult(
  { toolName, result }: ToolResult,
  deps: ApplyDeps,
): boolean {
  if (!result) return false;

  const resolve = deps.resolvePageIndex ?? (() => 0);
  const serverPage = result.pageIndex as number | undefined;

  /** Onde o bloco está de fato; sem achar, a página que o servidor indicou. */
  const blockPage = (blockId: string): number => {
    const idx = deps.getState().pages.findIndex((p) => p.blockMap[blockId]);
    return idx === -1 ? resolve(serverPage) : idx;
  };

  // Relatório (Firestore): o container das páginas. Nada a fazer no canvas —
  // quem recebe atualiza o seletor e navega.
  if (result.action === 'report_created') {
    deps.onReportCreated?.({
      groupId: result.groupId as string,
      name: result.name as string,
    });
    return true;
  }

  // Página de relatório de verdade (Firestore). Não é conteúdo de canvas: quem
  // recebe decide criar no canvas, gravar e navegar.
  if (result.action === 'report_page_created') {
    deps.onReportPageCreated?.({
      groupId: result.groupId as string,
      reportId: result.reportId as string,
      name: result.name as string,
    });
    return true;
  }

  if (typeof result.action === 'string' && METRIC_CATALOG_ACTIONS.has(result.action)) {
    deps.onMetricCatalogChanged?.();
    return true;
  }

  // Filtro de página (Firestore, fora do canvas): quem recebe relê o documento.
  if (result.action === 'page_filter_added' || result.action === 'page_filter_removed') {
    deps.onPageFilterChanged?.({
      groupId: result.groupId as string,
      reportId: result.reportId as string,
    });
    return true;
  }

  // Lote de KPIs: blocos individuais, não um bloco com vários valores.
  if (result.action === 'add_kpi_blocks') {
    const page = resolve(serverPage);
    for (const block of (result.blocks ?? []) as CanvasBlock[]) {
      deps.getState().addBlock(page, withValidWidth(block));
    }
    return true;
  }

  if (isTool(toolName, 'add_')) {
    const block = result.block as CanvasBlock | undefined;
    if (!block) return false;

    /*
     * Substituição é troca de CONTEÚDO, não remoção seguida de criação.
     *
     * Remover e adicionar joga o bloco novo no fim da página: quem pedia para
     * trocar o indicador do topo recebia o novo lá embaixo, com um buraco no
     * lugar de origem. `replaceBlock` mantém id, posição e largura — o bloco
     * novo herda o lugar do antigo.
     */
    const replacedBlockId = result.substituiBlockId as string | undefined;
    if (replacedBlockId) {
      const page = blockPage(replacedBlockId);
      const exists = deps.getState().pages[page]?.blockMap[replacedBlockId];
      if (exists) {
        deps.getState().replaceBlock(page, replacedBlockId, withValidWidth(block));
        return true;
      }
      // Id que não existe mais (bloco já removido antes desta tool): cai no
      // acréscimo normal em vez de perder o bloco novo.
    }

    deps.getState().addBlock(
      resolve(serverPage),
      withValidWidth(block),
      result.position as number | undefined,
    );
    return true;
  }

  if (isTool(toolName, 'update_')) {
    // A tool recusa alvo de tipo errado e devolve `{ ok:false, error }` sem
    // `action` — nesse caso não há nada a aplicar.
    if (result.action !== 'update_block') return false;
    const blockId = result.blockId as string;
    deps.getState().updateBlockContent(
      blockPage(blockId),
      blockId,
      result.updates as Partial<CanvasBlock>,
    );
    return true;
  }

  /*
   * `remove_` e `move_` ecoam os argumentos sem validar nada — o id pode não
   * existir. Antes, ambos devolviam `true` sobre um no-op: o store recusava em
   * silêncio (`return state`) e o modelo anunciava uma remoção que não houve.
   * Aqui a existência é verificável, então é aqui que se verifica.
   */
  const exists = (blockId: string) =>
    deps.getState().pages.some((p) => p.blockMap[blockId]);

  if (toolName === 'remove_block') {
    const blockId = result.blockId as string;
    if (!exists(blockId)) return false;
    deps.getState().removeBlock(blockPage(blockId), blockId);
    return true;
  }

  if (toolName === 'move_block') {
    const { blockId, targetBlockId, position } = result as unknown as {
      blockId: string;
      targetBlockId: string;
      position: 'before' | 'after' | 'left' | 'right';
    };
    if (!exists(blockId) || !exists(targetBlockId)) return false;
    deps.getState().moveBlock(blockPage(blockId), blockId, targetBlockId, position);
    return true;
  }

  return false;
}

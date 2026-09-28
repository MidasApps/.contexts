import type { CanvasPage } from '@/shared/config/agents/types';

/**
 * A página do canvas que É este relatório.
 *
 * `handleSave` pegava `pages[0]` — posicional. Enquanto a edição carregava
 * exatamente uma página isso coincidia, mas o canvas edita `pages[activePage]`
 * e o assistente passou a criar página nova no meio da conversa
 * (`create_report_page`): salvar por posição gravaria o conteúdo de uma página
 * dentro do documento de outra.
 *
 * O relatório se identifica pelo id — `loadPages` o preserva ao carregar. Sem
 * correspondência devolve `undefined`, e o chamador não grava: perder um clique
 * em "Salvar" é recuperável, sobrescrever o relatório com a página errada não.
 */
export function reportPage(
  pages: readonly CanvasPage[],
  reportId: string,
): CanvasPage | undefined {
  return pages.find((p) => p.id === reportId);
}

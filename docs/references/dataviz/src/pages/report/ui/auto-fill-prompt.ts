import type { CanvasBlock } from '@/shared/config/agents/types';
import { blockSpec } from '@/features/report-authoring/schema/block-specs';

/**
 * O pedido que o assistente recebe ao abrir a página com `?edit=1`, ou `null`
 * quando não há nada a preencher.
 *
 * "A preencher" é o bloco que consome métrica e ainda não tem `metricId` — o
 * mesmo critério do estado `sem-metrica` do renderizador. Antes olhava-se para
 * `value`/`data`/`rows`, mas desde a ADR-0015 o documento guarda só
 * configuração: todo bloco salvo parecia vazio, e cada `?edit=1` numa página
 * pronta gastava uma chamada de LLM que ainda mexia no rascunho.
 */
export const buildAutoFillPrompt = (
  blockMap: Readonly<Record<string, CanvasBlock>> | undefined,
): string | null => {
  const unboundBlocks = Object.values(blockMap ?? {}).filter(
    (block) => blockSpec(block.type).accepts.length > 0 && !block.metricId,
  );
  if (unboundBlocks.length === 0) return null;

  const names = unboundBlocks
    .map((block) => {
      const named = block as { title?: string; label?: string };
      return named.title || named.label || '';
    })
    .filter(Boolean);

  return names.length > 0
    ? `Preencha os blocos desta página que ainda não têm métrica: ${names.join(', ')}.`
    : 'Preencha os blocos desta página que ainda não têm métrica.';
};

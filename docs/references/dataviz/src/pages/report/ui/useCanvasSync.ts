'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { useReportData, type ReportDataResult } from '@/shared/hooks/useReportData';
import {
  configurationSignature,
  isDataApplied,
  materializedData,
} from '@/shared/lib/report/block-data';
import type { CanvasBlock, CanvasPage, CanvasRow } from '@/shared/config/agents/types';
import type { Report } from '@/shared/lib/firestore/reports';
import { reportPage } from './report-canvas';

export interface CanvasSyncParams {
  /** O documento aberto, como veio do Firestore. `null` enquanto carrega. */
  report: Report | null;
  reportId: string;
  /** O canvas é a verdade enquanto isto for `true`. */
  editing: boolean;
  /** Seleção dos dropdowns de página (G3), repassada à busca. */
  pageFilterValues: Record<string, string[]>;
  /**
   * A IA alterou o CONTEÚDO com o relatório em leitura. Quem trata abre a
   * edição: alteração de IA entra como rascunho para revisar, não como escrita
   * consumada. Precisa ser estável (`useCallback`).
   */
  onReadModeChange: () => void;
}

export interface CanvasSyncResult extends ReportDataResult {
  /**
   * Repõe no canvas a página descrita por estes blocos e refaz as âncoras de
   * comparação. Para o fim de uma edição — gravada ou descartada.
   */
  restoreCanvas: (blockMap: Record<string, CanvasBlock>, layout: CanvasRow[]) => void;
}

/**
 * Mantém documento, canvas e dado contando a mesma história.
 *
 * São três correntes que se cruzam na mesma tela: o DOCUMENTO (Firestore), o
 * CANVAS (`canvas-store`, onde a IA escreve e de onde o `CanvasPanel` desenha) e
 * o DADO (`/api/metrics/batch`). Este hook é o único lugar que as costura:
 *
 * 1. documento → canvas: o relatório aberto vive no store mesmo fora da edição,
 *    senão o assistente não enxerga a página em que o usuário está parado;
 * 2. canvas → busca: em edição, quem lista os `metricId` é o canvas — é assim
 *    que o bloco recém-criado pela IA consegue o próprio dado;
 * 3. dado → canvas: o valor volta para o bloco, porque em edição quem desenha
 *    lê o store;
 * 4. canvas → edição: alteração de CONTEÚDO vinda da IA abre o modo de edição.
 *
 * O que impede (2) e (3) de se realimentarem é a ASSINATURA DA CONFIGURAÇÃO:
 * ela ignora o dado, então o valor que volta no passo 3 não muda a entrada do
 * passo 2. Ver `@/shared/lib/report/block-data`.
 */
export function useCanvasSync({
  report,
  reportId,
  editing,
  pageFilterValues,
  onReadModeChange,
}: CanvasSyncParams): CanvasSyncResult {
  const loadPages = useCanvasStore((s) => s.loadPages);
  const updateBlockContent = useCanvasStore((s) => s.updateBlockContent);
  const canvasPages = useCanvasStore((s) => s.pages);
  /** Os blocos deste relatório como o CANVAS os tem agora (rascunho da edição). */
  const canvasBlockMap = useCanvasStore(
    (s) => s.pages.find((p) => p.id === reportId)?.blockMap,
  );

  /** JSON do blockMap que o efeito de carga colocou no canvas por último. */
  const canvasLoadedRef = useRef<string>('');
  /** Assinatura da CONFIGURAÇÃO como o DOCUMENTO a descreve. */
  const baseConfigRef = useRef<string>('');

  /**
   * Os blocos que alimentam a busca de dados.
   *
   * Em leitura, o documento; em edição, o CANVAS. Sem o canvas, o bloco que a
   * IA acabou de criar não entrava no `cacheKey` e nunca era pedido ao batch:
   * KPI novo com "—" ao lado dos antigos preenchidos, e o número só aparecendo
   * depois de Salvar.
   *
   * O vaivém pela assinatura é o que ancora a identidade deste objeto na
   * CONFIGURAÇÃO: o canvas ganha um objeto novo a cada valor devolvido ao
   * bloco, e ancorar nele faria a busca se refazer por causa do próprio
   * resultado dela.
   */
  const blocksSignature = useMemo(
    () => configurationSignature((editing ? canvasBlockMap : undefined) ?? report?.blockMap),
    [editing, canvasBlockMap, report?.blockMap],
  );
  const blockMapForData = useMemo(
    () => (JSON.parse(blocksSignature) as Record<string, CanvasBlock> | null) ?? undefined,
    [blocksSignature],
  );

  const data = useReportData(
    blockMapForData,
    report?.queries,
    report?.filters,
    // Escopa pelo produto de origem do report (`productRefs[0]`); reports
    // antigos sem lineage → undefined → fallback ao produto globalmente ativo.
    report?.productRefs?.[0],
    pageFilterValues,
  );
  const { populatedBlockMap } = data;

  /** Este relatório na forma que o canvas entende. */
  const canvasPage = useCallback((): CanvasPage | null => {
    if (!report) return null;
    return {
      id: report.id,
      title: report.name,
      blockMap: populatedBlockMap ?? report.blockMap ?? {},
      layout: report.layout ?? [],
      filters: report.filters,
    };
  }, [report, populatedBlockMap]);

  /**
   * O relatório aberto vive no canvas store mesmo fora da edição.
   *
   * Antes ele só entrava no `handleEdit`, e o store ficava vazio no modo de
   * leitura. Quem paga por isso é o assistente: o `pagesContext` sai do store,
   * então com o usuário parado dentro de um relatório o prompt dizia "Nenhuma
   * página aberta" — e um `add_*_block` viraria escrita numa página inexistente,
   * no-op silencioso. Editar continua sendo permissão de UI; não é mais a fonte
   * do estado.
   */
  useEffect(() => {
    if (editing) return; // durante a edição o store é a verdade — não sobrescrever
    const page = canvasPage();
    // Compara contra o RELATÓRIO, não contra o store: assim uma alteração que a
    // IA acabou de fazer no canvas não é desfeita pelo recarregamento.
    const signature = JSON.stringify(page?.blockMap ?? null);
    if (signature === canvasLoadedRef.current) return;
    canvasLoadedRef.current = signature;
    baseConfigRef.current = configurationSignature(page?.blockMap);
    loadPages(page ? [page] : []);
  }, [editing, canvasPage, loadPages]);

  /**
   * A IA alterou o canvas com o relatório em leitura → quem chamou abre a
   * edição.
   *
   * Fora da edição a tela renderiza do documento, não do store: sem isto a
   * alteração ficaria invisível e nunca seria gravada.
   */
  useEffect(() => {
    if (editing || !report) return;
    const page = reportPage(canvasPages, reportId);
    // Compara CONFIGURAÇÃO: o dado que o pipeline devolve ao bloco também
    // altera o canvas, e não é alteração de conteúdo — abriria a edição a cada
    // número que chega.
    if (!page || configurationSignature(page.blockMap) === baseConfigRef.current) return;
    onReadModeChange();
  }, [canvasPages, editing, report, reportId, onReadModeChange]);

  /**
   * O dado que chegou volta para o bloco que está na tela.
   *
   * Em edição quem desenha é o `CanvasPanel`, que lê o store — o
   * `populatedBlockMap` sozinho não chega à tela, e o bloco recém-criado
   * continuaria vazio mesmo com a métrica já buscada.
   *
   * Escreve campo a campo, nunca o mapa inteiro: um bloco que a IA criou
   * enquanto o batch estava em voo não está no resultado, e substituir o mapa o
   * apagaria.
   *
   * Sem laço: este efeito só reage a `populatedBlockMap`, que só muda quando um
   * fetch novo termina; e o fetch só recomeça quando a ASSINATURA DA
   * CONFIGURAÇÃO muda — o que devolver dado ao bloco não faz. `isDataApplied`
   * é o segundo fecho: reexecução sem dado novo não escreve nada no store.
   */
  useEffect(() => {
    if (!editing || !populatedBlockMap) return;
    const pages = useCanvasStore.getState().pages;
    const index = pages.findIndex((p) => p.id === reportId);
    const page = pages[index];
    if (!page) return;
    for (const [blockId, populated] of Object.entries(populatedBlockMap)) {
      const current = page.blockMap[blockId];
      if (!current) continue;
      const blockData = materializedData(populated);
      if (Object.keys(blockData).length === 0 || isDataApplied(current, blockData)) continue;
      updateBlockContent(index, blockId, blockData);
    }
  }, [editing, populatedBlockMap, reportId, updateBlockContent]);

  /**
   * Fim de edição: o canvas volta a descrever o documento, e as âncoras junto.
   *
   * Repõe aqui, e não deixando para o efeito de carga, por causa da ordem: o
   * efeito de detecção roda no MESMO passo, ainda com o `canvasPages` do render
   * anterior — o rascunho. Ao descartar um bloco que a IA criou, ele lia o
   * rascunho como alteração nova e reabria a edição que o usuário acabara de
   * fechar.
   */
  const restoreCanvas = useCallback(
    (blockMap: Record<string, CanvasBlock>, layout: CanvasRow[]) => {
      if (!report) return;
      loadPages([
        {
          id: report.id,
          title: report.name,
          blockMap,
          layout,
          filters: report.filters,
        },
      ]);
      canvasLoadedRef.current = JSON.stringify(blockMap);
      baseConfigRef.current = configurationSignature(blockMap);
    },
    [report, loadPages],
  );

  return { ...data, restoreCanvas };
}

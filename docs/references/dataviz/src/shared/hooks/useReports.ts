'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import {
  fetchReports, createReport, renameReport, deleteReport,
  duplicateReport, moveReport, type Report,
} from '@/shared/lib/firestore/reports';
import type { CanvasBlock, CanvasRow, CanvasPageFilters } from '@/shared/config/agents/types';
import type { TemplateQueryConfig } from '@/shared/config/dashboard-templates';

/**
 * As páginas de um relatório.
 *
 * ⚠️ `loading` NÃO é só "tem requisição em voo": ele também cobre o intervalo
 * em que `groupId` já mudou e os dados ainda são do grupo anterior.
 *
 * Esse intervalo existe porque `setLoading(true)` acontece dentro do efeito,
 * e efeito roda DEPOIS do render. Havia portanto um render — o primeiro com o
 * grupo novo — em que `loading` era false e `reports` eram as páginas do grupo
 * velho. Quem lia esse render agia sobre o relatório errado: a troca de
 * relatório navegava para `/g/<novo>/r/<página do anterior>`, rota que não
 * existe, e a tela ficava em branco.
 *
 * A correção não é adiantar o flag — é derivar o estado do DADO: enquanto o
 * grupo que carregamos não for o grupo pedido, o hook diz que está carregando
 * e não entrega página nenhuma. Os dois sinais concordam sempre.
 */
export function useReports(groupId: string | null) {
  const activeClientId = useAppStore((s) => s.activeClientId);
  const reportsListVersion = useAppStore((s) => s.reportsListVersion);
  const bumpReportsList = useAppStore((s) => s.bumpReportsList);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!activeClientId || !groupId) {
      setReports([]);
      setLoadedFor(groupId ?? null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchReports(activeClientId, groupId);
      setReports(data);
    } catch (error) {
      console.error('[useReports] Error:', error);
      setReports([]);
    } finally {
      // Marca o grupo mesmo em erro: a lista vazia é a resposta DELE, e sem
      // isto o hook ficaria eternamente "carregando" depois de uma falha.
      setLoadedFor(groupId);
      setLoading(false);
    }
  }, [activeClientId, groupId]);

  useEffect(() => {
    refetch();
  }, [refetch, reportsListVersion]);

  const isStale = loadedFor !== (groupId ?? null);

  return {
    reports: isStale ? [] : reports,
    loading: loading || isStale,
    refetch,
    create: async (
      name: string,
      blockMap?: Record<string, CanvasBlock>,
      layout?: CanvasRow[],
      queries?: TemplateQueryConfig[],
      description?: string,
      filters?: CanvasPageFilters,
      templateId?: string,
      productRefs?: string[],
      metricRefs?: string[],
    ) => {
      const id = await createReport(
        activeClientId,
        groupId!,
        name,
        blockMap,
        layout,
        queries,
        description,
        filters,
        templateId,
        productRefs,
        metricRefs,
      );
      bumpReportsList();
      return id;
    },
    rename: async (reportId: string, name: string) => {
      await renameReport(activeClientId, groupId!, reportId, name);
      bumpReportsList();
    },
    remove: async (reportId: string) => {
      await deleteReport(activeClientId, groupId!, reportId);
      bumpReportsList();
    },
    duplicate: async (reportId: string) => {
      const id = await duplicateReport(activeClientId, groupId!, reportId);
      bumpReportsList();
      return id;
    },
    move: async (reportId: string, toGroupId: string) => {
      const id = await moveReport(activeClientId, groupId!, toGroupId, reportId);
      bumpReportsList();
      return id;
    },
  };
}

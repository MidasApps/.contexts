'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/shared/stores/app-store';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { regimeDeData } from '@/shared/lib/metrics/period-sensitivity';
import { isPeriodTrimmed, positionMonth } from '@/shared/lib/metrics/period-trim';
import { PositionNote } from '@/pages/explore/ui/blocks/PositionNote';
import { getReport, updateReport, type Report } from '@/shared/lib/firestore/reports';
import { useGroups } from '@/shared/hooks/useGroups';
import { useReports } from '@/shared/hooks/useReports';
import { CanvasBlockRenderer } from '@/pages/explore/ui/CanvasBlockRenderer';
import { CanvasPanel } from '@/pages/explore/ui/CanvasPanel';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { serializeBlocks, type CanvasBlock } from '@/shared/config/agents/types';
import { configurationMap, isSameConfiguration } from '@/shared/lib/report/block-data';
import { useCanvasSync } from './useCanvasSync';
import { useFetchResource } from '@/shared/hooks/useFetchResource';
import { usePageFilterValues } from '@/shared/hooks/usePageFilterValues';
import {
  parsePageFiltersFromSearch,
  serializePageFilters,
  substituteReportTokens,
} from './drill-through';
import { reportPage } from './report-canvas';
import { buildAutoFillPrompt } from './auto-fill-prompt';
import { PageToolbar } from '@/widgets/page-toolbar';
import { PageFilterBar } from '@/widgets/page-filter-bar';
import { GRID_CLASS, widthStyle } from '@/pages/explore/ui/block-grid';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

/* ------------------------------------------------------------------ */
/*  ReportPage                                                         */
/* ------------------------------------------------------------------ */

export function ReportPage() {
  const params = useParams<{ groupId: string; reportId: string }>();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const metricCatalog = useAppStore((s) => s.metrics) ?? [];
  const { dateRange, dataBaseOptions } = useDataFilters() ?? {};
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const { groups } = useGroups();

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalReport, setOriginalReport] = useState<Report | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const searchParams = useSearchParams();
  const autoEdit = searchParams?.get('edit') === '1';
  const autoEditTriggered = useRef(false);

  const groupId = params?.groupId ?? '';
  const reportId = params?.reportId ?? '';

  /*
   * O documento da página. Trocar de página (o App Router não remonta) gera
   * outro fetcher: a leitura anterior é abortada e, se ainda responder, é
   * ignorada — antes, a página anterior que respondesse por último virava o
   * `report` da tela nova. Sem cliente/grupo/página ainda não há o que ler, e
   * a tela segue no spinner como sempre esteve.
   *
   * `resetOnChange`: enquanto a página nova carrega, `report` é `null`, não a
   * página anterior. Os efeitos que olham `report` (edição automática do
   * `?edit=1`, trilha do header, useCanvasSync) rodam antes do spinner e,
   * com a anterior ainda ali, agiam sobre ela sob os params da nova — o
   * `?edit=1` guardava a página errada como `originalReport`.
   */
  const reportFetcher = useMemo(
    () =>
      activeClientId && groupId && reportId
        ? (signal: AbortSignal) => getReport(activeClientId, groupId, reportId, signal)
        : null,
    [activeClientId, groupId, reportId],
  );
  const {
    data: report,
    setData: setReport,
    loading: isReadingReport,
    refetch: rereadReport,
  } = useFetchResource<Report | null>(reportFetcher, null, { resetOnChange: true });
  const loading = isReadingReport || !reportFetcher;
  const group = groups.find((g) => g.id === groupId);
  // Reports do grupo atual — usado para resolver o token `{report:<templateId>}`
  // em links de drill-through (G5) renderizados em blocos `text`.
  const { reports: groupReports } = useReports(groupId);

  // Drill-through (G5): pares `pf.<attribute>=v1,v2` na querystring de
  // chegada (ex.: navegação vinda de um link `{pageFilters}` de outro
  // report) inicializam os dropdowns de página. Reparseado a cada render,
  // mas só aplicado no reset disparado pela troca de `resetKey` abaixo —
  // ver docstring de `usePageFilterValues`.
  const initialPageFilterValues = useMemo(
    () => parsePageFiltersFromSearch(searchParams),
    [searchParams],
  );

  // Seleção do usuário nos dropdowns de página (G3) — chave = key de
  // `metricPageFilters` com `control: 'dropdown'`. Reset automático ao
  // trocar de report/grupo/cliente (App Router não remonta o componente
  // na troca de params — sem isso a seleção vazaria entre reports).
  const { pageFilterValues, handlePageFilterChange } = usePageFilterValues(
    `${activeClientId ?? ''}|${groupId}|${reportId}`,
    initialPageFilterValues,
  );

  const handleEdit = useCallback(() => {
    if (!report) return;
    // Guarda o original para o cancelar. O canvas já tem a página carregada.
    setOriginalReport(JSON.parse(JSON.stringify(report)) as Report);
    setEditing(true);
    useAppStore.getState().setEditingReport(true);
  }, [report]);

  // Documento ↔ canvas ↔ dado: quem costura as três correntes é o useCanvasSync.
  // Alteração da IA em leitura entra pelo mesmo caminho do lápis — rascunho com
  // Salvar e Cancelar ao lado, não escrita consumada.
  const {
    populatedBlockMap,
    loading: dataLoading,
    error: dataError,
    errorsByMetric,
    awaitingFirstData,
    restoreCanvas,
  } = useCanvasSync({
    report,
    reportId,
    editing,
    pageFilterValues,
    onReadModeChange: handleEdit,
  });

  /**
   * Relê o documento quando o assistente mexe nos filtros da página.
   *
   * Filtro não passa pelo canvas — a ferramenta escreve direto no Firestore,
   * porque o `handleSave` grava só `blockMap`/`layout`. Sem este contador, o
   * seletor que a IA acabou de criar só apareceria no próximo carregamento, e
   * o usuário leria "pronto, criei o filtro" olhando para uma página sem ele.
   */
  useEffect(() => {
    const onFilterChange = (e: Event) => {
      const target = (e as CustomEvent<{ groupId?: string; reportId?: string }>).detail;
      if (target?.groupId && target.groupId !== groupId) return;
      if (target?.reportId && target.reportId !== reportId) return;
      void rereadReport();
    };
    window.addEventListener('report-filters-changed', onFilterChange);
    return () => window.removeEventListener('report-filters-changed', onFilterChange);
  }, [groupId, reportId, rereadReport]);

  useEffect(() => {
    if (!activeClientId || !groupId || !reportId) return;
    setActiveReport(groupId, reportId);
  }, [activeClientId, groupId, reportId, setActiveReport]);

  /*
   * A trilha `Relatório › Página` do header global.
   *
   * Quem tem os dois nomes em mãos é esta página — ela acabou de ler o
   * documento e a lista de grupos. Deixar o header descobrir sozinho custaria
   * duas leituras de Firestore para saber o que já está aqui.
   */
  useEffect(() => {
    if (!report) return;
    useAppStore.getState().setPageTrail(group?.name ?? '', report.name);
    // Sair do relatório apaga a trilha: sem isto o header seguiria anunciando
    // a última página aberta enquanto a pessoa está na home.
    return () => useAppStore.getState().setPageTrail('', '');
  }, [report, group?.name]);

  // Beforeunload handler for unsaved changes
  useEffect(() => {
    if (!editing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editing]);

  /* ---- Edit mode handlers ---- */

  // Auto-enter edit mode when navigated with ?edit=1 (e.g. from "Nova página")
  useEffect(() => {
    if (autoEdit && report && !editing && !autoEditTriggered.current) {
      autoEditTriggered.current = true;
      handleEdit();
      // Clean up the URL to remove the query param
      window.history.replaceState({}, '', window.location.pathname);

      const prompt = buildAutoFillPrompt(report.blockMap);
      if (prompt) {
        // Dispatch after a delay to let sidebar mount
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('auto-fill-report', { detail: { prompt } }));
        }, 2000);
      }
    }
  }, [autoEdit, report, editing, handleEdit]);

  const handleSave = useCallback(async () => {
    if (!activeClientId || !groupId || !reportId) return;
    const editedPage = reportPage(useCanvasStore.getState().pages, reportId);
    if (!editedPage) {
      // Sem a página no canvas não há o que gravar. Antes daqui se saía do modo
      // de edição em silêncio: o rascunho ia embora e o usuário achava que
      // tinha salvo. Erro que ninguém vê é pior que erro.
      toast.error(
        'Não foi possível salvar: este relatório não está aberto no canvas. Recarregue a página e tente de novo.',
      );
      return;
    }
    setSaving(true);
    try {
      // Só CONFIGURAÇÃO vai para o documento. `value` formatado, `data[]` do
      // gráfico e `rows[]` da tabela são o resultado da métrica DE AGORA:
      // gravá-los inchava o documento e congelava número dentro da
      // configuração — exatamente o que a ADR-0015 tirou do schema das tools.
      const configuration = configurationMap(editedPage.blockMap);
      await updateReport(activeClientId, groupId, reportId, configuration, editedPage.layout);
      // Update local state with saved data
      setReport((prev) =>
        prev ? { ...prev, blockMap: configuration, layout: editedPage.layout } : prev,
      );
      setEditing(false);
      useAppStore.getState().setEditingReport(false);
      // Não esvazia o store: o relatório segue aberto para o assistente ver —
      // agora descrevendo o que acabou de ser gravado. O dado volta pelo
      // pipeline no render seguinte.
      restoreCanvas(configuration, editedPage.layout);
    } catch (error) {
      console.error('Failed to save report:', error);
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar: ${error.message}`
          : 'Não foi possível salvar o relatório.',
      );
    } finally {
      setSaving(false);
    }
  }, [activeClientId, groupId, reportId, restoreCanvas, setReport]);

  const confirmCancel = useCallback(() => {
    if (originalReport) setReport(originalReport);
    setEditing(false);
    useAppStore.getState().setEditingReport(false);
    setShowCancelConfirm(false);
    // Repõe o canvas AQUI, e não deixando para o efeito de carga: o efeito de
    // detecção roda no mesmo passo, ainda com o rascunho do render anterior, e
    // leria o bloco recusado como alteração nova — reabrindo a edição que o
    // usuário acabou de fechar.
    restoreCanvas(originalReport?.blockMap ?? {}, originalReport?.layout ?? []);
  }, [originalReport, restoreCanvas, setReport]);

  const handleCancel = useCallback(() => {
    // Check if canvas state differs from original. Compara CONFIGURAÇÃO: o
    // canvas carrega o dado que o pipeline devolveu e o documento não, então
    // comparar o JSON cru acusaria alteração em toda edição — inclusive quando
    // o usuário não tocou em nada.
    const currentPage = reportPage(useCanvasStore.getState().pages, reportId);
    const hasChanges =
      currentPage && !isSameConfiguration(currentPage.blockMap, originalReport?.blockMap);
    if (hasChanges) {
      setShowCancelConfirm(true);
      return;
    }
    confirmCancel();
  }, [originalReport, confirmCancel, reportId]);

  // Use populated data when available, otherwise original blockMap. Calculado
  // antes dos retornos antecipados abaixo (hooks não podem ser condicionais)
  // pois alimenta o useMemo de resolução de tokens de drill-through. Memoizado
  // para não recriar `{}` a cada render (quebraria a memoização abaixo).
  const activeBlockMap = useMemo(
    () => populatedBlockMap ?? report?.blockMap ?? {},
    [populatedBlockMap, report?.blockMap],
  );

  const pageFiltersQuery = useMemo(
    () => serializePageFilters(pageFilterValues),
    [pageFilterValues],
  );

  const resolveReportId = useCallback(
    (templateId: string) => groupReports.find((r) => r.templateId === templateId)?.id,
    [groupReports],
  );

  // Drill-through (G5): resolve `{groupId}` / `{report:<templateId>}` /
  // `{pageFilters}` em blocos `text` antes de renderizar. Pré-processamento
  // local ao ReportPage — CanvasBlockRenderer/TextBlock continuam servindo
  // outras páginas sem tokens, inalterados.
  const resolvedBlockMap = useMemo(() => {
    const entries = Object.entries(activeBlockMap).map(([id, block]) => {
      if (block.type !== 'text') return [id, block] as const;
      return [
        id,
        {
          ...block,
          content: substituteReportTokens(block.content, {
            groupId,
            pageFilters: pageFiltersQuery,
            resolveReportId,
          }),
        },
      ] as const;
    });
    return Object.fromEntries(entries) as Record<string, CanvasBlock>;
  }, [activeBlockMap, groupId, pageFiltersQuery, resolveReportId]);

  /**
   * Os blocos na ordem em que se encaixam na grade.
   *
   * `serializeBlocks` é a MESMA função que o `CanvasPanel` usa para desenhar a
   * edição — é o que garante que as duas telas listem os mesmos blocos na mesma
   * ordem. Bloco que está no `blockMap` e em nenhuma linha do `layout` não
   * aparece: `layout` é o que existe na página, `blockMap` é o acervo.
   */
  const blocksInOrder = useMemo(
    () => serializeBlocks({ blockMap: resolvedBlockMap, layout: report?.layout ?? [] }),
    [resolvedBlockMap, report?.layout],
  );

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground/60 text-sm">Este relatório não existe ou foi removido.</p>
      </div>
    );
  }

  const blockCount = Object.keys(activeBlockMap).length;

  // Controles de edição — mesmos seis pontos que o AppBar carregava
  // (editable/editing/onEdit/onSave/onCancel/saving), agora resolvidos aqui
  // porque a barra de ações só existe abaixo, dentro de cada ramo do `editing`.
  const pageActions = editing ? (
    <>
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
        Editando
      </span>
      <button
        onClick={handleCancel}
        disabled={saving}
        className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        Cancelar
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </>
  ) : (
    /* Rotulado, e não só um lápis: na barra de ações ele divide espaço com o
       período e os filtros, onde um ícone mudo vira adivinhação. */
    <button
      onClick={handleEdit}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      title="Editar página"
    >
      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
      Editar
    </button>
  );

  const pageBar = (
    <div className="space-y-2">
      <PageToolbar
        filters={
          editing ? null : (
            <PageFilterBar
              filters={report.filters}
              clientId={activeClientId ?? undefined}
              productId={report.productRefs?.[0]}
              values={pageFilterValues}
              onChange={handlePageFilterChange}
            />
          )
        }
        actions={pageActions}
      />
      {/* A descrição sobreviveu ao título: ela diz o que a página responde,
          que o nome na trilha não diz. */}
      {report.description && (
        <p className="text-[12px] leading-relaxed text-muted-foreground/70">{report.description}</p>
      )}
    </div>
  );

  return (
    <>
      {editing ? (
        <>
          <div className="shrink-0 px-5 pt-5 lg:px-8">{pageBar}</div>
          {/* CanvasPanel usa `h-full` internamente; sem o wrapper
              `flex-1 min-h-0` ele estouraria a altura disponível (o hero
              acima já ocupa espaço no mesmo flex column do <main>). */}
          <div className="flex-1 min-h-0">
            {/* showFilters=false: cliente e Filtros já vivem no header global
                (AppHeader); sem isto o GlobalFilters do CanvasPanel duplicaria
                os dois no modo de edição.

                editBlocks: o lápis de editar conteúdo, que só existia no editor
                de templates do admin — aqui a edição de bloco era exclusiva da
                IA. Sem `authoring`, então a amarração com a métrica
                (`metricId`, `xAxisKey`, `dataKeys`) fica só de leitura. */}
            <CanvasPanel showFilters={false} editBlocks />
          </div>
        </>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-6 p-5 lg:p-8 overflow-x-hidden">
            {pageBar}
            {/* Só no REFETCH (troca de filtro), onde os blocos seguem mostrando
                os números anteriores e nada mais avisaria que estão sendo
                refeitos. Na primeira carga cada bloco já tem seu esqueleto — e
                este aviso, ao sumir, empurrava a página inteira 40px. */}
            {dataLoading && !awaitingFirstData && (
              <div className="flex items-center gap-2 text-muted-foreground/60 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Carregando dados...</span>
              </div>
            )}
            {blockCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-muted-foreground/60 text-sm mb-2">Relatório vazio</p>
                <p className="text-muted-foreground/40 text-xs">Use o modo edição para adicionar blocos</p>
              </div>
            ) : (
              /*
               * UMA grade para a página inteira, igual à da edição.
               *
               * Ver `block-grid.ts`: `layout` é a ORDEM dos blocos, e quem
               * decide onde a linha quebra é o encaixe — o mesmo que o store
               * aplica e que o assistente recebe descrito.
               */
              <div className={GRID_CLASS}>
                {blocksInOrder.map((block) => {
                  const blockId = block.id;
                  // Falha do batch inteiro (`dataError`) atinge toda métrica:
                  // sem isso os blocos voltavam a desenhar o template cru —
                  // o mesmo "0,00x" vermelho, agora sem nem estar buscando.
                  const metricError = block.metricId
                    ? (errorsByMetric[block.metricId] ?? dataError ?? undefined)
                    : undefined;
                  /*
                   * A confissão: este bloco NÃO seguiu o período que a
                   * pessoa acabou de escolher, porque a métrica dele fixa
                   * o último mês dentro do próprio SQL. Só aparece com o
                   * período recortado — sem recorte não há divergência, e
                   * a nota em quase todo bloco viraria ruído.
                   */
                  const metric = block.metricId
                    ? metricCatalog.find((m) => m.id === block.metricId)
                    : undefined;
                  const regime = regimeDeData(metric);
                  const ignoresPeriod = Boolean(
                    block.metricId
                    && !metricError
                    && isPeriodTrimmed(dateRange, dataBaseOptions)
                    && regime !== 'periodo',
                  );
                  const pinnedMonth = ignoresPeriod ? positionMonth(dataBaseOptions, dateRange?.end) : null;
                  return (
                    <div key={blockId} style={widthStyle(block.colSpan ?? 1)}>
                      {(
                        <CanvasBlockRenderer
                          block={block}
                          error={metricError}
                          loading={awaitingFirstData && Boolean(block.metricId)}
                          // Fora do modo de edição: no canvas o bloco está
                          // sendo arrastado, aqui ele é para consultar.
                          expandable={!editing}
                        />
                      )}
                      {pinnedMonth && !awaitingFirstData && <PositionNote month={pinnedMonth} regime={regime === 'historico' ? 'historico' : 'posicao'} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="bg-popover border-border sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Descartar alterações?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Você tem alterações não salvas. Deseja descartá-las?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Continuar editando
            </button>
            <button
              onClick={confirmCancel}
              className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-red-600 transition-colors"
            >
              Descartar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

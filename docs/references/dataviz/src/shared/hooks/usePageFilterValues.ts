'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePageFilterValuesResult {
  pageFilterValues: Record<string, string[]>;
  handlePageFilterChange: (key: string, selected: string[]) => void;
}

/**
 * Estado local dos dropdowns de página (G3) — `metricPageFilters[key]` com
 * `control: 'dropdown'` — com reset automático quando `resetKey` muda.
 *
 * Usado por `ReportPage`/`RouteTemplatePage`, ambos montados uma única vez
 * pelo App Router e reaproveitados na troca de rota (`groupId`/`reportId`/
 * `templateId`/cliente muda via params, sem remount do componente). Sem
 * este reset, a seleção de dropdown do report/template anterior vazaria
 * para o próximo — chaves genéricas como "banco"/"categoria" tendem a se
 * repetir entre templates diferentes.
 *
 * `resetKey` deve identificar unicamente a combinação página+cliente (ex:
 * `${clientId}|${groupId}|${reportId}` ou `${clientId}|${templateId}`).
 *
 * `initialValues` (drill-through, G5): valores derivados da querystring
 * `pf.<attribute>=v1,v2` na navegação de origem (`parsePageFiltersFromSearch`
 * em `@/pages/report/ui/drill-through`) — aplicados no lugar de `{}` sempre
 * que `resetKey` muda, incluindo o mount inicial. Lido via ref para não
 * disparar reset a cada render: o chamador tipicamente reparseia a
 * querystring a cada render, gerando um objeto novo por referência que não
 * deve apagar a seleção que o usuário já fez nesta mesma página.
 */
export function usePageFilterValues(
  resetKey: string,
  initialValues?: Record<string, string[]>,
): UsePageFilterValuesResult {
  const [pageFilterValues, setPageFilterValues] = useState<Record<string, string[]>>(
    () => initialValues ?? {},
  );

  const initialValuesRef = useRef(initialValues);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref, lido só dentro do efeito de reset abaixo
  initialValuesRef.current = initialValues;

  useEffect(() => {
    setPageFilterValues(initialValuesRef.current ?? {});
  }, [resetKey]);

  const handlePageFilterChange = useCallback((key: string, selected: string[]) => {
    setPageFilterValues((prev) => ({ ...prev, [key]: selected }));
  }, []);

  return { pageFilterValues, handlePageFilterChange };
}

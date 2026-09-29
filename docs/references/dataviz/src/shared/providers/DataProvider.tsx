'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { fetchFilterOptions } from '@/shared/hooks/useQuery';
import { useActiveDataset } from '@/shared/hooks/useActiveClient';

/**
 * Estado dos filtros que valem para a PÁGINA INTEIRA.
 *
 * ─── O que saiu daqui, e por quê ────────────────────────────────────────────
 *
 * Havia também um filtro de Empreendimentos e seis "filtros avançados"
 * (Rating, Elegibilidade, Faixa LTV, Faixa de Atraso, Tipo Proponente, Grupo
 * Repasse). Os seis tinham as opções escritas à mão no código — `['A','B',…]`,
 * `['0-30%','30-50%',…]` —, não vinham do dado de cliente nenhum.
 *
 * E nenhum dos sete filtrava coisa alguma. Eles só chegavam à consulta pela via
 * *ambient*: ou o template da métrica traz `{ambient:entidade}`, ou a recipe é
 * `aggregation` (que o resolver monta aplicando os filtros ambiente). O
 * catálogo em produção tem ZERO ocorrências de `{ambient` e ZERO recipes
 * `aggregation` — as 64 métricas são `sql` escrito à mão. Marcar "Rating A" não
 * mudava um número na tela.
 *
 * Removê-los não tirou funcionalidade: tirou uma promessa que a interface não
 * cumpria. Filtro que recorta de verdade é o de PÁGINA
 * (`metricPageFilters` + `PageFilterBar`), que sai do dado real do cliente — e
 * agora nasce quando o usuário pede à IA, não pré-instalado em toda tela.
 */

export interface DatePeriod {
  start: string;
  end: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export type ViewMode = 'snapshot' | 'accumulated';

interface DataFilters {
  dateRange: DateRange;
  comparePeriod: DatePeriod | null;
  compareEnabled: boolean;
  viewMode: ViewMode;
}

interface DataFiltersContextValue extends DataFilters {
  setDateRange: (range: DateRange) => void;
  setComparePeriod: (period: DatePeriod | null) => void;
  setCompareEnabled: (enabled: boolean) => void;
  dataBase: string;
  dataBaseOptions: { value: string; label: string }[];
  filtersReady: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const DataFiltersContext = createContext<DataFiltersContextValue | null>(null);

interface DataProviderProps {
  children: ReactNode;
}

interface FilterOptionsResponse {
  dataBases: { value: string; label: string }[];
}

export function DataProvider({ children }: DataProviderProps) {
  const activeDataset = useActiveDataset();
  const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' });
  const [comparePeriod, setComparePeriod] = useState<DatePeriod | null>(null);
  const [compareEnabled, setCompareEnabledState] = useState(false);
  const [dataBaseOptions, setDataBaseOptions] = useState<{ value: string; label: string }[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('snapshot');

  useEffect(() => {
    let cancelled = false;

    if (!activeDataset) {
      setDataBaseOptions([]);
      setDateRange({ start: '', end: '' });
      setFiltersReady(false);
      return () => { cancelled = true; };
    }

    setFiltersReady(false);
    fetchFilterOptions<FilterOptionsResponse>(activeDataset)
      .then((result) => {
        if (cancelled) return;

        const nextDateOptions = result.dataBases;
        setDataBaseOptions(nextDateOptions);

        setDateRange((prev) => {
          if (nextDateOptions.length === 0) {
            return { start: '', end: '' };
          }

          const availableDates = new Set(nextDateOptions.map((option) => option.value));
          const fallbackStart = nextDateOptions[nextDateOptions.length - 1].value;
          const fallbackEnd = nextDateOptions[0].value;

          const start = availableDates.has(prev.start) ? prev.start : fallbackStart;
          const end = availableDates.has(prev.end) ? prev.end : fallbackEnd;

          return start <= end
            ? { start, end }
            : { start: fallbackStart, end: fallbackEnd };
        });

        setFiltersReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDataBaseOptions([]);
        setDateRange({ start: '', end: '' });
        setFiltersReady(true); // ready even on error — show empty state instead of loading
      });

    return () => {
      cancelled = true;
    };
  }, [activeDataset]);

  const handleSetCompareEnabled = useCallback((enabled: boolean) => {
    setCompareEnabledState(enabled);
    if (!enabled) {
      setComparePeriod(null);
    }
  }, []);

  const value = useMemo<DataFiltersContextValue>(() => ({
    dateRange,
    comparePeriod,
    compareEnabled,
    setDateRange,
    setComparePeriod,
    setCompareEnabled: handleSetCompareEnabled,
    viewMode,
    setViewMode,
    dataBase: dateRange.end,
    dataBaseOptions,
    filtersReady,
  }), [dateRange, comparePeriod, compareEnabled, handleSetCompareEnabled, dataBaseOptions, filtersReady, viewMode]);

  return (
    <DataFiltersContext.Provider value={value}>
      {children}
    </DataFiltersContext.Provider>
  );
}

export function useDataFilters(): DataFiltersContextValue {
  const ctx = useContext(DataFiltersContext);
  if (!ctx) {
    throw new Error('useDataFilters deve ser usado dentro de <DataProvider>');
  }
  return ctx;
}

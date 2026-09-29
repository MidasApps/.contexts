'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { makeAiStudioApi, type EntityPath, type AiStudioRecordLike } from './api';

export function useAiStudioCrud(path: EntityPath) {
  const [api] = useState(() => makeAiStudioApi(path));
  const [rows, setRows] = useState<AiStudioRecordLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await api.list()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro desconhecido'); }
    finally { setLoading(false); }
  }, [api]);

  const save = useCallback(async (record: { id: string } & Record<string, unknown>) => {
    const { warnings } = await api.save(record);
    if (warnings?.length) toast.warning('Salvo com avisos', { description: warnings.join('\n') });
    await refetch();
  }, [api, refetch]);

  const patch = useCallback(async (id: string, updates: Record<string, unknown>) => {
    await api.patch(id, updates); await refetch();
  }, [api, refetch]);

  const remove = useCallback(async (id: string) => { await api.remove(id); await refetch(); }, [api, refetch]);
  const reset = useCallback(async (id: string) => {
    await api.reset(id); toast.success('Restaurado ao padrão'); await refetch();
  }, [api, refetch]);

  useEffect(() => { refetch(); }, [refetch]);
  return { rows, loading, error, save, patch, remove, reset, refetch };
}

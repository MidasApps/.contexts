'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchTemplates, saveTemplate, patchTemplate, deleteTemplate, duplicateTemplate,
  type TemplateRecord,
} from '@/shared/lib/firestore/dashboard-templates';

export function useAdminTemplates() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await fetchTemplates());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (record: Partial<TemplateRecord> & { id: string }) => {
    const { warnings } = await saveTemplate(record);
    // productRefs são soft (frente-A): warnings não bloqueiam o save,
    // só sinalizam refs órfãs como aviso não-bloqueante.
    if (warnings && warnings.length > 0) {
      toast.warning('Template salvo com avisos', { description: warnings.join('\n') });
    }
    await refetch();
  }, [refetch]);

  const patch = useCallback(async (id: string, updates: Partial<TemplateRecord>) => {
    await patchTemplate(id, updates);
    await refetch();
  }, [refetch]);

  const remove = useCallback(async (id: string) => {
    await deleteTemplate(id);
    await refetch();
  }, [refetch]);

  const duplicate = useCallback(async (id: string) => {
    const newId = await duplicateTemplate(id);
    await refetch();
    return newId;
  }, [refetch]);

  useEffect(() => { refetch(); }, [refetch]);

  return { templates, loading, error, save, patch, remove, duplicate, refetch };
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchTemplates, type TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates((await fetchTemplates()).filter((t) => t.status !== 'archived'));
    } catch (error) {
      console.error('[useTemplates] Error:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { templates, loading, refetch };
}

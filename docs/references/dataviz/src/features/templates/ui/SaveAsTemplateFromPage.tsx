'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTemplates } from '@/shared/hooks/useTemplates';
import { useProductsList } from '@/shared/hooks/useProducts';
import { saveTemplate, patchTemplate } from '@/shared/lib/firestore/dashboard-templates';
import {
  SaveAsTemplateDialog,
  type PageForTemplate,
  type SaveAsTemplateSubmit,
} from './SaveAsTemplateDialog';

interface SaveAsTemplateFromPageProps {
  open: boolean;
  onClose: () => void;
  page: PageForTemplate;
  pendingDraft?: boolean;
}

/**
 * Liga o diálogo aos dados: catálogo de templates, produtos ativos e a
 * escrita no Firestore. O diálogo em si não conhece hook nem rede.
 */
export function SaveAsTemplateFromPage({
  open,
  onClose,
  page,
  pendingDraft,
}: SaveAsTemplateFromPageProps) {
  const { templates, refetch } = useTemplates();
  const { products } = useProductsList();

  const handleSubmit = useCallback(
    async ({ mode, record }: SaveAsTemplateSubmit) => {
      if (mode === 'create') {
        await saveTemplate(record);
      } else {
        /*
         * PATCH (`update()`), e não o upsert do POST: `set(..., { merge: true })`
         * mescla mapas em PROFUNDIDADE, então os blocos do template antigo
         * sobreviveriam dentro do blockMap novo. Pelo mesmo motivo `filters` e
         * `queries` vão como `null` quando a página não os tem — omitir
         * deixaria os do template anterior no lugar.
         */
        const { id, ...rest } = record;
        await patchTemplate(id, {
          ...rest,
          filters: record.filters ?? null,
          queries: record.queries ?? null,
        });
      }
      await refetch();
      toast.success(
        mode === 'create' ? `Template "${record.name}" criado` : `Template "${record.name}" atualizado`,
      );
    },
    [refetch],
  );

  return (
    <SaveAsTemplateDialog
      open={open}
      onClose={onClose}
      page={page}
      templates={templates}
      products={products.map((p) => ({ id: p.id, name: p.name }))}
      pendingDraft={pendingDraft}
      onSubmit={handleSubmit}
    />
  );
}

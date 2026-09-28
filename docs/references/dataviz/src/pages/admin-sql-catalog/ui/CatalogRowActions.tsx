'use client';

import { useState } from 'react';
import type { SqlCatalogRow } from '@/features/sql-catalog/repository';
import { Button } from '@/shared/ui/button';

interface Props {
  row: SqlCatalogRow;
  onApprove: (qualityScore: number) => void;
  onReject: () => void;
  onEdit: () => void;
  onRevalidate: () => void;
}

export function CatalogRowActions({ row, onApprove, onReject, onEdit, onRevalidate }: Props) {
  const [busy, setBusy] = useState(false);

  const canApprove = row.status === 'draft' || row.status === 'needs_revalidation';
  const canReject = row.status !== 'deprecated';
  // Aprovada também: aprovações feitas antes do escopo por cliente precisam
  // poder ser rechecadas — e, se falharem, saem de `approved`.
  const canRevalidate = row.status === 'needs_revalidation' || row.status === 'approved';

  return (
    <div className="flex items-center gap-1">
      {canApprove ? (
        <Button
          size="sm"
          variant="outline"
          aria-label={`approve-${row.id}`}
          disabled={busy}
          onClick={() => {
            const raw = window.prompt('Quality score (0-1):', String(row.quality_score ?? 0.8));
            if (raw == null) return;
            const qs = Number(raw);
            if (!Number.isFinite(qs)) return;
            setBusy(true);
            try {
              onApprove(qs);
            } finally {
              setBusy(false);
            }
          }}
        >
          Approve
        </Button>
      ) : null}
      <Button size="sm" variant="outline" aria-label={`edit-${row.id}`} onClick={onEdit}>
        Edit
      </Button>
      {canRevalidate ? (
        <Button size="sm" variant="outline" aria-label={`revalidate-${row.id}`} onClick={onRevalidate}>
          Revalidate
        </Button>
      ) : null}
      {canReject ? (
        <Button size="sm" variant="destructive" aria-label={`reject-${row.id}`} onClick={onReject}>
          Reject
        </Button>
      ) : null}
    </div>
  );
}

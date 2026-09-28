'use client';

import { useState, useEffect } from 'react';
import type { SqlCatalogRow } from '@/features/sql-catalog/repository';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { sqlCatalogApi } from '@/shared/hooks/useSqlCatalog';

interface Props {
  row: SqlCatalogRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function CatalogEditDialog({ row, open, onClose, onSaved }: Props) {
  const [sql, setSql] = useState('');
  const [intent, setIntent] = useState('');
  const [dryRunOk, setDryRunOk] = useState<null | { valid: boolean; message?: string }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) {
      setSql(row.sql);
      setIntent(row.intent);
      // se o SQL não foi alterado, não exigimos novo dry-run
      setDryRunOk({ valid: true });
    }
  }, [row]);

  if (!row) return null;

  const sqlChanged = sql !== row.sql;
  const saveDisabled = busy || (sqlChanged && !dryRunOk?.valid);

  async function runDryRun() {
    if (!row) return;
    setBusy(true);
    try {
      const res = await sqlCatalogApi.dryRun(sql, row.client_id);
      if (res.ok) {
        setDryRunOk({ valid: true });
      } else {
        const body = await res.json().catch(() => ({}));
        setDryRunOk({ valid: false, message: body.error ?? 'dry_run failed' });
      }
    } catch (err) {
      setDryRunOk({ valid: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!row) return;
    setBusy(true);
    try {
      const res = await sqlCatalogApi.update(row.id, {
        intent,
        ...(sqlChanged ? { sql } : {}),
      });
      if (res.ok) {
        onSaved();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar entrada do catálogo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Intent
            <input
              aria-label="edit-intent"
              className="rounded border border-border bg-muted/40 px-2 py-1 text-sm text-foreground"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            SQL
            <textarea
              aria-label="edit-sql"
              className="min-h-[160px] rounded border border-border bg-muted/40 px-2 py-1 font-mono text-xs text-foreground"
              value={sql}
              onChange={(e) => {
                setSql(e.target.value);
                if (e.target.value !== row.sql) setDryRunOk(null);
              }}
            />
          </label>
          {sqlChanged ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={runDryRun} disabled={busy}>
                Run dry-run
              </Button>
              {dryRunOk == null ? (
                <span className="text-xs text-muted-foreground">Dry-run requerido antes de salvar.</span>
              ) : dryRunOk.valid ? (
                <span className="text-xs text-emerald-400">dry-run ok</span>
              ) : (
                <span className="text-xs text-red-400">dry-run falhou: {dryRunOk.message}</span>
              )}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button aria-label="save-edit" onClick={save} disabled={saveDisabled}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

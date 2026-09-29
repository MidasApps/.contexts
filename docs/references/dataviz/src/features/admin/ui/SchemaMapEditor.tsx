'use client';

import { useMemo } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Attribute, Entity, SemanticSchemaBinding } from '@/shared/schemas';
import { useContractSchema } from '@/features/admin/model/useContractSchema';
import { resolveSchemaBindings } from '@/shared/lib/semantic/flatten-binding';

/**
 * Editor de mapeamento `entity.attribute → coluna real do BigQuery` (ADR-0015).
 *
 * Lê entities/attributes do Data Contract via useContractSchema(contractId) e
 * trabalha com `schemaBindings` flat: { "entity.attribute": "coluna" | null }.
 * O botão "Auto-detect with AI" dispara o callback do caller (que aplica o
 * binding detectado no dataset). Sem contrato/entidades ⇒ empty-state.
 */

export interface SchemaMapEditorProps {
  /** Contract de referência. Ex.: "canonical". */
  contractId?: string | null;
  /** Bindings flat. */
  schemaBindings?: SemanticSchemaBinding;
  onChangeBindings?: (next: SemanticSchemaBinding) => void;

  onDetect?: () => Promise<void>;
  detecting?: boolean;
  lastSync?: string | null;
}

export function SchemaMapEditor({
  contractId,
  schemaBindings,
  onChangeBindings,
  onDetect,
  detecting = false,
  lastSync,
}: SchemaMapEditorProps) {
  const { schema, loading, error } = useContractSchema(contractId ?? null);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground/80">
        <Loader2 className="size-4 animate-spin mx-auto mb-2" />
        Loading contract schema…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
        Failed to load contract: {error}
      </div>
    );
  }

  if (schema.length > 0 && onChangeBindings) {
    return (
      <SemanticEditor
        contractId={contractId!}
        schema={schema}
        bindings={resolveSchemaBindings({ schemaBindings })}
        onChange={onChangeBindings}
        onDetect={onDetect}
        detecting={detecting}
        lastSync={lastSync}
      />
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground/80">
      {contractId
        ? `Contract "${contractId}" has no entities — add some in the Data Contracts tab.`
        : 'Product has no contract reference.'}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Semantic layer editor
// ═══════════════════════════════════════════════════════════════

interface SemanticEditorProps {
  contractId: string;
  schema: { entity: Entity; attributes: Attribute[] }[];
  bindings: SemanticSchemaBinding;
  onChange: (next: SemanticSchemaBinding) => void;
  onDetect?: () => Promise<void>;
  detecting: boolean;
  lastSync?: string | null;
}

function SemanticEditor({
  contractId,
  schema,
  bindings,
  onChange,
  onDetect,
  detecting,
  lastSync,
}: SemanticEditorProps) {
  function getValue(entityId: string, attributeId: string): string | null {
    const key = `${entityId}.${attributeId}`;
    if (!(key in bindings)) return attributeId; // default: nome canônico
    return bindings[key];
  }

  function setValue(entityId: string, attributeId: string, value: string | null) {
    const key = `${entityId}.${attributeId}`;
    onChange({ ...bindings, [key]: value });
  }

  function toggle(entityId: string, attributeId: string) {
    const current = getValue(entityId, attributeId);
    setValue(entityId, attributeId, current === null ? attributeId : null);
  }

  function handleInput(entityId: string, attributeId: string, value: string) {
    setValue(entityId, attributeId, value.trim() || attributeId);
  }

  // Stats globais para o header
  const totalAttrs = useMemo(
    () => schema.reduce((acc, e) => acc + e.attributes.length, 0),
    [schema],
  );
  const unavailableCount = useMemo(
    () =>
      schema.reduce((acc, e) => {
        for (const a of e.attributes) {
          if (getValue(e.entity.id, a.id) === null) acc++;
        }
        return acc;
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bindings, schema],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-foreground">Schema Mapping</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            contract: {contractId}
          </span>
          <span className="text-[10px] text-muted-foreground/80">
            {totalAttrs} attributes ·{' '}
            <span className={unavailableCount > 0 ? 'text-amber-300' : 'text-emerald-400/70'}>
              {unavailableCount} unavailable
            </span>
          </span>
          {lastSync && (
            <span className="text-[10px] text-muted-foreground/60">Last detection: {lastSync}</span>
          )}
        </div>
        {onDetect && (
          <button
            type="button"
            onClick={onDetect}
            disabled={detecting}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[11px] font-medium transition-colors',
              detecting
                ? 'border-border bg-muted/40 text-muted-foreground/60 cursor-not-allowed'
                : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20',
            )}
          >
            {detecting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            Auto-detect with AI
          </button>
        )}
      </div>

      {schema.map(({ entity, attributes }) => (
        <div
          key={entity.id}
          className="rounded-lg border border-border bg-muted/40 overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 bg-muted/40">
            <span className="font-mono text-[11px] font-semibold text-primary">
              {entity.id}
            </span>
            <span className="text-[10px] text-muted-foreground/80">{entity.label}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">
              {attributes.length} attribute{attributes.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-[1.2fr_1fr_0.4fr_28px] gap-2 px-3 py-1 border-b border-border bg-black/20">
            <Col>Attribute</Col>
            <Col>Coluna real</Col>
            <Col>Tipo</Col>
            <span />
          </div>

          <div className="divide-y divide-foreground/[0.03]">
            {attributes.map((attr) => {
              const value = getValue(entity.id, attr.id);
              const isUnavailable = value === null;
              return (
                <div
                  key={attr.id}
                  className={cn(
                    'grid grid-cols-[1.2fr_1fr_0.4fr_28px] gap-2 items-center px-3 py-1.5 transition-colors',
                    isUnavailable
                      ? 'bg-red-500/[0.03]'
                      : attr.deprecated
                        ? 'bg-amber-500/[0.03]'
                        : 'hover:bg-muted/40',
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-foreground truncate flex items-center gap-1">
                      {attr.id}
                      {attr.isKey && (
                        <span className="text-[9px] text-primary font-semibold">KEY</span>
                      )}
                      {attr.required && !attr.isKey && (
                        <span className="text-[9px] text-muted-foreground/60">req</span>
                      )}
                      {attr.deprecated && (
                        <AlertTriangle
                          className="size-3 text-amber-400"
                          aria-label="deprecated"
                        />
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 truncate">
                      {attr.label}
                      {attr.unit && (
                        <span className="ml-1 text-muted-foreground/60">· {attr.unit}</span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    {isUnavailable ? (
                      <span className="font-mono text-[11px] italic text-red-400/70">
                        unavailable
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={value ?? ''}
                        onChange={(e) => handleInput(entity.id, attr.id, e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:bg-muted/50 transition-colors"
                        placeholder={attr.id}
                      />
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-muted-foreground/80">{attr.type}</span>

                  <button
                    type="button"
                    onClick={() => toggle(entity.id, attr.id)}
                    title={isUnavailable ? 'Mark as available' : 'Mark as unavailable'}
                    className={cn(
                      'size-5 rounded flex items-center justify-center border transition-colors',
                      isUnavailable
                        ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
                    )}
                  >
                    {isUnavailable ? <X className="size-3" /> : <Check className="size-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Col({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
      {children}
    </span>
  );
}

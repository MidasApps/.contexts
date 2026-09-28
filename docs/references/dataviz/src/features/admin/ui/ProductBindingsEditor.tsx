'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import type {
  ClientDatasetBinding,
  ClientProductBinding,
  DataSource,
  Product,
  SemanticSchemaBinding,
} from '@/shared/schemas';
import type { CoverageGap } from '@/shared/lib/metrics/coverage';
import { SchemaMapEditor } from './SchemaMapEditor';
import { makeDatasetBinding } from '@/features/admin/model/make-dataset-binding';

/**
 * Editor de assinaturas de produto do cliente.
 * Cada binding = um produto; cada binding tem 1+ datasets.
 */

export interface ProductBindingsEditorProps {
  bindings: ClientProductBinding[];
  onChange: (bindings: ClientProductBinding[]) => void;
  products: Product[];
  dataSources: DataSource[];
  onDetectSchema?: (params: {
    productId: string;
    contractRef: string;
    dataSourceId: string;
    datasetId: string;
  }) => Promise<{ schemaBindings: SemanticSchemaBinding; coverage: CoverageGap[] }>;
}

export function ProductBindingsEditor({
  bindings,
  onChange,
  products,
  dataSources,
  onDetectSchema,
}: ProductBindingsEditorProps) {
  const [expanded, setExpanded] = useState<string | null>(bindings[0]?.productId ?? null);

  const assignedProductIds = new Set(bindings.map((b) => b.productId));
  const availableProducts = products.filter((p) => !assignedProductIds.has(p.id));

  function addBinding(productId: string) {
    const product = products.find((p) => p.id === productId);
    const contractRef = product?.contractRefs?.[0] ?? '';
    const newBinding: ClientProductBinding = {
      productId,
      datasets: [makeDatasetBinding({ contractRef, dataSourceId: dataSources[0]?.id })],
      enabledIndicators: null,
    };
    onChange([...bindings, newBinding]);
    setExpanded(productId);
  }

  function removeBinding(productId: string) {
    onChange(bindings.filter((b) => b.productId !== productId));
  }

  function updateBinding(productId: string, patch: Partial<ClientProductBinding>) {
    onChange(bindings.map((b) => (b.productId === productId ? { ...b, ...patch } : b)));
  }

  function updateDataset(
    productId: string,
    datasetIndex: number,
    patch: Partial<ClientDatasetBinding>,
  ) {
    const binding = bindings.find((b) => b.productId === productId);
    if (!binding) return;
    const datasets = binding.datasets.map((d, i) => (i === datasetIndex ? { ...d, ...patch } : d));
    updateBinding(productId, { datasets });
  }

  function addDataset(productId: string) {
    const binding = bindings.find((b) => b.productId === productId);
    if (!binding) return;
    const product = products.find((p) => p.id === productId);
    const contractRef = product?.contractRefs?.[0] ?? '';
    updateBinding(productId, {
      datasets: [
        ...binding.datasets,
        makeDatasetBinding({ contractRef, dataSourceId: dataSources[0]?.id, index: binding.datasets.length }),
      ],
    });
  }

  function removeDataset(productId: string, datasetIndex: number) {
    const binding = bindings.find((b) => b.productId === productId);
    if (!binding || binding.datasets.length <= 1) return;
    updateBinding(productId, {
      datasets: binding.datasets.filter((_, i) => i !== datasetIndex),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Assinaturas de Produto</span>
        <div className="flex items-center gap-2">
          {availableProducts.length > 0 ? (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addBinding(e.target.value);
              }}
              className="rounded-md border border-border bg-muted/40 px-3 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="" className="bg-popover">+ Adicionar produto…</option>
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id} className="bg-popover">
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">Todos os produtos já assinados.</span>
          )}
        </div>
      </div>

      {bindings.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground/80">
          Nenhuma assinatura. Selecione um produto acima para começar.
        </div>
      )}

      {bindings.map((binding) => {
        const product = products.find((p) => p.id === binding.productId);
        const isOpen = expanded === binding.productId;

        return (
          <div
            key={binding.productId}
            className="rounded-xl border border-border bg-muted/40 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : binding.productId)}
              className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-muted/40 transition-colors"
            >
              {isOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <span
                className="size-5 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${product?.color ?? '#333'}22` }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: product?.color ?? '#888' }}
                />
              </span>
              <span className="font-semibold text-xs text-foreground">
                {product?.name ?? binding.productId}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground/60">
                {binding.datasets.length} dataset{binding.datasets.length !== 1 ? 's' : ''}
              </span>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  removeBinding(binding.productId);
                }}
                className="text-muted-foreground/60 hover:text-red-400 transition-colors rounded p-1 cursor-pointer"
              >
                <Trash2 className="size-3" />
              </div>
            </button>

            {isOpen && product && (
              <div className="border-t border-border p-4 space-y-4 bg-black/20">
                {binding.datasets.map((dataset, dIndex) => (
                  <DatasetBindingCard
                    key={dIndex}
                    dataset={dataset}
                    dataSources={dataSources}
                    product={product}
                    canRemove={binding.datasets.length > 1}
                    onChange={(patch) => updateDataset(binding.productId, dIndex, patch)}
                    onRemove={() => removeDataset(binding.productId, dIndex)}
                    onDetectSchema={
                      onDetectSchema
                        ? async () => {
                            if (!dataset.dataSourceId || !dataset.datasetId) return;
                            const contractRef = dataset.contractRef ?? product.contractRefs?.[0] ?? 'canonical';
                            const { schemaBindings, coverage } = await onDetectSchema({
                              productId: binding.productId,
                              contractRef,
                              dataSourceId: dataset.dataSourceId,
                              datasetId: dataset.datasetId,
                            });
                            updateDataset(binding.productId, dIndex, {
                              schemaBindings,
                              lastSchemaSync: new Date().toISOString(),
                            });
                            return coverage;
                          }
                        : undefined
                    }
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addDataset(binding.productId)}
                  className="gap-1.5 text-xs h-7"
                >
                  <Plus className="size-3.5" /> Dataset
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────

interface DatasetBindingCardProps {
  dataset: ClientDatasetBinding;
  dataSources: DataSource[];
  product: Product;
  canRemove: boolean;
  onChange: (patch: Partial<ClientDatasetBinding>) => void;
  onRemove: () => void;
  onDetectSchema?: () => Promise<CoverageGap[] | void>;
}

function DatasetBindingCard({
  dataset,
  dataSources,
  product,
  canRemove,
  onChange,
  onRemove,
  onDetectSchema,
}: DatasetBindingCardProps) {
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);

  async function handleDetect() {
    if (!onDetectSchema) return;
    setDetecting(true);
    setDetectError(null);
    try {
      const coverage = await onDetectSchema();
      setGaps(Array.isArray(coverage) ? coverage : []);
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : 'Erro ao detectar schema.');
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-black/30 p-3 space-y-3">
      {detectError && (
        <p className="text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
          {detectError}
        </p>
      )}
      <div className="flex items-start gap-2">
        <div className="grid grid-cols-3 gap-2 flex-1">
          <div>
            <Label>ID do binding</Label>
            <Input
              value={dataset.id}
              onChange={(e) => onChange({ id: e.target.value.trim() })}
              placeholder="main"
              className="bg-muted/40 border-border text-foreground text-xs font-mono h-8"
            />
          </div>
          <div>
            <Label>DataSource</Label>
            <select
              value={dataset.dataSourceId}
              onChange={(e) => onChange({ dataSourceId: e.target.value })}
              className="w-full rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground h-8 focus:outline-none focus:border-primary/50"
            >
              <option value="" className="bg-popover">—</option>
              {dataSources.map((ds) => (
                <option key={ds.id} value={ds.id} className="bg-popover">
                  {ds.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Dataset ID</Label>
            <Input
              value={dataset.datasetId}
              onChange={(e) => onChange({ datasetId: e.target.value.trim() })}
              placeholder="nome_do_dataset"
              className="bg-muted/40 border-border text-foreground text-xs font-mono h-8"
            />
          </div>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground/60 hover:text-red-400 transition-colors p-1 mt-4"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>

      <div>
        <Label>Contrato</Label>
        <select
          value={dataset.contractRef ?? ''}
          onChange={(e) => onChange({ contractRef: e.target.value })}
          className="w-full rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground h-8 focus:outline-none focus:border-primary/50"
        >
          {(product.contractRefs ?? []).length === 0 && (
            <option value="">— produto sem contrato —</option>
          )}
          {(product.contractRefs ?? []).map((c) => (
            <option key={c} value={c} className="bg-popover">{c}</option>
          ))}
        </select>
      </div>

      <SchemaMapEditor
        contractId={dataset.contractRef ?? product.contractRefs?.[0] ?? null}
        schemaBindings={dataset.schemaBindings}
        onChangeBindings={(schemaBindings) => onChange({ schemaBindings })}
        onDetect={onDetectSchema ? handleDetect : undefined}
        detecting={detecting}
        lastSync={
          typeof dataset.lastSchemaSync === 'string'
            ? new Date(dataset.lastSchemaSync).toLocaleString('pt-BR')
            : null
        }
      />

      {gaps.length > 0 && (
        <p className="text-[11px] text-amber-300">
          {gaps.length} atributo(s) exigido(s) por métricas contratadas sem coluna mapeada.
        </p>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn('text-[10px] text-muted-foreground uppercase tracking-wider block mb-1')}>
      {children}
    </span>
  );
}

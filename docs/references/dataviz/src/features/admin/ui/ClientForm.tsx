'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import type {
  ClientProductBinding,
  SemanticSchemaBinding,
} from '@/shared/schemas';
import type { CoverageGap } from '@/shared/lib/metrics/coverage';
import type { Client, ClientDoc } from '@/features/admin/model/types';
import { useAdminProducts } from '@/features/admin/model/useAdminProducts';
import { useAdminDataSources } from '@/features/admin/model/useAdminDataSources';
import { ProductBindingsEditor } from './ProductBindingsEditor';
import { BusinessProfileEditor, EMPTY_PROFILE } from './BusinessProfileEditor';
import type { ClientBusinessProfile } from '@/shared/schemas/client';
import { slugify } from '@/shared/lib/slug';

const PRESET_COLORS = ['#F3A169', '#6B8AFF', '#4ECDC4', '#FF6B6B', '#A78BFA', '#34D399'];

/** true se o administrador preencheu qualquer campo do perfil. */
function filledProfile(p: ClientBusinessProfile): boolean {
  return Boolean(
    p.dominantProduct || p.partitionKey || p.granularity ||
    p.tablesPreferred.length || p.glossaryOverrides.length ||
    p.complianceConstraints.length || p.avgLtv != null || p.wal != null || p.ocTarget != null,
  );
}

interface ClientFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: Omit<ClientDoc, 'createdAt' | 'updatedAt'>) => Promise<void>;
  client?: Client;
}

export function ClientForm({ open, onClose, onSave, client }: ClientFormProps) {
  const isEdit = !!client;
  const { products } = useAdminProducts();
  const { dataSources } = useAdminDataSources();

  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bindings, setBindings] = useState<ClientProductBinding[]>([]);
  const [profile, setProfile] = useState<ClientBusinessProfile>(EMPTY_PROFILE);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setName(client.name);
      setInitial(client.initial);
      setSelectedColor(client.color);
      setBindings(client.productBindings ?? []);
      setProfile(client.businessProfile ?? EMPTY_PROFILE);
    } else {
      setName('');
      setInitial('');
      setSelectedColor(PRESET_COLORS[0]);
      setBindings([]);
      setProfile(EMPTY_PROFILE);
    }
    setError('');
  }, [open, client]);

  const generatedId = isEdit ? client!.id : slugify(name);

  const handleDetectBinding = async (params: {
    productId: string;
    contractRef: string;
    dataSourceId: string;
    datasetId: string;
  }): Promise<{ schemaBindings: SemanticSchemaBinding; coverage: CoverageGap[] }> => {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) throw new Error('Usuário não autenticado.');

    const res = await fetch('/api/schema-detect/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
    return { schemaBindings: body.data?.schemaBindings ?? {}, coverage: body.data?.coverage ?? [] };
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    if (!initial.trim()) {
      setError('Inicial é obrigatória');
      return;
    }
    if (bindings.length === 0) {
      setError('Adicione ao menos uma assinatura de produto');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave(generatedId, {
        name: name.trim(),
        initial: initial.trim().charAt(0).toUpperCase(),
        color: selectedColor,
        productBindings: bindings,
        // Perfil totalmente vazio grava `null` em vez de objeto de campos
        // vazios — assim `businessProfile` ausente e não-preenchido são a
        // mesma coisa para quem lê.
        businessProfile: filledProfile(profile) ? profile : null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEdit ? 'Editar Cliente' : 'Adicionar Cliente'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ID preview */}
          <Field label="ID">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground/80 font-mono">
              {generatedId || '—'}
            </div>
          </Field>

          {/* Nome */}
          <Field label="Nome">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do cliente"
              disabled={saving}
              className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40"
            />
          </Field>

          <div className="grid grid-cols-[120px_1fr] gap-3">
            {/* Inicial */}
            <Field label="Inicial">
              <Input
                value={initial}
                onChange={(e) => setInitial(e.target.value.charAt(0))}
                maxLength={1}
                placeholder="A"
                disabled={saving}
                className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40 uppercase"
              />
            </Field>

            {/* Cor */}
            <Field label="Cor">
              <div className="flex gap-2 flex-wrap pt-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    style={{ backgroundColor: color }}
                    className={cn(
                      'size-7 rounded-full border-2 transition-all',
                      selectedColor === color ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100',
                    )}
                    title={color}
                  />
                ))}
              </div>
            </Field>
          </div>

          <BusinessProfileEditor value={profile} onChange={setProfile} />

          <ProductBindingsEditor
            bindings={bindings}
            onChange={setBindings}
            products={products}
            dataSources={dataSources}
            onDetectSchema={handleDetectBinding}
          />

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

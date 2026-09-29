'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useAdminEntities } from '@/features/admin/model/useAdminEntities';
import { useAdminAttributes } from '@/features/admin/model/useAdminAttributes';
import type { Attribute, Entity } from '@/shared/schemas';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { EntityForm } from './EntityForm';
import { AttributeForm } from './AttributeForm';

interface EntityEditorProps {
  contractId: string;
}

export function EntityEditor({ contractId }: EntityEditorProps) {
  const { entities, loading, error, save: saveEntity, remove: removeEntity } = useAdminEntities(contractId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entityFormOpen, setEntityFormOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | undefined>();
  const [confirmDeleteEntity, setConfirmDeleteEntity] = useState<Entity | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {loading ? 'Loading entities...' : `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="text-[11px] h-7 px-2"
          onClick={() => {
            setEditingEntity(undefined);
            setEntityFormOpen(true);
          }}
        >
          <Plus className="size-3" />
          New entity
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {entities.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-xs text-muted-foreground/80">
          No entities in this contract. Add the first one to start declaring attributes.
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((entity) => (
            <EntityRow
              key={entity.id}
              contractId={contractId}
              entity={entity}
              expanded={expanded === entity.id}
              onToggle={() => setExpanded(expanded === entity.id ? null : entity.id)}
              onEdit={() => {
                setEditingEntity(entity);
                setEntityFormOpen(true);
              }}
              onDelete={() => setConfirmDeleteEntity(entity)}
            />
          ))}
        </div>
      )}

      <EntityForm
        open={entityFormOpen}
        onClose={() => setEntityFormOpen(false)}
        onSave={saveEntity}
        entity={editingEntity}
        contractId={contractId}
      />

      <ConfirmDialog
        open={confirmDeleteEntity !== null}
        onOpenChange={(open) => !open && setConfirmDeleteEntity(null)}
        destructive
        title="Apagar entity"
        description={
          confirmDeleteEntity
            ? `Esta ação remove a entity "${confirmDeleteEntity.id}" e TODAS suas attributes do Firestore.\n\nMétricas que dependem destas attributes vão falhar.\n\nAção irreversível.`
            : ''
        }
        confirmLabel="Apagar entity"
        onConfirm={async () => {
          if (confirmDeleteEntity) await removeEntity(confirmDeleteEntity.id);
        }}
      />
    </div>
  );
}

interface EntityRowProps {
  contractId: string;
  entity: Entity;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function EntityRow({ contractId, entity, expanded, onToggle, onEdit, onDelete }: EntityRowProps) {
  const {
    attributes,
    save: saveAttribute,
    rename: renameAttribute,
    remove: removeAttribute,
  } = useAdminAttributes(contractId, expanded ? entity.id : null);

  return (
    <div className="rounded-lg border border-border bg-muted/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground/80" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground/80" />
          )}
          <span className="text-sm text-foreground font-mono">{entity.id}</span>
          <span className="text-xs text-muted-foreground/80">— {entity.label}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Edit entity"
        >
          <Pencil className="size-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          title="Delete entity (cascade attributes)"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {expanded && (
        <AttributesTable
          attributes={attributes}
          entityId={entity.id}
          onSave={saveAttribute}
          onRename={renameAttribute}
          onRemove={removeAttribute}
        />
      )}
    </div>
  );
}

interface AttributesTableProps {
  attributes: Attribute[];
  entityId: string;
  onSave: (data: Omit<Attribute, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onRename: (oldId: string, data: Omit<Attribute, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onRemove: (attributeId: string) => Promise<void>;
}

function AttributesTable({ attributes, entityId, onSave, onRename, onRemove }: AttributesTableProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Attribute | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<Attribute | null>(null);

  return (
    <div className="border-t border-border bg-black/20 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Attributes ({attributes.length})
        </span>
        <Button
          size="sm"
          variant="outline"
          className="text-[10px] h-6 px-2"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus className="size-3" />
          New
        </Button>
      </div>

      {attributes.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 px-2 py-1">No attributes.</p>
      ) : (
        <div className="space-y-1">
          {attributes.map((attr) => (
            <div
              key={attr.id}
              className={`grid grid-cols-[1.2fr_1.5fr_0.7fr_0.5fr_0.6fr_24px_24px] gap-2 px-2 py-1.5 rounded items-center text-xs hover:bg-muted/40 transition-colors ${
                attr.deprecated ? 'opacity-50' : ''
              }`}
            >
              <span className="font-mono text-foreground flex items-center gap-1.5">
                {attr.id}
                {attr.deprecated && (
                  <AlertTriangle
                    className="size-3 text-amber-400"
                    aria-label={attr.deprecatedReason ?? 'deprecated'}
                  />
                )}
              </span>
              <span className="text-muted-foreground truncate">{attr.label}</span>
              <span className="text-muted-foreground/80 font-mono text-[10px]">{attr.type}</span>
              <span className="text-muted-foreground/80 text-[10px]">{attr.unit ?? '—'}</span>
              <span className="text-[10px] text-muted-foreground/80">
                {attr.isKey && 'key '}
                {attr.required && 'req'}
              </span>
              <button
                onClick={() => {
                  setEditing(attr);
                  setFormOpen(true);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Edit attribute"
              >
                <Pencil className="size-3" />
              </button>
              <button
                onClick={() => setConfirmDelete(attr)}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                title="Delete attribute (hard)"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AttributeForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={onSave}
        onRename={onRename}
        attribute={editing}
        entityId={entityId}
        existingIds={attributes.map((a) => a.id)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        destructive
        title="Apagar attribute"
        description={
          confirmDelete
            ? `Esta ação remove a attribute "${confirmDelete.id}" do Firestore.\n\nMétricas que dependem dela vão falhar.\n\nAção irreversível.`
            : ''
        }
        confirmLabel="Apagar attribute"
        onConfirm={async () => {
          if (confirmDelete) await onRemove(confirmDelete.id);
        }}
      />
    </div>
  );
}

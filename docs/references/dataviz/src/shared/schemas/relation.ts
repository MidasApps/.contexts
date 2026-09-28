import { z } from 'zod';
import { Slug } from './identifier';
import { AttributeRef } from './metric';

/**
 * Relation — chave de JOIN entre duas entidades, possivelmente de contratos
 * diferentes (cross-contract). Cidadã top-level (`relations/{id}`) porque uma
 * relação não pertence a um único contrato. Habilita métricas `derived`
 * (R2 — cruzamento). Ver docs/superpowers/specs/2026-06-22-metricas-cross-contract-design.md.
 */
export const RelationCardinality = z.enum([
  'one-to-one',
  'many-to-one',
  'one-to-many',
  'many-to-many',
]);

export const RelationDoc = z.object({
  label: z.string().min(1).max(120),
  /** "contractId.entityId.attributeId" (FK). */
  leftRef: AttributeRef,
  /** "contractId.entityId.attributeId" (alvo). */
  rightRef: AttributeRef,
  cardinality: RelationCardinality,
  description: z.string().max(500).optional().nullable(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const Relation = RelationDoc.extend({ id: Slug });

export type RelationCardinality = z.infer<typeof RelationCardinality>;
export type RelationDoc = z.infer<typeof RelationDoc>;
export type Relation = z.infer<typeof Relation>;

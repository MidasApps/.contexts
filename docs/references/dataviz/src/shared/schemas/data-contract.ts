import { z } from 'zod';
import { Slug, SqlIdentifier } from './identifier';
import { FieldType } from './product';

/**
 * Data Contract — camada semântica canônica.
 *
 * Define o vocabulário global de Entities (tabelas lógicas) e Attributes
 * (campos lógicos) que os Products consomem. Substitui a definição
 * embedded `expectedTables` que vivia dentro de Product (ADR-0015).
 *
 * Hierarquia Firestore:
 *   dataContracts/{contractId}                                       (doc)
 *     entities/{entityId}                                             (subcol)
 *       attributes/{attributeId}                                      (subcol)
 *
 * MVP: um único contract canônico (`canonical`). Schema já comporta
 * múltiplos contracts para fragmentação futura por domínio (credit,
 * covenants, etc.) — ver ADR-0015 §Single vs Multi-Contract.
 */

/** Semver `x.y.z`. */
const SemverString = z.string().regex(/^\d+\.\d+\.\d+$/, {
  message: 'Versão deve seguir semver (x.y.z)',
});

export const DataContractStatus = z.enum(['draft', 'active', 'deprecated']);

export const DataContractDoc = z.object({
  name: z.string().min(2).max(120),
  version: SemverString,
  status: DataContractStatus.default('draft'),
  description: z.string().max(1000).optional().nullable(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const DataContract = DataContractDoc.extend({
  id: Slug,
});

export const EntityDoc = z.object({
  label: z.string().min(1).max(80),
  description: z.string().max(500),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const Entity = EntityDoc.extend({
  id: SqlIdentifier,
});

export const AttributeDoc = z.object({
  /** Denormalizado para query — duplica o id da entity pai. */
  entityId: SqlIdentifier,
  label: z.string().min(1).max(80),
  description: z.string().max(500),
  type: FieldType,
  /** Unidade livre (BRL, %, dias, m², etc.). */
  unit: z.string().max(20).optional().nullable(),
  isKey: z.boolean().default(false),
  required: z.boolean().default(false),
  /**
   * Imutabilidade light: nunca deletar, só marcar deprecated. Métricas
   * que dependem continuam funcionando até serem migradas.
   */
  deprecated: z.boolean().default(false),
  deprecatedReason: z.string().max(200).optional().nullable(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const Attribute = AttributeDoc.extend({
  id: SqlIdentifier,
});

export type DataContractStatus = z.infer<typeof DataContractStatus>;
export type DataContractDoc = z.infer<typeof DataContractDoc>;
export type DataContract = z.infer<typeof DataContract>;
export type EntityDoc = z.infer<typeof EntityDoc>;
export type Entity = z.infer<typeof Entity>;
export type AttributeDoc = z.infer<typeof AttributeDoc>;
export type Attribute = z.infer<typeof Attribute>;

import { z } from 'zod';
import { Slug, SqlIdentifier } from './identifier';

/**
 * Mapeamento de schema de uma tabela: { campo_esperado -> coluna_real | null }.
 * `null` = campo explicitamente indisponível neste cliente.
 *
 * Formato legado (nested). Pós ADR-0015 a forma canônica é
 * `SemanticSchemaBinding` (flat, chave `entity.attribute`). Helper de
 * conversão em `src/shared/lib/semantic/flatten-binding.ts`.
 */
export const BindingTableSchema = z.record(
  SqlIdentifier,
  SqlIdentifier.nullable(),
);

/** Mapeamento completo legado: { tabela -> { campo -> coluna_real | null } }. */
export const BindingSchemaMap = z.record(SqlIdentifier, BindingTableSchema);

/**
 * Chave do `SemanticSchemaBinding`: `entityId.attributeId`. Ambos os
 * lados são `SqlIdentifier`-compatíveis (letra/underscore + alfanum).
 */
const SemanticBindingKey = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: 'Chave deve seguir o formato "entityId.attributeId"',
  });

/**
 * Mapeamento flat pós ADR-0015: { "entity.attribute" -> coluna_real | null }.
 * Substitui `BindingSchemaMap` na nova arquitetura. Coexiste durante a
 * migração; helper `flattenLegacyBinding` traduz entre as duas formas.
 */
export const SemanticSchemaBinding = z.record(
  SemanticBindingKey,
  SqlIdentifier.nullable(),
);

export const ClientDatasetBinding = z.object({
  id: Slug,
  dataSourceId: Slug,
  datasetId: SqlIdentifier,

  // ── Camada nova (ADR-0015) ───────────────────────────────────
  /** Contract referenciado por este dataset. MVP: `canonical`. */
  contractRef: Slug.default('canonical'),
  /** Mapeamento flat entity.attribute → coluna real | null. */
  schemaBindings: SemanticSchemaBinding.default({}),

  /**
   * Mapeamento opcional entidade → tabela física: { entityId -> tableId }.
   * Forward-looking: hoje todo cliente tem entityId == tableId (1:1), então
   * ausente/`{}` mantém o comportamento atual (entityId vira tableId). Permite
   * onboardar um cliente cujas tabelas físicas divergem do nome da entidade
   * sem renomear no BQ. Consumido por `resolve-metric.ts` (`tableRef`), que
   * trata ausência via `?.[entityId] ?? entityId`.
   *
   * `.optional()` (sem `.default({})`) é deliberado: manter a chave opcional no
   * tipo inferido evita exigir `tableBindings` em todos os literais de binding
   * já existentes (back-compat aditiva pura).
   */
  tableBindings: z.record(SqlIdentifier, SqlIdentifier).optional(),

  // ── Legado (mantido para coexistência — ADR-0015) ────────────
  /** @deprecated — substituído por `schemaBindings` flat. */
  schema: BindingSchemaMap.default({}),

  lastSchemaSync: z.unknown().optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const ClientProductBinding = z.object({
  productId: Slug,
  datasets: z.array(ClientDatasetBinding).min(1),
  /** IDs habilitados — strings livres para aceitar tanto ProductIndicator.id quanto Metric.id. */
  enabledIndicators: z.array(z.string()).optional().nullable(),
});

export type BindingTableSchema = z.infer<typeof BindingTableSchema>;
export type BindingSchemaMap = z.infer<typeof BindingSchemaMap>;
export type SemanticSchemaBinding = z.infer<typeof SemanticSchemaBinding>;
export type ClientDatasetBinding = z.infer<typeof ClientDatasetBinding>;
export type ClientProductBinding = z.infer<typeof ClientProductBinding>;

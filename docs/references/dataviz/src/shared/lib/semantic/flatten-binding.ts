import type {
  BindingSchemaMap,
  SemanticSchemaBinding,
} from '@/shared/schemas/client-binding';

/**
 * Helpers de conversão entre o `BindingSchemaMap` (legado, nested) e o
 * `SemanticSchemaBinding` (novo, flat). Pós ADR-0015 a camada semântica
 * usa a forma flat (`entity.attribute`); a forma legada permanece
 * gravada nos clientes não-migrados.
 *
 * Ambas as funções são puras e idempotentes — converter e re-converter
 * preserva o conteúdo (modulo ordenação de chaves).
 */

/**
 * Converte `{ tabela: { campo: coluna|null } }` em `{ "tabela.campo": coluna|null }`.
 *
 * - Mantém `null` (campo explicitamente indisponível) intacto.
 * - Subobjetos vazios são removidos (não geram chaves no resultado).
 */
export function flattenLegacyBinding(
  legacy: BindingSchemaMap | null | undefined,
): SemanticSchemaBinding {
  if (!legacy) return {};
  const flat: SemanticSchemaBinding = {};
  for (const [entityId, table] of Object.entries(legacy)) {
    if (!table) continue;
    for (const [attributeId, column] of Object.entries(table)) {
      flat[`${entityId}.${attributeId}`] = column;
    }
  }
  return flat;
}

/**
 * Converte `{ "tabela.campo": coluna|null }` em `{ tabela: { campo: coluna|null } }`.
 *
 * Útil em UI ou APIs que ainda esperam o shape nested. Chaves sem ponto
 * são silenciosamente descartadas (formato inválido).
 */
export function unflattenBinding(
  flat: SemanticSchemaBinding | null | undefined,
): BindingSchemaMap {
  if (!flat) return {};
  const nested: BindingSchemaMap = {};
  for (const [key, column] of Object.entries(flat)) {
    const dot = key.indexOf('.');
    if (dot === -1) continue;
    const entityId = key.slice(0, dot);
    const attributeId = key.slice(dot + 1);
    if (!entityId || !attributeId) continue;
    if (!nested[entityId]) nested[entityId] = {};
    nested[entityId][attributeId] = column;
  }
  return nested;
}

/**
 * Resolve a forma canônica de um binding dado um dataset que pode ter
 * `schemaBindings` (novo), `schema` (legado), ambos, ou nenhum.
 *
 * Prioridade: `schemaBindings` se não-vazio; senão flatten de `schema`.
 * Isso garante que o resolver SQL/UI tem sempre a forma flat para
 * trabalhar, independente do estado de migração do cliente.
 */
export function resolveSchemaBindings(input: {
  schemaBindings?: SemanticSchemaBinding | null;
  schema?: BindingSchemaMap | null;
  /**
   * Versão do formato do DOCUMENTO, quando declarada (achado R19).
   *
   * A prioridade abaixo é heurística: "usa o novo se não estiver vazio". Ela
   * acerta na prática e mente num caso — binding novo legitimamente VAZIO (o
   * administrador removeu todos os mapeamentos) cai no legado e ressuscita
   * colunas que ele acabou de tirar.
   *
   * Com `schemaVersion >= 2` a forma passa a ser declarada: o documento diz
   * que é flat, e vazio significa vazio. Documento sem o campo mantém a
   * heurística — é a fase `expand` da rule `migration`, em que os dois
   * formatos convivem.
   */
  schemaVersion?: number | null;
}): SemanticSchemaBinding {
  if (typeof input.schemaVersion === 'number' && input.schemaVersion >= 2) {
    return input.schemaBindings ?? {};
  }
  if (input.schemaBindings && Object.keys(input.schemaBindings).length > 0) {
    return input.schemaBindings;
  }
  return flattenLegacyBinding(input.schema);
}

import { z } from 'zod';

/**
 * Body de `POST /api/metrics/filter-values`: pede os valores que vão popular um
 * seletor de página.
 *
 * Dois modos, e o primeiro é o preferido desde a ADR-0026:
 *
 * - **campo do indicador** (`metricId` + `field`) — as opções saem do resultado
 *   da própria métrica, então são o mesmo texto que está na tela. É o único que
 *   alcança valor vindo de JOIN: "BANCO INTER" não é coluna de `transacoes`,
 *   é `b.nome_reduzido` do JOIN que a métrica faz.
 * - **atributo da entidade** (`attribute` [+ `labelAttribute`]) — o caminho
 *   anterior, mantido para os filtros já gravados. Lê a coluna crua da tabela
 *   da entidade e não enxerga JOIN nenhum.
 */
const Base = z.object({
  clientId: z.string().min(1),
  productId: z.string().min(1),
});

/**
 * `attribute` exige o formato `entity.attr` (mesmo vocabulário de
 * `schemaBindings` / `metric.requires`) — sem entidade, não há como localizar o
 * binding. `labelAttribute` é aditivo: quando mapeado, a rota também seleciona
 * a coluna de rótulo mantendo `value` como a chave real do filtro.
 */
const ByAttribute = Base.extend({
  attribute: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/),
  labelAttribute: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/).optional(),
});

/**
 * `field` é uma coluna do resultado da métrica, e precisa ser identificador SQL
 * — ela vira `SELECT DISTINCT <field>` sobre a query resolvida.
 */
const ByIndicatorField = Base.extend({
  metricId: z.string().min(1).max(120),
  field: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
});

export const FilterValuesBody = z.union([ByIndicatorField, ByAttribute]);

export type FilterValuesBody = z.infer<typeof FilterValuesBody>;

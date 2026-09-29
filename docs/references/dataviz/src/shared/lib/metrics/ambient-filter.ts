import { z } from 'zod';

/** Bucket numérico: igualdade exata OU intervalo (min/max inclusivos; abertos se ausentes). */
export const NumericBucket = z.union([
  z.object({ eq: z.number() }),
  z.object({ min: z.number().optional(), max: z.number().optional() }),
]);

/**
 * Filtro "ambiente": aplicado a uma métrica quando seu `attribute` (`entity.attr`)
 * pertence ao primaryEntity da métrica e está bound. Construído pelo consumidor
 * (G9-C.3) a partir dos filtros avançados da UI.
 *
 * - `in`: `coluna IN (valores)`.
 * - `numeric_buckets`: OR de buckets sobre a coluna (ex.: faixaAtraso → dias_atraso).
 */
export const AmbientFilter = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('in'),
    attribute: z.string(),
    values: z.array(z.union([z.string(), z.number()])),
  }),
  z.object({
    op: z.literal('numeric_buckets'),
    attribute: z.string(),
    buckets: z.array(NumericBucket),
  }),
]);

export type NumericBucket = z.infer<typeof NumericBucket>;
export type AmbientFilter = z.infer<typeof AmbientFilter>;

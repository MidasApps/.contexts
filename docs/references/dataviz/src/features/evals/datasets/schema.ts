/**
 * Zod schema canônico para `BriefingFixture` (Sprint 3.D, Task 9).
 *
 * Espelha `BriefingFixture` em `src/features/evals/scorers/types.ts`.
 * É a porta de entrada para validar `smoke-30.json`, `full-180.json` e
 * `gold-30.json`. Falha de parse é hard-fail no runner.
 */

import { z } from 'zod';
import { Slug } from '@/shared/schemas/identifier';

export const RegulatoryRefSchema = z.enum([
  'CMN_2682',
  'CVM_60',
  'Lei_13786',
  'CMN_4676',
  'IFRS_9',
]);

/**
 * Formato, não catálogo.
 *
 * Já foi um enum de tenants — primeiro próprio, depois derivado de uma lista no
 * código. Nas duas formas o efeito era o mesmo: uma fixture de avaliação
 * apontando para um cliente cadastrado depois do último deploy era rejeitada no
 * parse, e o runner tratava isso como hard-fail. Cliente é cadastro da
 * administração; o que a fixture precisa garantir é que o id tem forma de id.
 */
export const ClientIdSchema = Slug;

export const TemplateIdSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const BriefingFixtureSchema = z.object({
  id: z.string(),
  templateId: TemplateIdSchema,
  personaId: z.string(),
  clientId: ClientIdSchema,
  briefing: z.string().min(1),
  expectedKpis: z.array(z.string()),
  expectedVisuals: z.array(z.string()),
  expectedTopics: z.array(z.string()),
  expectedRegulatory: z.array(RegulatoryRefSchema).optional(),
  goldScores: z.record(z.string(), z.number()).optional(),
});

export type BriefingFixtureParsed = z.infer<typeof BriefingFixtureSchema>;

export const BriefingFixtureArraySchema = z.array(BriefingFixtureSchema);

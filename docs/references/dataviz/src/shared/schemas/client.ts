import { z } from 'zod';
import { Slug } from './identifier';
import { BindingSchemaMap, ClientProductBinding } from './client-binding';

/**
 * Client — organização assinante.
 *
 * O doc Firestore carrega tanto o modelo legado (`dataset` string +
 * `schema` flat) quanto o novo (`productBindings[]`). Ambos coexistem
 * durante a migração; leitores devem preferir `productBindings` se
 * presente e populado.
 */

export const LegacyClientSchemaMap = BindingSchemaMap;

/**
 * Perfil de negócio do cliente — o que o agente de IA precisa saber sobre a
 * carteira dele para responder no vocabulário certo.
 *
 * Vive NO DOCUMENTO DO CLIENTE, gerenciado pela administração. Antes era um
 * arquivo estático (`src/shared/config/business-context/clients/<id>.json`)
 * compilado no bundle, com nome de tabela do cliente escrito no código: uma
 * segunda fonte de verdade ao lado de `productBindings`, que só se descobria
 * divergente quando o agente citava uma tabela que já não existia. E onboardar
 * cliente exigia commit + deploy.
 *
 * Todo campo é opcional: cliente sem perfil funciona, o agente apenas responde
 * sem o contexto específico. Exigir o perfil transformaria "cadastro
 * incompleto" em "produto quebrado".
 */
export const ClientBusinessProfile = z.object({
  /** Uma frase sobre o produto de crédito dominante da carteira. */
  dominantProduct: z.string().max(500).optional(),
  avgLtv: z.number().optional(),
  wal: z.number().optional(),
  ocTarget: z.number().optional(),
  /**
   * Tabelas que o agente deve preferir, em `dataset.tabela`. Dica de prompt —
   * NÃO é fonte de verdade de binding: quem resolve dataset e coluna é
   * `productBindings`. Divergiu? `productBindings` vence.
   */
  tablesPreferred: z.array(z.string().max(200)).max(50).default([]),
  partitionKey: z.string().max(100).optional(),
  granularity: z.enum(['contrato', 'safra', 'carteira']).optional(),
  /** Termos que este cliente usa diferente do glossário padrão. */
  glossaryOverrides: z
    .array(
      z.object({
        term: z.string().min(1).max(100),
        definition: z.string().min(1).max(2000),
        sourceTable: z.string().max(200).optional(),
      }),
    )
    .max(100)
    .default([]),
  complianceConstraints: z.array(z.string().max(200)).max(50).default([]),
});
export type ClientBusinessProfile = z.infer<typeof ClientBusinessProfile>;

export const ClientDoc = z.object({
  name: z.string().min(2).max(120),
  initial: z.string().min(1).max(4),
  color: z.string().min(3).max(30),
  /** @deprecated — substituído por productBindings. Mantido para retrocompat. */
  dataset: z.string().optional().nullable(),
  /** @deprecated — idem. */
  schema: LegacyClientSchemaMap.optional().nullable(),
  /** Novo modelo multi-produto / multi-dataset. */
  productBindings: z.array(ClientProductBinding).default([]),
  /** Contexto de negócio para a IA. Opcional — ver `ClientBusinessProfile`. */
  businessProfile: ClientBusinessProfile.optional().nullable(),
  lastSchemaSync: z.unknown().optional().nullable(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const Client = ClientDoc.extend({
  id: Slug,
});

export type ClientDoc = z.infer<typeof ClientDoc>;
export type Client = z.infer<typeof Client>;

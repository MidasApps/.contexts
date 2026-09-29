import { z } from 'zod';
import { Slug, FirestoreDocId } from './identifier';

/**
 * Schemas dos payloads que DEFINEM permissão: `groups.routes[]` e
 * `users.clientAccess[].routeOverrides`.
 *
 * Motivo (achado R12 da revisão de 2026-08-04): estes dois campos entravam nas
 * rotas de admin por `as { ... }` — um cast, que o TypeScript apaga em runtime e
 * portanto não valida nada. O que é persistido aqui volta depois como entrada de
 * `canAccessRoute`, que decide acesso.
 *
 * Validação ESTRUTURAL, não catálogo fechado — deliberado. `canAccessRoute` faz
 * `routes.includes(route)` com match exato, então uma rota desconhecida é inerte:
 * não concede nada. O que quebra de verdade é confusão de tipo (objeto ou número
 * dentro do array chega a `forEach`/`includes` e ao claim) e array sem teto.
 * Fechar num enum de `ALL_ROUTES` travaria o admin ao salvar usuário legado: o
 * `GroupForm` filtra rotas mortas ao carregar, mas o `UserForm` não
 * (`UserForm.tsx:68`), então um doc com rota das páginas removidas do Play viraria
 * 400 sem o admin ter como corrigir pela UI.
 */

/** Teto de rotas por grupo/override. `ALL_ROUTES` tem 6 hoje; 100 é folga sem ser ilimitado. */
const MAX_ROUTES = 100;

/**
 * Path de rota concedível. Absoluto, sem query/hash/espaço — o valor é comparado
 * por igualdade exata em `canAccessRoute`, então qualquer decoração o torna
 * inerte e mascara erro de configuração.
 */
export const RoutePath = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9\-_/]*$/, {
    message: 'Rota deve ser um path absoluto (ex.: "/dashboard")',
  });

export const RouteList = z.array(RoutePath).max(MAX_ROUTES);

/** Corpo do POST /api/groups. */
export const GroupUpsertInput = z.object({
  /** Ausente ⇒ cria (Firestore gera o id). Presente ⇒ atualiza aquele doc. */
  id: FirestoreDocId.optional(),
  name: z.string().trim().min(1, 'Nome do grupo é obrigatório.').max(120),
  description: z.string().max(500).default(''),
  routes: RouteList.default([]),
});
export type GroupUpsertInput = z.infer<typeof GroupUpsertInput>;

/**
 * Entrada de `clientAccess`. A distinção entre os três estados de
 * `routeOverrides` é semântica e TEM que sobreviver ao parse:
 *   `null`/ausente ⇒ herda as rotas dos grupos;
 *   `[]`           ⇒ nega todas as rotas naquele cliente;
 *   `[...]`        ⇒ substitui as rotas dos grupos.
 * Ver `authorize.ts:47` (`Array.isArray` é o que separa herdar de negar).
 */
export const ClientAccessInput = z.object({
  clientId: Slug,
  routeOverrides: RouteList.nullish(),
});

/** Corpo do POST /api/users. */
export const UserUpsertInput = z.object({
  id: z.string(),
  email: z.string().trim().min(1, 'Email é obrigatório.').max(320),
  displayName: z.string().trim().min(1, 'Nome é obrigatório.').max(200),
  groups: z.array(FirestoreDocId).max(100).default([]),
  clientAccess: z.array(ClientAccessInput).max(100).default([]),
  adminClientIds: z.array(Slug).max(100).optional(),
  provisionCredential: z.boolean().optional(),
  generatePasswordLink: z.boolean().optional(),
});
export type UserUpsertInput = z.infer<typeof UserUpsertInput>;

/** `{ field, message }[]` — formato de erro de validação prescrito pela rule `validation`. */
export function formatIssues(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((i) => ({ field: i.path.join('.') || '(raiz)', message: i.message }));
}

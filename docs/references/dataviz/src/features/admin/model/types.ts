import { Timestamp } from 'firebase/firestore';
import type { ClientBusinessProfile } from '@/shared/schemas/client';
import type { ClientProductBinding } from '@/shared/schemas';

/** @deprecated forma legada do mapeamento de schema do cliente (caminho /api/bigquery — G9). */
export type ClientSchema = Record<string, Record<string, string | null>>;

export interface ClientDoc {
  name: string;
  /** @deprecated substituído por productBindings — manter para retrocompat (exibição). */
  dataset?: string;
  color: string;
  initial: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** @deprecated legado do caminho /api/bigquery (G9). */
  schema?: ClientSchema | null;
  lastSchemaSync?: Timestamp | null;
  /** Novo modelo multi-produto / multi-dataset. */
  productBindings?: ClientProductBinding[];
  /** Contexto de negócio para a IA — gerenciado nesta mesma tela. */
  businessProfile?: ClientBusinessProfile | null;
}

export interface GroupDoc {
  name: string;
  description: string;
  routes: string[];
  createdAt: Timestamp;
}

export interface ClientAccess {
  clientId: string;
  routeOverrides?: string[] | null;
}

export interface UserDoc {
  email: string;
  displayName: string;
  groups: string[];
  clientAccess: ClientAccess[];
  adminClientIds?: string[];
  createdAt: Timestamp;
}

// Runtime types (with id)
export interface Client extends Omit<ClientDoc, 'createdAt' | 'updatedAt'> {
  id: string;
}

export interface Group extends Omit<GroupDoc, 'createdAt'> {
  id: string;
}

export interface AppUser extends Omit<UserDoc, 'createdAt'> {
  id: string;
}

export type SaveUserInput = Omit<UserDoc, 'createdAt'> & {
  provisionCredential?: boolean;
  generatePasswordLink?: boolean;
};

export interface SaveUserResult {
  ok: boolean;
  uid?: string;
  credentialCreated?: boolean;
  resetLink?: string;
}

/**
 * Catálogo de rotas que o admin pode liberar por grupo de permissão.
 *
 * As 9 páginas fixas do Play (Contratos, Pagamentos, Fluxo de Caixa, PDD,
 * Pricing, Simulação, Inadimplência, Repasse, Detalhamento) saíram na purga
 * de clientes — mantê-las aqui deixaria o admin marcando checkbox de rota
 * que responde 404.
 *
 * As 3 telas de anexo (`/attachments/rating|pdd|eligibility`) saíram em
 * 2026-08-06 pelo mesmo motivo, um passo adiante: eram conteúdo ESCRITO NO
 * CÓDIGO — sem dado, sem variação por cliente, sem edição pela admin. O texto
 * ficou preservado em `docs/anexos-metodologia.md`, e o caminho de volta é
 * relatório com bloco de texto, não página nova.
 *
 * Rota removida daqui não some do dado sozinha: o caminho fica gravado em
 * `groups.routes[]` e em `users.clientAccess[].routeOverrides`. Concessão órfã
 * não abre acesso a nada (a rota responde 404), mas polui a tela de grupo e
 * confunde auditoria — por isso sai do banco junto, por script de migração
 * idempotente. O último (`scripts/migrate-route-rename.ts`) foi removido
 * depois que uma leitura de `dataviz` em 2026-09-25 não achou nenhuma rota
 * antiga; recupere-o do histórico git (`git show be72055:scripts/migrate-route-rename.ts`)
 * como molde.
 *
 * ─── O que NÃO entra aqui ───────────────────────────────────────────────────
 * Nada com nome de produto no caminho. `/covenants/configuracao` existiu e foi
 * removido: num produto cuja tese é relatório dinâmico (`/g/{grupo}/r/{id}`),
 * página fixa por produto é resto da era anterior.
 */
export const ALL_ROUTES = [
  { path: '/dashboard', label: 'Início', group: 'Carteira' },
  { path: '/g', label: 'Reports (Covenants / dinâmicos)', group: 'Reports' },
] as const;

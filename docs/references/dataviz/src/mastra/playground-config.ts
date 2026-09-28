/**
 * Configuração do playground local do Mastra (`pnpm mastra:dev`), lida do env.
 *
 * Tudo aqui é puro: recebe o `env` e devolve decisão. Quem lê o Firestore e
 * monta os agentes é o `index.ts`; separar permite testar a guarda sem GCP.
 *
 * O playground NÃO tem autenticação — qualquer processo que alcance a porta
 * conversa com os agentes em nome de um cliente real. Por isso ele só existe
 * localmente (não entra no `next build` nem na imagem Docker) e fixa UM
 * cliente, escolhido por quem sobe o processo.
 */
import { PRODUCTION_DATABASE_ID } from '../../scripts/lib/production-guard.mjs';
import { resolveDatavizDatabaseId } from '@/shared/lib/runtime-config';

export const DEFAULT_PLAYGROUND_CLIENT_ID = 'vila-rosa';

export interface PlaygroundConfig {
  clientId: string;
  /** Override do dataset; ausente = o dataset principal do cliente no Firestore. */
  dataset?: string;
  userEmail?: string;
  databaseId: string;
  allowProd: boolean;
  dateRange: { start: string; end: string };
}

type Env = Record<string, string | undefined>;

function read(env: Env, key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ano corrente até hoje, a menos que o env diga outra coisa. */
function readDateRange(env: Env, today: Date): { start: string; end: string } {
  const end = read(env, 'MASTRA_DEV_DATE_END') ?? today.toISOString().slice(0, 10);
  const start = read(env, 'MASTRA_DEV_DATE_START') ?? `${end.slice(0, 4)}-01-01`;
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    throw new Error('MASTRA_DEV_DATE_START/END precisam estar em YYYY-MM-DD.');
  }
  return { start, end };
}

export function readPlaygroundConfig(env: Env, today: Date = new Date()): PlaygroundConfig {
  return {
    clientId: read(env, 'MASTRA_DEV_CLIENT_ID') ?? DEFAULT_PLAYGROUND_CLIENT_ID,
    dataset: read(env, 'MASTRA_DEV_DATASET'),
    userEmail: read(env, 'MASTRA_DEV_USER_EMAIL'),
    // A MESMA função que dá o banco ao `getDb` — reimplementar a precedência
    // aqui já deixou passar `DATAVIZ_DATABASE_ID=` vazio (review I1).
    databaseId: resolveDatavizDatabaseId(env),
    allowProd: ['1', 'true'].includes(read(env, 'MASTRA_DEV_ALLOW_PROD')?.toLowerCase() ?? ''),
    dateRange: readDateRange(env, today),
  };
}

/**
 * Pode subir contra este banco?
 *
 * As tools de autoria do supervisor escrevem relatórios, páginas e métricas no
 * Firestore do cliente, e os sub-agentes gravam no catálogo SQL e treinam
 * modelos BQML. Contra `dataviz` isso é dado vivo — por isso exige opt-in
 * explícito, no espírito do `--allow-prod` dos scripts.
 */
export function decidePlaygroundStart(
  config: Pick<PlaygroundConfig, 'databaseId' | 'allowProd'>,
): { ok: true } | { ok: false; reason: string } {
  if (config.databaseId === PRODUCTION_DATABASE_ID && !config.allowProd) {
    return {
      ok: false,
      reason:
        `database=${config.databaseId} é o banco de PRODUÇÃO, e os agentes escrevem nele ` +
        '(relatórios, métricas, catálogo SQL, modelos BQML). Aponte DATAVIZ_DATABASE_ID para ' +
        'um banco de desenvolvimento ou defina MASTRA_DEV_ALLOW_PROD=1 explicitamente.',
    };
  }
  return { ok: true };
}

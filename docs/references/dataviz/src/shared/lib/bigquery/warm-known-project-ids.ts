import 'server-only';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { rememberProjectIds } from './known-project-ids';

const TTL_MS = 300_000; // 5 min, como o cache de dataSource
/** Depois de uma falha de leitura: sem isto, cada pergunta do chat relia o Firestore. */
const RETRY_AFTER_FAILURE_MS = 30_000;
let validUntil = 0;
let inFlight: Promise<void> | undefined;

/**
 * Registra os `projectId` de todos os `dataSources` para a redação de
 * `formatToolError`. Idempotente, com cache de 5 min; falha de leitura não
 * propaga (a redação por posição continua valendo) e é tentada de novo depois
 * de 30 s.
 */
export const warmKnownProjectIds = (): Promise<void> => {
  if (Date.now() < validUntil) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      const snap = await getAdminFirestore(DATAVIZ_DATABASE_ID).collection('dataSources').select('projectId').get();
      rememberProjectIds(snap.docs.map((d) => d.get('projectId') as string | undefined));
      validUntil = Date.now() + TTL_MS;
    } catch (err) {
      console.error(JSON.stringify({ level: 'warn', msg: 'known_project_ids_warm_failed', err: err instanceof Error ? err.message : String(err) }));
      validUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
    } finally {
      inFlight = undefined;
    }
  })();
  return inFlight;
};

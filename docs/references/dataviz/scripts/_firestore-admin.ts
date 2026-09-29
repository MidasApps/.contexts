/**
 * Firestore Admin bootstrap para SCRIPTS standalone (tsx).
 *
 * Por que não importar `@/shared/lib/firebase/admin` direto?
 *   Aquele módulo começa com `import 'server-only'`, que NÃO resolve fora do
 *   bundler do Next (tsx quebra com MODULE_NOT_FOUND). Este helper replica
 *   fielmente a lógica de `ensureAdminApp()` / `getDb()` daquele arquivo —
 *   mesma seleção de credencial (cert via FIREBASE_ADMIN_*, senão ADC) e o
 *   mesmo database (`DATAVIZ_DATABASE_ID`) — sem a tag server-only.
 *
 * Resultado: seeds escrevem nas MESMAS coleções/DB que as rotas de API, sem
 * depender de HTTP autenticado (alinhado a ADR-0013, Firestore canônico).
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';

/**
 * Espelha `ensureAdminApp()` de src/shared/lib/firebase/admin.ts.
 * ⚠️ MANTER EM SINCRONIA: se admin.ts adicionar um novo caminho de credencial
 * (ex.: Workload Identity Federation), replique-o aqui — não há teste ligando
 * os dois arquivos, então a divergência passaria silenciosa.
 */
function ensureAdminApp(): void {
  if (getApps().length > 0) return;

  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    return;
  }

  initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}

/**
 * Firestore do banco dataviz — MESMO database que `getDb()` usa nas rotas.
 * Seeds devem gravar aqui para serem byte-equivalentes a docs criados via API.
 */
export function getSeedDb(): Firestore {
  ensureAdminApp();
  return getFirestore(DATAVIZ_DATABASE_ID);
}

/**
 * Firestore de um database ARBITRÁRIO, por id. Existe para o backup e para o
 * seed poderem apontar para um ambiente que não é o do `.env` — o `getSeedDb()`
 * acima resolve sempre o database de produção configurado.
 */
export function getDbFor(databaseId: string): Firestore {
  ensureAdminApp();
  return getFirestore(databaseId);
}

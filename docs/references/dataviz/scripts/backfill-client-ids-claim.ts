#!/usr/bin/env tsx
/**
 * Backfill one-time do claim `clientIds` (ADR-0018 §4.3).
 *
 * Para cada `users/{id}` com `clientAccess`, seta o claim
 * `clientIds = clientAccess.map(clientId)` (merge, preservando role etc.).
 *
 * Uso:
 *   pnpm tsx scripts/backfill-client-ids-claim.ts            # dry-run (default)
 *   pnpm tsx scripts/backfill-client-ids-claim.ts --apply    # escreve os claims
 *
 * Executado pelo usuário em ambiente com credenciais (ADC / SA). O plano NÃO roda.
 *
 * Nota: usa `getSeedDb` de `./_firestore-admin` (não `@/shared/lib/firebase/admin`
 * direto) porque aquele módulo começa com `import 'server-only'`, que quebra sob
 * tsx fora do bundler do Next — mesmo padrão dos demais scripts standalone
 * (ver `seed-ai-studio.ts`). O app Admin já fica inicializado após `getSeedDb()`,
 * então `getAuth()` (default app) reaproveita a mesma credencial.
 */
import { getAuth } from 'firebase-admin/auth';
import { getSeedDb } from './_firestore-admin';
import { buildBackfillPlan, type BackfillUser } from './lib/backfill-plan';

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const db = getSeedDb();
  const snap = await db.collection('users').get();
  const users: BackfillUser[] = snap.docs.map((d) => {
    const data = d.data();
    return { email: data.email as string | undefined, clientAccess: data.clientAccess as { clientId: string }[] | undefined };
  });

  const plan = buildBackfillPlan(users);
  console.log(`${plan.length} usuário(s) elegível(is). Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  const auth = getAuth();
  for (const entry of plan) {
    if (!apply) {
      console.log(`[dry-run] ${entry.email} → clientIds=${JSON.stringify(entry.clientIds)}`);
      continue;
    }
    try {
      const u = await auth.getUserByEmail(entry.email);
      await auth.setCustomUserClaims(u.uid, { ...(u.customClaims ?? {}), clientIds: entry.clientIds });
      console.log(`✓ ${entry.email} → clientIds=${JSON.stringify(entry.clientIds)}`);
    } catch (e) {
      console.warn(`⚠ ${entry.email}: ${(e as Error).message}`);
    }
  }

  if (apply) {
    console.log('Concluído. Usuários precisam re-logar (ou aguardar refresh ≤1h) para o JWT novo.');
  }
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});

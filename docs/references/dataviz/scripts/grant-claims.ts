#!/usr/bin/env tsx
/**
 * Grant Firebase custom claims to a user.
 *
 * Quando usar:
 *  - Onboarding de cliente: setar `clientId` / `clientIds` para que ele
 *    acesse apenas os dados do tenant dele (Firestore rules exigem
 *    `request.auth.token.clientIds` contendo o `clientId` do documento).
 *  - Promover um usuário a admin via `role:'admin'` claim — as regras do
 *    Firestore só reconhecem admin por este claim.
 *
 * E-mails no domínio `ADMIN_EMAIL_DOMAIN` têm fallback de admin no backend
 * HTTP; no client SDK do Firestore o claim `role=admin` é obrigatório.
 *
 * Uso:
 *   pnpm tsx scripts/grant-claims.ts --email=user@example.com --clientId=vila-rosa
 *   pnpm tsx scripts/grant-claims.ts --email=user@example.com --role=admin
 *   pnpm tsx scripts/grant-claims.ts --email=user@example.com --clientId=vila-rosa --role=admin
 *   pnpm tsx scripts/grant-claims.ts --email=user@example.com --clear
 *   pnpm tsx scripts/grant-claims.ts --list
 *   pnpm tsx scripts/grant-claims.ts --email=user@example.com --clientIds=vila-rosa
 */

import 'firebase-admin/auth';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { parseArgs, mergeClaims } from './lib/grant-claims-args';

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCP_PROJECT_ID
      ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      ?? process.env.GOOGLE_CLOUD_PROJECT,
  });
}

async function listAll(): Promise<void> {
  const result = await getAuth().listUsers(1000);
  const rows = result.users
    .map((u) => ({
      email: u.email ?? '(no email)',
      uid: u.uid,
      claims: u.customClaims ?? {},
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
  console.table(rows.map((r) => ({ email: r.email, uid: r.uid, claims: JSON.stringify(r.claims) })));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listAll();
    return;
  }

  if (!args.email) {
    console.error('Erro: --email é obrigatório (ou use --list)');
    process.exit(1);
  }

  const user = await getAuth().getUserByEmail(args.email);
  console.log(`Usuário encontrado: ${user.email} (uid: ${user.uid})`);
  console.log(`Claims atuais:`, user.customClaims ?? {});

  let newClaims: Record<string, unknown> | null;
  if (args.clear) {
    newClaims = null;
    console.log('→ Removendo todos os claims...');
  } else {
    const merged = mergeClaims(user.customClaims ?? {}, args);
    if (Object.keys(merged).length === 0) {
      console.error('Erro: nada a fazer. Use --clientIds, --clientId, --role ou --clear.');
      process.exit(1);
    }
    newClaims = merged;
    console.log('→ Aplicando claims:', merged);
  }

  await getAuth().setCustomUserClaims(user.uid, newClaims);
  console.log('✓ Claims atualizadas. O usuário precisa fazer logout/login (ou aguardar refresh do token, máx 1h) para o JWT novo conter os claims.');
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});

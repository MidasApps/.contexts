#!/usr/bin/env tsx
/**
 * Cria o PRIMEIRO usuário de um ambiente recém-provisionado.
 *
 * Por que existe: `export-provisioning` não exporta a coleção `users` — e não
 * deve, porque ela é PII (e-mail, nome, o vínculo pessoa↔cliente) e clonar isso
 * para um ambiente de teste cria uma segunda cópia de dado pessoal sem o
 * controle de acesso do original. Ver `FORBIDDEN_COLLECTIONS` no manifesto.
 *
 * A consequência é que um ambiente reprovisionado do zero sobe correto e vazio:
 * clientes, contratos, métricas e relatórios no lugar, e ninguém que consiga
 * entrar. Este script fecha esse último passo sem desfazer a decisão de manter
 * PII fora do clone — ele CRIA um usuário, não copia usuário nenhum.
 *
 * O que ele escreve (e por que os três, não um):
 *   1. conta no Firebase Auth   → sem ela não há login;
 *   2. doc `users/{id}`          → é o que `canAccessRoute` lê para liberar rota;
 *   3. custom claim `clientIds`  → é o que as regras do Firestore exigem para
 *                                  o dado do tenant (ADR-0018).
 * Faltando qualquer um, o login funciona e a aplicação fica vazia — sem erro.
 *
 * Uso (`--project` é obrigatório se a env do projeto não estiver exportada —
 * `tsx` não lê `.env.local`):
 *   pnpm provisioning:bootstrap-user --email=voce@empresa.com --database=dataviz-dev --project=seu-projeto-gcp --dry-run
 *   pnpm provisioning:bootstrap-user --email=voce@empresa.com --database=dataviz-dev --project=seu-projeto-gcp --role=admin
 *   pnpm provisioning:bootstrap-user --email=... --database=... --clients=vila-rosa --groups=acesso-total
 *   pnpm provisioning:bootstrap-user --email=... --database=... --password='...' --name='Fulano'
 */
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { slugifyEmail, UserDocId } from '@/shared/schemas/identifier';
import { auditFields } from '@/shared/lib/firestore/audit';
import { PRODUCTION_DATABASE } from './lib/provisioning-manifest';
import { parseBootstrapArgs, resolverIds } from './lib/bootstrap-user-args';
import { connectFirestore, resolveProject } from './lib/firestore-connection';

/**
 * Autor gravado na trilha. Não é e-mail de propósito: nenhum administrador
 * criou este documento pela admin, e carimbar o e-mail do bootstrapado diria
 * que ele criou a si mesmo.
 */
const AUTHOR = 'scripts/bootstrap-user';

/** Ids existentes numa coleção — usado para validar `--clients`/`--groups`. */
async function idsDe(db: Firestore, collection: string): Promise<string[]> {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => d.id);
}

/** Aplica `resolverIds` e aborta com mensagem útil quando o id não existe. */
async function resolveOrExit(
  db: Firestore,
  collection: string,
  requested: string[] | undefined,
  label: string,
): Promise<string[]> {
  const existing = await idsDe(db, collection);
  const r = resolverIds(requested, existing);
  if (!r.ok) {
    console.error(
      `${label} inexistente(s) neste banco: ${r.missing.join(', ')}\n` +
      `Disponíveis: ${existing.join(', ') || '(nenhum)'}`,
    );
    process.exit(1);
  }
  return r.ids;
}

async function authAccount(email: string, password: string | undefined, dryRun: boolean) {
  const auth = getAuth();
  try {
    const existingUser = await auth.getUserByEmail(email);
    return { user: existingUser, created: false };
  } catch {
    if (dryRun) return { user: null as UserRecord | null, created: true };
    // Sem senha a conta nasce só para login federado (Google), que é o caminho
    // primário do produto. Com senha, o operador consegue entrar por e-mail.
    const newUser = await auth.createUser({
      email,
      ...(password ? { password } : {}),
      emailVerified: false,
    });
    return { user: newUser, created: true };
  }
}

async function main(): Promise<void> {
  const args = parseBootstrapArgs(process.argv.slice(2));

  if (!args.email || !args.email.includes('@')) {
    console.error('Faltou --email=<endereço válido>');
    process.exit(1);
  }
  if (!args.database) {
    console.error('Faltou --database=<id> (ex.: dataviz-dev)');
    process.exit(1);
  }
  if (args.database === PRODUCTION_DATABASE && !args.allowProd) {
    console.error(
      `${args.database} é PRODUÇÃO. Criar acesso lá exige --allow-prod explícito.`,
    );
    process.exit(1);
  }

  const id = slugifyEmail(args.email);
  const idOk = UserDocId.safeParse(id);
  if (!idOk.success) {
    console.error(`E-mail gera id de documento inválido (${id}): ${idOk.error.issues[0]?.message}`);
    process.exit(1);
  }

  const project = resolveProject(args.project);
  const db = connectFirestore(args.database, project);
  console.log(
    `Projeto: ${project} · Database: ${args.database} · ` +
    `${args.dryRun ? 'DRY-RUN' : 'ESCRITA'}\n`,
  );

  const clients = await resolveOrExit(db, 'clients', args.clients, 'Cliente(s)');
  const groups = await resolveOrExit(db, 'groups', args.groups, 'Grupo(s)');
  if (clients.length === 0) {
    console.error('Nenhum cliente neste banco. Rode o seed de provisionamento antes.');
    process.exit(1);
  }

  const ref = db.collection('users').doc(id);
  const alreadyExists = (await ref.get()).exists;
  if (alreadyExists && !args.force && !args.dryRun) {
    console.error(`users/${id} já existe. Use --force para sobrescrever.`);
    process.exit(1);
  }

  const { user, created } = await authAccount(args.email, args.password, args.dryRun);

  const doc = {
    email: args.email,
    displayName: args.name ?? args.email.split('@')[0],
    groups,
    // `routeOverrides: null` = herda as rotas dos grupos. `[]` NEGARIA tudo.
    clientAccess: clients.map((clientId) => ({ clientId, routeOverrides: null })),
    ...auditFields(AUTHOR, !alreadyExists),
  };

  const claims = {
    clientIds: clients,
    ...(args.role ? { role: args.role } : {}),
  };

  console.log(`  conta Auth      ${created ? 'CRIAR' : `existe (uid ${user?.uid})`}`);
  console.log(`  users/${id}`);
  console.log(`    grupos        ${groups.join(', ') || '(nenhum)'}`);
  console.log(`    clientes      ${clients.join(', ')}`);
  console.log(`  claims          ${JSON.stringify(claims)}`);

  if (args.dryRun) {
    console.log('\nDRY-RUN: nada foi escrito.');
    return;
  }

  await ref.set(doc, { merge: true });
  if (user) await getAuth().setCustomUserClaims(user.uid, claims);

  console.log('\nPronto. O claim só entra no token na PRÓXIMA autenticação —');
  console.log('se já houver sessão aberta, saia e entre de novo.');
}

main().catch((err) => {
  console.error('Falha no bootstrap:', err);
  process.exit(1);
});

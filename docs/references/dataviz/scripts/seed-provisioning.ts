/**
 * Recria a configuração a partir dos JSON de `export-provisioning`.
 *
 * Uso:
 *   pnpm provisioning:seed --database=dataviz-dev
 *   pnpm provisioning:seed --database=... --dry-run
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm provisioning:seed --database=dev
 *
 * ─── Proteções, e por que cada uma existe ───────────────────────────────────
 *
 * 1. `--database` é OBRIGATÓRIO. Sem ele o script cairia no `DATAVIZ_DATABASE_ID`
 *    do `.env`, que aponta para produção — e o acidente aconteceria justamente
 *    quando alguém rodasse sem pensar.
 *
 * 2. Escrever no banco de produção exige `--allow-prod` explícito. A ADR-0017
 *    registra a armadilha: reseed sobrescreve prompts que o cliente customizou
 *    pela UI. Aqui vale para toda a configuração.
 *
 * 3. `--dry-run` mostra o que aconteceria sem escrever nada. É o passo que a
 *    revisão apontou como ausente nos seeds atuais (sem dry-run, sem diff, sem
 *    confirmação, sem registro de quem rodou).
 *
 * 4. Documento existente NÃO é sobrescrito sem `--force`. Sem isso, um seed
 *    rodado por engano desfaz configuração feita pela tela de administração.
 */
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { Firestore, DocumentData, WriteBatch } from 'firebase-admin/firestore';
import { CONFIG_COLLECTIONS, PRODUCTION_DATABASE } from './lib/provisioning-manifest';

interface ExportedDoc {
  id: string;
  data: DocumentData;
  sub?: Record<string, ExportedDoc[]>;
}

interface Args {
  database: string | null;
  from: string;
  dryRun: boolean;
  force: boolean;
  allowProd: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (n: string) =>
    argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=') ?? null;
  return {
    database: get('database'),
    from: get('from') ?? join('fixtures', 'provisioning'),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    allowProd: argv.includes('--allow-prod'),
  };
}

/** Inverso de `serializar` do export. */
function deserialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deserialize);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (v.__tipo === 'timestamp' && typeof v.iso === 'string') {
      return Timestamp.fromDate(new Date(v.iso));
    }
    // Refs não são reconstruídas: apontariam para o database de ORIGEM.
    // Vira o path em texto, que é inspecionável, em vez de uma ref quebrada.
    if (v.__tipo === 'ref') return v.path;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = deserialize(val);
    return out;
  }
  return value;
}

function connect(database: string): Firestore {
  if (getApps().length === 0) {
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
  }
  return getFirestore(database);
}

interface Counters { criados: number; updated: number; preserved: number }

async function writeDoc(
  db: Firestore,
  batch: WriteBatch,
  path: string,
  doc: ExportedDoc,
  args: Args,
  c: Counters,
): Promise<void> {
  const ref = db.doc(`${path}/${doc.id}`);
  const exists = (await ref.get()).exists;

  if (exists && !args.force) {
    c.preserved++;
  } else {
    if (!args.dryRun) batch.set(ref, deserialize(doc.data) as DocumentData);
    if (exists) c.updated++;
    else c.criados++;
  }

  for (const [subName, children] of Object.entries(doc.sub ?? {})) {
    for (const child of children) {
      await writeDoc(db, batch, `${path}/${doc.id}/${subName}`, child, args, c);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.database) {
    console.error(
      'Faltou --database=<id>.\n\n' +
      'É obrigatório de propósito: sem ele o script usaria o DATAVIZ_DATABASE_ID\n' +
      'do .env, que aponta para produção.',
    );
    process.exit(1);
  }

  const isProduction = args.database === PRODUCTION_DATABASE;
  if (isProduction && !args.allowProd) {
    console.error(
      `"${args.database}" é o banco de PRODUÇÃO.\n\n` +
      'Escrever aqui sobrescreve configuração que administradores fizeram pela\n' +
      'tela — inclusive prompts de agente (ADR-0017).\n\n' +
      'Se é mesmo a intenção: --allow-prod (e rode antes com --dry-run).',
    );
    process.exit(1);
  }

  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  console.log(`Destino : ${args.database}${emulator ? ` (emulador em ${emulator})` : ''}`);
  console.log(`Origem  : ${args.from}`);
  console.log(`Modo    : ${args.dryRun ? 'DRY-RUN (nada será escrito)' : 'ESCRITA'}`);
  console.log(`Colisão : ${args.force ? 'SOBRESCREVE (--force)' : 'preserva o existente'}`);
  if (isProduction) console.log('⚠️  PRODUÇÃO — autorizado por --allow-prod');
  console.log('');

  let files: string[];
  try {
    files = (await readdir(args.from)).filter((f) => f.endsWith('.json'));
  } catch {
    console.error(`Não consegui ler ${args.from}. Rode antes: pnpm provisioning:export`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`Nenhum .json em ${args.from}.`);
    process.exit(1);
  }

  const db = connect(args.database);
  const total: Counters = { criados: 0, updated: 0, preserved: 0 };

  // Segue a ordem do manifesto: contratos antes de métricas, métricas antes de
  // produtos. Não há FK no Firestore, mas a ordem torna um seed interrompido
  // pelo meio inspecionável — sobra uma base coerente, não um meio-termo.
  for (const col of CONFIG_COLLECTIONS) {
    const file = join(args.from, `${col.name}.json`);
    if (!files.includes(`${col.name}.json`)) {
      console.log(`  ${col.name.padEnd(20)} — sem arquivo, pulando`);
      continue;
    }

    const content = JSON.parse(await readFile(file, 'utf-8')) as { docs: ExportedDoc[] };
    const c: Counters = { criados: 0, updated: 0, preserved: 0 };

    // Batch do Firestore aceita 500 operações; escreve em lotes.
    let batch = db.batch();
    let inBatch = 0;
    for (const doc of content.docs) {
      await writeDoc(db, batch, col.name, doc, args, c);
      if (++inBatch >= 400) {
        if (!args.dryRun) await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
    if (inBatch > 0 && !args.dryRun) await batch.commit();

    total.criados += c.criados;
    total.updated += c.updated;
    total.preserved += c.preserved;

    console.log(
      `  ${col.name.padEnd(20)} +${String(c.criados).padStart(4)} novos  ` +
      `~${String(c.updated).padStart(4)} atualizados  ` +
      `=${String(c.preserved).padStart(4)} preservados`,
    );
  }

  console.log(
    `\nTotal: ${total.criados} criados, ${total.updated} atualizados, ` +
    `${total.preserved} preservados.`,
  );
  if (total.preserved > 0 && !args.force) {
    console.log('Documentos preservados já existiam. Use --force para sobrescrever.');
  }
  if (args.dryRun) console.log('\nDRY-RUN: nada foi escrito.');
}

main().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});

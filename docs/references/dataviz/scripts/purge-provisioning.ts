/**
 * Remove documentos do Firestore, recursivamente (Firestore não faz cascade).
 *
 * Uso:
 *   # lista explícita de caminhos (produção — cirúrgico e auditável)
 *   pnpm provisioning:purge --database=X --paths=dataContracts/external,dataSources/bq-bacen --dry-run
 *
 *   # limpa TODAS as coleções conhecidas (dev — antes de re-semear)
 *   pnpm provisioning:purge --database=X --all --dry-run
 *
 * ─── Por que lista explícita em vez de "apagar o que não é alcançável" ──────
 * Um motor de alcançabilidade parece mais elegante e é mais perigoso: ele apaga
 * o que EU não entendi que estava em uso. Para produção a lista é curta e cada
 * item foi verificado contra o código antes de entrar aqui. Para o dev, onde o
 * alvo é zerar mesmo, `--all` é honesto sobre o que faz.
 *
 * Sem `--dry-run` o script exige `--confirm` — deleção não acontece por
 * digitação distraída.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CONFIG_COLLECTIONS,
  BACKUP_ONLY_COLLECTIONS,
  PRODUCTION_DATABASE,
} from './lib/provisioning-manifest';

interface Args {
  database: string | null;
  paths: string[];
  all: boolean;
  dryRun: boolean;
  confirm: boolean;
  allowProd: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (n: string) =>
    argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=') ?? null;
  return {
    database: get('database'),
    paths: (get('paths') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    all: argv.includes('--all'),
    dryRun: argv.includes('--dry-run'),
    confirm: argv.includes('--confirm'),
    allowProd: argv.includes('--allow-prod'),
  };
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

/**
 * Apaga um documento e TODA a sua descendência.
 *
 * `listCollections()` no documento é o que torna isso correto: sem descer nas
 * subcoleções, apagar `dataContracts/external` deixaria
 * `dataContracts/external/entities/*` órfão e invisível — presente no banco,
 * ausente de qualquer listagem. Lixo que ninguém encontra depois.
 */
async function deleteDoc(
  db: Firestore,
  path: string,
  dryRun: boolean,
  level = 0,
): Promise<number> {
  const ref = db.doc(path);
  let deleted = 0;

  for (const sub of await ref.listCollections()) {
    const snap = await sub.get();
    for (const d of snap.docs) {
      deleted += await deleteDoc(db, `${path}/${sub.id}/${d.id}`, dryRun, level + 1);
    }
  }

  if (!dryRun) await ref.delete();
  deleted++;
  if (level === 0) console.log(`  ${path.padEnd(46)} ${deleted} docs (com descendência)`);
  return deleted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.database) {
    console.error('Faltou --database=<id>.');
    process.exit(1);
  }
  if (!args.all && args.paths.length === 0) {
    console.error('Informe --paths=<a,b,c> ou --all.');
    process.exit(1);
  }
  if (args.database === PRODUCTION_DATABASE && !args.allowProd) {
    console.error(`"${args.database}" é PRODUÇÃO. Exige --allow-prod.`);
    process.exit(1);
  }
  if (!args.dryRun && !args.confirm) {
    console.error('Deleção real exige --confirm (rode antes com --dry-run).');
    process.exit(1);
  }

  const db = connect(args.database);
  console.log(`Database: ${args.database}`);
  console.log(`Modo    : ${args.dryRun ? 'DRY-RUN (nada apagado)' : 'DELEÇÃO REAL'}`);
  console.log(`Alvo    : ${args.all ? 'TODAS as coleções conhecidas' : `${args.paths.length} caminhos`}\n`);

  let total = 0;

  if (args.all) {
    const names = [...CONFIG_COLLECTIONS.map((c) => c.name), ...BACKUP_ONLY_COLLECTIONS];
    for (const name of names) {
      const snap = await db.collection(name).get();
      if (snap.empty) {
        console.log(`  ${name.padEnd(20)} vazia`);
        continue;
      }
      let n = 0;
      for (const d of snap.docs) n += await deleteDoc(db, `${name}/${d.id}`, args.dryRun, 1);
      total += n;
      console.log(`  ${name.padEnd(20)} ${String(n).padStart(4)} docs`);
    }
  } else {
    for (const p of args.paths) {
      if (p.split('/').length % 2 !== 0) {
        console.error(`"${p}" não é caminho de documento (precisa de par coleção/doc).`);
        process.exit(1);
      }
      const exists = (await db.doc(p).get()).exists;
      if (!exists) {
        console.log(`  ${p.padEnd(46)} não existe, pulando`);
        continue;
      }
      total += await deleteDoc(db, p, args.dryRun);
    }
  }

  console.log(`\nTotal: ${total} documentos${args.dryRun ? ' seriam apagados' : ' apagados'}.`);
  if (args.dryRun) console.log('DRY-RUN: nada foi alterado.');
}

main().catch((err) => {
  console.error('Falha na purga:', err);
  process.exit(1);
});

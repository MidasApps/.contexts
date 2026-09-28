/**
 * Exporta a CONFIGURAÇÃO de um ambiente Firestore para arquivos JSON
 * versionáveis. Somente leitura — este script nunca escreve no Firestore.
 *
 * Uso:
 *   pnpm provisioning:export                      # tudo, para fixtures/provisioning
 *   pnpm provisioning:export --client=vila-rosa   # só o recorte de um cliente
 *   pnpm provisioning:export --out=/tmp/dump
 *
 * Por que existe (achado R14): os seeds que criavam a base do zero foram
 * removidos na purga. Os que sobraram estendem uma base que já existe e abortam
 * sem ela. Este par export/seed devolve ao repositório a capacidade de
 * reprovisionar — e a fonte da verdade passa a ser o que está EM PRODUÇÃO, e
 * não uma transcrição à mão que envelhece em silêncio.
 *
 * O que ele NÃO exporta está em `provisioning-manifest.ts`, com o motivo de
 * cada uma. Resumo: nada de `users`, memória, embeddings ou catálogo de SQL —
 * são PII de devedores e de usuários. Um clone que arrasta isso deixa de ser
 * ambiente de desenvolvimento e vira uma segunda cópia de dado pessoal.
 */
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import { getSeedDb, getDbFor } from './_firestore-admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import {
  CONFIG_COLLECTIONS,
  FORBIDDEN_COLLECTIONS,
  BACKUP_ONLY_COLLECTIONS,
  GLOBAL_COLLECTIONS,
  type ProvisionedCollection,
} from './lib/provisioning-manifest';

interface ExportedDoc {
  id: string;
  data: DocumentData;
  /** Subcoleções, por nome. */
  sub?: Record<string, ExportedDoc[]>;
}

interface Args {
  client: string | null;
  out: string;
  /** Inclui as coleções com PII. Só para BACKUP antes de deleção. */
  full: boolean;
  database: string | null;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;
  return {
    client: get('client'),
    out: get('out') ?? join('fixtures', 'provisioning'),
    full: argv.includes('--full'),
    database: get('database'),
  };
}

/**
 * Timestamps e refs do Firestore não sobrevivem a JSON.stringify de forma
 * reversível. Marcamos o tipo para o seed reconstruir — sem isso, uma data
 * viraria `{"_seconds":...}` e o seed gravaria um objeto no lugar de um
 * Timestamp, quebrando ordenação e comparação depois.
 */
function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown> & { toDate?: () => Date; _path?: unknown };
    if (typeof v.toDate === 'function') {
      return { __tipo: 'timestamp', iso: v.toDate().toISOString() };
    }
    if (v._path && typeof (value as { path?: string }).path === 'string') {
      return { __tipo: 'ref', path: (value as { path: string }).path };
    }
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = serialize(val);
    return out;
  }
  return value;
}

/** Lê um caminho de subcoleções encadeado (`groups/reports`) em profundidade. */
async function readSubcollections(
  db: Firestore,
  parentPath: string,
  paths: string[],
): Promise<Record<string, ExportedDoc[]>> {
  const out: Record<string, ExportedDoc[]> = {};
  // Só os caminhos de primeiro nível neste passo; o resto desce recursivamente.
  const firstLevel = [...new Set(paths.map((c) => c.split('/')[0]))];

  for (const name of firstLevel) {
    const snap = await db.collection(`${parentPath}/${name}`).get();
    if (snap.empty) continue;

    const children = paths
      .filter((c) => c.startsWith(`${name}/`))
      .map((c) => c.slice(name.length + 1));

    out[name] = [];
    for (const doc of snap.docs) {
      const item: ExportedDoc = { id: doc.id, data: serialize(doc.data()) as DocumentData };
      if (children.length > 0) {
        const grandchildren = await readSubcollections(db, `${parentPath}/${name}/${doc.id}`, children);
        if (Object.keys(grandchildren).length > 0) item.sub = grandchildren;
      }
      out[name].push(item);
    }
  }
  return out;
}

async function exportCollection(
  db: Firestore,
  col: ProvisionedCollection,
  client: string | null,
): Promise<ExportedDoc[]> {
  const snap = await db.collection(col.name).get();
  const docs: ExportedDoc[] = [];

  for (const doc of snap.docs) {
    // Recorte por cliente: `clients` filtra pelo id; as globais não filtram —
    // elas são o vocabulário compartilhado e um ambiente sem elas não sobe.
    if (client && col.name === 'clients' && doc.id !== client) continue;

    const item: ExportedDoc = { id: doc.id, data: serialize(doc.data()) as DocumentData };
    if (col.subcollections?.length) {
      const sub = await readSubcollections(db, `${col.name}/${doc.id}`, col.subcollections);
      if (Object.keys(sub).length > 0) item.sub = sub;
    }
    docs.push(item);
  }
  return docs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = args.database ? getDbFor(args.database) : getSeedDb();
  const origem = args.database ?? DATAVIZ_DATABASE_ID;

  // Em modo backup as coleções com PII entram — sem elas a deleção que vem
  // depois seria irreversível. É o requisito OPOSTO ao do clone.
  const collections: ProvisionedCollection[] = args.full
    ? [
        ...CONFIG_COLLECTIONS,
        ...BACKUP_ONLY_COLLECTIONS.map((name) => ({
          name,
          reason: `BACKUP: ${FORBIDDEN_COLLECTIONS[name]}`,
        })),
      ]
    : CONFIG_COLLECTIONS;

  console.log(`Origem  : ${origem}`);
  console.log(`Destino : ${args.out}`);
  console.log(`Recorte : ${args.client ?? 'todos os clientes'}`);
  console.log(`Modo    : SOMENTE LEITURA${args.full ? ' · BACKUP COMPLETO (inclui PII)' : ''}\n`);

  if (args.full) {
    console.log('⚠️  Backup completo: inclui users, memória, embeddings e catálogo de SQL.');
    console.log('    Contém PII. O destino deve estar git-ignorado e não pode ser');
    console.log('    usado como fonte de clone para ambiente de teste.\n');
  } else {
    console.log('Coleções NÃO exportadas (PII / dado de runtime):');
    for (const [name, motivo] of Object.entries(FORBIDDEN_COLLECTIONS)) {
      console.log(`  ${name.padEnd(18)} ${motivo}`);
    }
    console.log('');
  }

  await mkdir(args.out, { recursive: true });

  const summary: Record<string, number> = {};
  for (const col of collections) {
    const docs = await exportCollection(db, col, args.client);
    summary[col.name] = docs.length;

    const file = join(args.out, `${col.name}.json`);
    await writeFile(
      file,
      JSON.stringify(
        {
          colecao: col.name,
          exportadoDe: origem,
          recorte: args.client,
          global: GLOBAL_COLLECTIONS.has(col.name),
          docs,
        },
        null,
        2,
      ),
      'utf-8',
    );

    const stamp = GLOBAL_COLLECTIONS.has(col.name) ? '(global)' : '';
    console.log(`  ${col.name.padEnd(20)} ${String(docs.length).padStart(4)} docs ${stamp}`);
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log(`\n${total} documentos em ${collections.length} coleções.`);

  if (total === 0) {
    console.error('\nNenhum documento exportado — confira a credencial e o database.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Falha no export:', err);
  process.exit(1);
});

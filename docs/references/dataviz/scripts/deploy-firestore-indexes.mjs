#!/usr/bin/env node
/**
 * Publica os índices compostos de `firestore.indexes.json` num database
 * nomeado, via Firestore Admin REST API — irmão de `deploy-firestore-rules.mjs`.
 *
 * Por que existe: a Firebase CLI não é pré-requisito do projeto, e sem os
 * índices a lista de conversas do assistente quebra com "The query requires
 * an index" (descoberto na primeira instalação limpa).
 *
 * Idempotente: compara com os índices existentes e só cria os que faltam.
 * Criação é assíncrona no Firestore — o script devolve antes de ficarem
 * READY (minutos). Acompanhe com:
 *   gcloud firestore indexes composite list --database=<db> --project=<p>
 *
 * Uso:
 *   node scripts/deploy-firestore-indexes.mjs <projectId> <databaseId> [firestore.indexes.json]
 */

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { indexRequestBody, missingIndexes } from './lib/firestore-index-payload.mjs';

const accessToken = () => {
  return execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
};

const [, , projectId, databaseId, indexesPath = 'firestore.indexes.json'] = process.argv;
if (!projectId || !databaseId) {
  console.error('Usage: node deploy-firestore-indexes.mjs <projectId> <databaseId> [indexesFilePath]');
  process.exit(1);
}

const token = accessToken();
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'x-goog-user-project': projectId,
};
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}`;

const declared = JSON.parse(await readFile(indexesPath, 'utf8')).indexes ?? [];
console.log(`📜 ${indexesPath}: ${declared.length} índices declarados`);
console.log(`🎯 Target: projects/${projectId}/databases/${databaseId}`);

// A API rejeita `pageSize`; devolve tudo numa página.
const listRes = await fetch(`${base}/collectionGroups/-/indexes`, { headers });
if (!listRes.ok) {
  console.error('❌ Falha ao listar índices:', listRes.status, await listRes.text());
  process.exit(1);
}
const existing = (await listRes.json()).indexes ?? [];
const missing = missingIndexes(declared, existing);
console.log(`   existentes: ${existing.length}  faltam: ${missing.length}`);

let created = 0;
for (const idx of missing) {
  const fieldList = idx.fields.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(',');
  const res = await fetch(`${base}/collectionGroups/${idx.collectionGroup}/indexes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(indexRequestBody(idx)),
  });
  if (res.ok || res.status === 409) {
    created += res.ok ? 1 : 0;
    console.log(`   ${res.ok ? '+' : '='} ${idx.collectionGroup} (${fieldList})`);
  } else {
    console.error(`❌ ${idx.collectionGroup} (${fieldList}):`, res.status, await res.text());
    process.exit(1);
  }
}

console.log(`\n✅ ${created} índice(s) solicitado(s). Ficam READY em alguns minutos.`);

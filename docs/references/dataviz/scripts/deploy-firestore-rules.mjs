#!/usr/bin/env node

/**
 * Deploy Firestore security rules para um database específico via REST API.
 * Usa Application Default Credentials (gcloud auth application-default login).
 *
 * Usage:
 *   node scripts/deploy-firestore-rules.mjs <projectId> <databaseId> <rulesFilePath>
 *
 * Exemplo:
 *   node scripts/deploy-firestore-rules.mjs seu-projeto-gcp dataviz firestore.rules
 */

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

/**
 * Token pelo gcloud, e não pela `google-auth-library`.
 *
 * A lib não é dependência declarada do projeto: vinha transitiva de
 * firebase-admin e, sob o node_modules estrito do pnpm, não resolve — o script
 * morria com ERR_MODULE_NOT_FOUND para qualquer pessoa que tentasse usá-lo.
 * Mesma classe do plugin de lint que quebrou por herança transitiva. O gcloud
 * já é pré-requisito documentado do projeto e não adiciona dependência nova.
 */
function accessToken() {
  return execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
}

const [, , projectId, databaseId, rulesPath] = process.argv;
if (!projectId || !databaseId || !rulesPath) {
  console.error('Usage: node deploy-firestore-rules.mjs <projectId> <databaseId> <rulesFilePath>');
  process.exit(1);
}

const token = accessToken();
const rulesContent = await readFile(rulesPath, 'utf8');

console.log(`📜 Lendo regras de ${rulesPath} (${rulesContent.length} chars)`);
console.log(`🎯 Target: projects/${projectId}/databases/${databaseId}`);

// 1. Cria ruleset
console.log('\n1️⃣  Criando ruleset...');
const createRes = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': projectId,
    },
    body: JSON.stringify({
      source: {
        files: [{ name: 'firestore.rules', content: rulesContent }],
      },
    }),
  },
);
if (!createRes.ok) {
  console.error('❌ Falha ao criar ruleset:', createRes.status, await createRes.text());
  process.exit(1);
}
const ruleset = await createRes.json();
console.log(`   ✓ ruleset criado: ${ruleset.name}`);

// 2. Atualiza release apontando para o ruleset
const releaseName = `projects/${projectId}/releases/cloud.firestore/${databaseId}`;
console.log(`\n2️⃣  Atualizando release ${releaseName}...`);

// Tenta UPDATE primeiro (PATCH); se não existir, cria com POST.
const updateRes = await fetch(
  `https://firebaserules.googleapis.com/v1/${releaseName}`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': projectId,
    },
    body: JSON.stringify({
      release: { name: releaseName, rulesetName: ruleset.name },
    }),
  },
);

if (updateRes.ok) {
  console.log(`   ✓ release atualizado`);
} else if (updateRes.status === 404) {
  console.log('   release não existe; criando…');
  const createRelRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': projectId,
      },
      body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name }),
    },
  );
  if (!createRelRes.ok) {
    console.error('❌ Falha ao criar release:', createRelRes.status, await createRelRes.text());
    process.exit(1);
  }
  console.log('   ✓ release criado');
} else {
  console.error('❌ Falha ao atualizar release:', updateRes.status, await updateRes.text());
  process.exit(1);
}

console.log('\n✅ Deploy concluído.');

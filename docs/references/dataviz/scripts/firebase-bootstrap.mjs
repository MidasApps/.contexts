#!/usr/bin/env node
/**
 * Prepara o Firebase de um projeto GCP existente sem passar pelo console:
 *
 *   1. anexa o Firebase ao projeto (`addFirebase`);
 *   2. usa o app Web cujo displayName é `--app-name` (padrão `dataviz-local`),
 *      criando-o se não existir e parando se houver mais de um;
 *   3. liga o login por e-mail/senha no Identity Platform (inicializando
 *      o Auth se for a primeira vez);
 *   4. imprime as `NEXT_PUBLIC_FIREBASE_*` — ou grava no `.env.local`
 *      com `--write-env`.
 *
 * Idempotente: cada passo verifica antes de criar.
 *
 * O que NÃO dá para automatizar: o aceite dos Termos do Firebase pela conta.
 * Sem ele o passo 1 responde 403 mesmo para Owner. Abra
 * https://console.firebase.google.com uma vez com a conta, aceite, e rode de
 * novo. NÃO crie um projeto novo lá — o Firebase tem de ficar no MESMO projeto
 * GCP do Firestore e do BigQuery, porque o Admin SDK usa um único projectId.
 *
 * Uso:
 *   node scripts/firebase-bootstrap.mjs --project=<id> [--write-env] [--app-name=dataviz-local]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chooseWebApp } from './lib/firebase-web-app.mjs';

const argv = process.argv.slice(2);
const arg = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const PROJECT_ID = arg('project') ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
const WRITE_ENV = argv.includes('--write-env');
const APP_NAME = arg('app-name') ?? 'dataviz-local';
if (!PROJECT_ID) {
  console.error('Uso: --project=<id> [--write-env] [--app-name=dataviz-local]');
  process.exit(2);
}

const token = execFileSync('gcloud', ['auth', 'print-access-token'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
}).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'x-goog-user-project': PROJECT_ID,
};
const FB = 'https://firebase.googleapis.com/v1beta1';
const IT = 'https://identitytoolkit.googleapis.com';

const call = async (method, url, body) => {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
};

const waitOperation = async (name) => {
  for (let i = 0; i < 40; i++) {
    const { json } = await call('GET', `${FB}/${name}`);
    if (json.done) {
      if (json.error) throw new Error(`operação falhou: ${JSON.stringify(json.error)}`);
      return json.response ?? {};
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`operação ${name} não concluiu em 2 min`);
};

// 1. Firebase no projeto
const proj = await call('GET', `${FB}/projects/${PROJECT_ID}`);
if (proj.ok) {
  console.log(`1️⃣  Firebase já anexado a ${PROJECT_ID}`);
} else {
  console.log(`1️⃣  Anexando Firebase a ${PROJECT_ID}…`);
  const add = await call('POST', `${FB}/projects/${PROJECT_ID}:addFirebase`, {});
  if (add.status === 403) {
    console.error('❌ 403 em addFirebase. Quase sempre: Termos do Firebase não aceitos pela conta.');
    console.error('   Abra https://console.firebase.google.com com esta conta, aceite os termos e rode de novo.');
    process.exit(1);
  }
  if (!add.ok) {
    console.error('❌ addFirebase:', add.status, JSON.stringify(add.json));
    process.exit(1);
  }
  await waitOperation(add.json.name);
  console.log('   ✓ anexado');
}

// 2. App Web
const apps = await call('GET', `${FB}/projects/${PROJECT_ID}/webApps`);
const choice = chooseWebApp(apps.json.apps, APP_NAME);
if (choice.kind === 'ambiguous') {
  console.error(`❌ ${choice.reason}`);
  process.exit(1);
}
let app = choice.kind === 'existing' ? choice.app : undefined;
if (app) {
  console.log(`2️⃣  App Web existente: ${app.displayName ?? app.appId}`);
} else {
  console.log(`2️⃣  Criando app Web "${APP_NAME}"…`);
  const create = await call('POST', `${FB}/projects/${PROJECT_ID}/webApps`, { displayName: APP_NAME });
  if (!create.ok) {
    console.error('❌ criar webApp:', create.status, JSON.stringify(create.json));
    process.exit(1);
  }
  app = await waitOperation(create.json.name);
  console.log(`   ✓ ${app.appId}`);
}
const cfg = await call('GET', `${FB}/projects/${PROJECT_ID}/webApps/${app.appId}/config`);
if (!cfg.ok) {
  console.error('❌ config do app:', cfg.status, JSON.stringify(cfg.json));
  process.exit(1);
}

// 3. Login por e-mail/senha
const authCfg = await call('GET', `${IT}/admin/v2/projects/${PROJECT_ID}/config`);
if (authCfg.status === 404) {
  console.log('3️⃣  Inicializando Identity Platform…');
  const init = await call('POST', `${IT}/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth`, {});
  if (!init.ok) {
    console.error('❌ initializeAuth:', init.status, JSON.stringify(init.json));
    process.exit(1);
  }
}
if (authCfg.json?.signIn?.email?.enabled) {
  console.log('3️⃣  E-mail/senha já habilitado');
} else {
  const patch = await call(
    'PATCH',
    `${IT}/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email`,
    { signIn: { email: { enabled: true, passwordRequired: true } } },
  );
  if (!patch.ok) {
    console.error('❌ habilitar e-mail/senha:', patch.status, JSON.stringify(patch.json));
    process.exit(1);
  }
  console.log('3️⃣  ✓ e-mail/senha habilitado');
}

// 4. Variáveis
const c = cfg.json;
const vars = {
  NEXT_PUBLIC_FIREBASE_API_KEY: c.apiKey,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: c.authDomain,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: c.projectId,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: c.storageBucket,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: c.messagingSenderId,
  NEXT_PUBLIC_FIREBASE_APP_ID: c.appId,
};

if (WRITE_ENV) {
  let env = '';
  try { env = await readFile('.env.local', 'utf8'); } catch { env = ''; }
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null || v === '') {
      console.warn(`   ⚠️  ${k} veio vazio da API — não gravado.`);
      continue;
    }
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    // Replacer function: a `$` in the value must not be read as a replacement pattern.
    env = re.test(env) ? env.replace(re, () => line) : `${env.replace(/\s*$/, '')}\n${line}\n`;
  }
  await writeFile('.env.local', env);
  console.log('4️⃣  ✓ .env.local atualizado (chaves NEXT_PUBLIC_FIREBASE_*). Reinicie o `pnpm dev`.');
} else {
  console.log('4️⃣  Cole no .env.local (ou rode com --write-env):\n');
  for (const [k, v] of Object.entries(vars)) console.log(`${k}=${v}`);
}

/**
 * Real estate demo on demand: creates or removes the `imob-demo` client, its
 * BigQuery dataset and every Firestore document the demo seeds write.
 *
 * Usage:
 *   pnpm demo:real-estate --database=dataviz-dev                        # dry-run (default)
 *   pnpm demo:real-estate --database=dataviz-dev --apply [--force]
 *   pnpm demo:real-estate --database=dataviz-dev --teardown             # lists targets
 *   pnpm demo:real-estate --database=dataviz-dev --teardown --confirm   # deletes them
 *   [--project=<id>] overrides the GCP project; [--allow-prod] unlocks the production database.
 *
 * The BigQuery dataset is shared by every Firestore database of the project,
 * so the BigQuery load (apply) and the dataset delete (teardown --confirm) run
 * only with an explicit --project; without it they are skipped and reported.
 *
 * Planning lives in `lib/real-estate-demo.ts`; this file only does I/O. Steps
 * run as `node --import tsx <script>` with an argument array (no shell), using
 * the node binary of this process, so they need neither PATH nor pnpm.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { BigQuery, type BigQueryOptions } from '@google-cloud/bigquery';
import { PRODUCTION_DATABASE } from './lib/provisioning-manifest';
import { metrics } from './metrics/real-estate.mjs';
import { templates } from './templates/real-estate.mjs';
import {
  buildApplySteps,
  buildStepEnv,
  buildTeardownTargets,
  checkDemoTarget,
  datasetKeptHint,
  DemoUsageError,
  dryRunFailureHint,
  findUnexpectedIds,
  RUNTIME_DATA_NOTE,
  grantAccessHint,
  parseDemoArgs,
  planDatasetTeardown,
  resolveBigQueryProject,
  resolveFirestoreProject,
  revokeAccessHint,
  TEARDOWN_ORDER_NOTE,
  type DemoArgs,
  type DemoStep,
  type TeardownTargets,
} from './lib/real-estate-demo';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const runStep = (step: DemoStep, env: NodeJS.ProcessEnv): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, { stdio: 'inherit', env, cwd: REPO_ROOT });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });

const bigqueryProjectBanner = (action: string, project: string): string =>
  `>>> BigQuery ${action} no projeto ${project} <<<`;

const runApply = async (args: DemoArgs): Promise<void> => {
  const steps = buildApplySteps(args);
  const env: NodeJS.ProcessEnv = { ...process.env, ...buildStepEnv(args, process.env) };
  for (const [index, step] of steps.entries()) {
    console.log(`\n━━━ [${index + 1}/${steps.length}] ${step.label} ━━━`);
    console.log(`$ ${step.args.slice(2).join(' ')}`);
    if (step.skipReason) {
      console.log(`PULADO — ${step.skipReason}`);
      continue;
    }
    if (step.bigqueryWriteProject) console.log(bigqueryProjectBanner('GRAVANDO (drop + recriação das tabelas)', step.bigqueryWriteProject));
    const code = await runStep(step, env);
    if (code !== 0) {
      console.error(`\n[demo-real-estate] Passo ${index + 1} (${step.label}) saiu com código ${code}. Parando.`);
      if (args.mode === 'dry-run') console.error(dryRunFailureHint());
      process.exit(code);
    }
  }
  const skipped = steps.filter((s) => s.skipReason).length;
  if (skipped) console.log(`\n${skipped} passo(s) pulado(s) — veja acima.`);
  console.log(`\n${steps.length - skipped} passos concluídos (${args.mode === 'apply' ? 'APPLY' : 'DRY-RUN — nada gravado'}).`);
  if (args.mode === 'apply') console.log(`\n${grantAccessHint()}`);
  else console.log('Para gravar, repita com --apply.');
};

const connectFirestore = (args: DemoArgs): Firestore => {
  const projectId = resolveFirestoreProject(args, process.env);
  if (!projectId) throw new DemoUsageError('Projeto GCP ausente: passe --project=<id> ou defina NEXT_PUBLIC_FIREBASE_PROJECT_ID.');
  if (getApps().length === 0) initializeApp({ projectId });
  return getFirestore(args.database!);
};

const connectBigQuery = (args: DemoArgs): BigQuery => {
  const projectId = resolveBigQueryProject(args, process.env);
  if (!projectId) throw new DemoUsageError('Projeto BigQuery ausente: passe --project=<id> ou defina BIGQUERY_PROJECT_ID.');
  const options: BigQueryOptions = { projectId };
  if (process.env.BIGQUERY_CREDENTIALS) options.keyFilename = process.env.BIGQUERY_CREDENTIALS;
  return new BigQuery(options);
};

/** Counts the document (when it exists) plus every descendant document. */
const countTree = async (ref: DocumentReference): Promise<number> => {
  const self = (await ref.get()).exists ? 1 : 0;
  let descendants = 0;
  for (const collection of await ref.listCollections()) {
    for (const child of await collection.listDocuments()) descendants += await countTree(child);
  }
  return self + descendants;
};

const prefixIds = async (db: Firestore, collection: string, idPrefix: string): Promise<string[]> => {
  const snap = await db.collection(collection).orderBy('__name__').startAt(idPrefix).endAt(`${idPrefix}\uf8ff`).get();
  return snap.docs.map((doc) => doc.id);
};

const existingRefs = async (db: Firestore, collection: string, ids: string[]): Promise<DocumentReference[]> => {
  const snaps = await db.getAll(...ids.map((id) => db.collection(collection).doc(id)));
  return snaps.filter((snap) => snap.exists).map((snap) => snap.ref);
};

/** Deletes each ref; any failed write (after BulkWriter retries) fails the run. */
const deleteRefs = async (db: Firestore, collection: string, refs: DocumentReference[]): Promise<void> => {
  const writer = db.bulkWriter();
  // Handlers are attached before close() so a rejection is never unhandled.
  const settled = Promise.allSettled(refs.map((ref) => writer.delete(ref)));
  await writer.close();
  const failures = (await settled).flatMap((r, i) => (r.status === 'rejected' ? [{ id: refs[i].id, reason: r.reason }] : []));
  if (failures.length === 0) return;
  const first = failures[0];
  throw new Error(
    `${failures.length} de ${refs.length} delete(s) em ${collection}/ falharam (ex.: ${first.id}: ${first.reason instanceof Error ? first.reason.message : String(first.reason)}).`,
  );
};

const datasetTableCount = async (bq: BigQuery, datasetId: string): Promise<number | null> => {
  const dataset = bq.dataset(datasetId);
  const [exists] = await dataset.exists();
  if (!exists) return null;
  const [tables] = await dataset.getTables();
  return tables.length;
};

const teardownFirestore = async (db: Firestore, targets: TeardownTargets, deleting: boolean): Promise<void> => {
  for (const path of targets.firestore) {
    const ref = db.doc(path);
    const count = await countTree(ref);
    console.log(`  ${path}  (recursivo): ${count} documento(s)`);
    if (deleting && count > 0) await db.recursiveDelete(ref);
  }
  for (const { collection, ids } of targets.firestoreDocs) {
    const refs = await existingRefs(db, collection, ids);
    console.log(`  ${collection}/  (ids exportados pela demo): ${refs.length} de ${ids.length} existem`);
    if (deleting && refs.length > 0) await deleteRefs(db, collection, refs);
  }
  for (const { collection, idPrefix } of targets.firestorePrefixes) {
    const expected = targets.firestoreDocs.find((d) => d.collection === collection)?.ids ?? [];
    const extras = findUnexpectedIds(await prefixIds(db, collection, idPrefix), expected);
    if (extras.length === 0) continue;
    console.log(`  ! ${collection}/${idPrefix}* tem ${extras.length} doc(s) fora da demo — NÃO serão apagados: ${extras.join(', ')}`);
  }
};

const runTeardown = async (args: DemoArgs): Promise<void> => {
  const targets = buildTeardownTargets({ metricIds: metrics.map((m) => m.id), templateIds: templates.map((t) => t.id) });
  const db = connectFirestore(args);
  const bq = connectBigQuery(args);
  const deleting = args.confirm;
  const datasetPlans = planDatasetTeardown(args);
  console.log(`${deleting ? 'TEARDOWN (apagando)' : 'TEARDOWN (somente listagem)'} — db=${args.database} bq=${bq.projectId}`);
  if (deleting) console.log(TEARDOWN_ORDER_NOTE);
  console.log('');

  await teardownFirestore(db, targets, deleting);
  const keptDatasets: string[] = [];
  for (const plan of datasetPlans) {
    const tables = await datasetTableCount(bq, plan.datasetId);
    const state = tables === null ? 'não existe' : `${tables} tabela(s)`;
    const mark = plan.target ? `  [ALVO — projeto ${plan.project}]` : '  [MANTIDO a menos que --project]';
    console.log(`  bigquery ${bq.projectId}.${plan.datasetId}: ${state}${mark}`);
    if (!plan.target && tables !== null) keptDatasets.push(plan.datasetId);
    if (plan.delete && tables !== null) {
      // plan.delete implies an explicit --project, which is also what connectBigQuery resolved to.
      if (plan.project !== bq.projectId) throw new Error(`Projeto BigQuery inesperado: ${bq.projectId} (esperado ${plan.project}).`);
      console.log(bigqueryProjectBanner(`APAGANDO o dataset ${plan.datasetId}`, plan.project));
      await bq.dataset(plan.datasetId).delete({ force: true });
    }
  }

  console.log(deleting ? '\nRemovido.' : '\nNada apagado. Para apagar, repita com --teardown --confirm.');
  for (const datasetId of keptDatasets) console.log(datasetKeptHint(datasetId));
  console.log(`\n${RUNTIME_DATA_NOTE}`);
  console.log(`\n${revokeAccessHint()}`);
};

const main = async (): Promise<void> => {
  const args = parseDemoArgs(process.argv.slice(2));
  const check = checkDemoTarget(args, PRODUCTION_DATABASE);
  if (!check.ok) throw new DemoUsageError(check.reason);
  if (args.mode === 'teardown') return runTeardown(args);
  return runApply(args);
};

main().catch((err: unknown) => {
  const known = err instanceof DemoUsageError;
  console.error(`[demo-real-estate] ${known ? '' : 'FALHOU: '}${err instanceof Error ? err.message : String(err)}`);
  if (!known && err instanceof Error && err.stack) console.error(err.stack);
  process.exit(known ? 2 : 1);
});

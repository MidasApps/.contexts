/**
 * Pure planning logic for `pnpm demo:real-estate` (runner in
 * `scripts/demo-real-estate.ts`). No I/O here: parse flags, check the target
 * database, and describe the steps and teardown targets the runner executes.
 */

export type DemoMode = 'dry-run' | 'apply' | 'teardown';

export interface DemoArgs {
  mode: DemoMode;
  database: string | null;
  project: string | null;
  allowProd: boolean;
  force: boolean;
  confirm: boolean;
}

export interface DemoStep {
  label: string;
  command: string;
  args: string[];
  /** Set when the runner must not execute the step: it prints this and moves on. */
  skipReason?: string;
  /** Set when the step writes BigQuery: the explicit `--project` it writes to, printed first. */
  bigqueryWriteProject?: string;
}

export interface TeardownTargets {
  /** Deleted recursively. */
  firestore: string[];
  /** Deleted one by one: exactly the ids the demo seeds export. */
  firestoreDocs: { collection: string; ids: string[] }[];
  /** Listing only: docs under these prefixes outside `firestoreDocs` are reported, never deleted. */
  firestorePrefixes: { collection: string; idPrefix: string }[];
  bigqueryDatasets: string[];
}

export interface DatasetTeardownPlan {
  datasetId: string;
  /** Listed as a teardown target (only with an explicit `--project`). */
  target: boolean;
  /** Actually deleted in this run (`--project` and `--confirm`). */
  delete: boolean;
  project: string | null;
}

export interface DemoIds {
  metricIds: string[];
  templateIds: string[];
}

export type Env = Record<string, string | undefined>;

export type TargetCheck = { ok: true } | { ok: false; reason: string };

/** Invalid command line: the runner prints the message and exits 2, without a stack. */
export class DemoUsageError extends Error {}

export const DEMO_CLIENT_ID = 'imob-demo';
export const DEMO_DATASET_ID = 'imobiliaria_demo';

const BOOLEAN_FLAGS = new Set(['--apply', '--teardown', '--allow-prod', '--force', '--confirm']);
const VALUE_FLAGS = new Set(['--database', '--project']);

const readValueFlag = (argv: string[], name: string): string | null => {
  const raw = argv.find((a) => a.startsWith(`${name}=`));
  if (raw === undefined) return null;
  const value = raw.slice(name.length + 1).trim();
  if (!value) throw new DemoUsageError(`${name} precisa de um valor (${name}=<id>).`);
  return value;
};

const assertKnownFlags = (argv: string[]): void => {
  for (const arg of argv) {
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    const known = arg.includes('=') ? VALUE_FLAGS.has(name) : BOOLEAN_FLAGS.has(name);
    if (!known) throw new DemoUsageError(`Flag desconhecida: ${arg}`);
  }
};

/**
 * Firestore database id: `(default)`, or 4–63 chars of lowercase letters,
 * digits and hyphens, starting with a letter and not ending with a hyphen.
 * Without this, a malformed value such as `dataviz --x` would pass the
 * production check as "some other database".
 */
const FIRESTORE_DATABASE_ID = /^(?:\(default\)|[a-z][a-z0-9-]{2,61}[a-z0-9])$/;

const readDatabaseFlag = (argv: string[]): string | null => {
  const database = readValueFlag(argv, '--database');
  if (database !== null && !FIRESTORE_DATABASE_ID.test(database)) {
    throw new DemoUsageError(
      `--database=${database} é um id de banco Firestore inválido: use (default) ou 4 a 63 caracteres ` +
        'entre letras minúsculas, dígitos e hífen, começando com letra e sem terminar em hífen.',
    );
  }
  return database;
};

export const parseDemoArgs = (argv: string[]): DemoArgs => {
  assertKnownFlags(argv);
  const apply = argv.includes('--apply');
  const teardown = argv.includes('--teardown');
  const confirm = argv.includes('--confirm');
  if (apply && teardown) throw new DemoUsageError('--apply e --teardown são mutuamente exclusivos.');
  if (confirm && !teardown) throw new DemoUsageError('--confirm só vale junto com --teardown.');
  return {
    mode: apply ? 'apply' : teardown ? 'teardown' : 'dry-run',
    database: readDatabaseFlag(argv),
    project: readValueFlag(argv, '--project'),
    allowProd: argv.includes('--allow-prod'),
    force: argv.includes('--force'),
    confirm,
  };
};

/**
 * `--database` is required in every mode: without it the seeds would fall back
 * to `DATAVIZ_DATABASE_ID` from `.env.local`, which points to production. The
 * seeds also refuse `--apply` on production without `--allow-prod`, which the
 * runner forwards (see `buildApplySteps`). BigQuery is guarded separately by
 * requiring an explicit `--project`.
 */
export const checkDemoTarget = (args: DemoArgs, productionDatabase: string): TargetCheck => {
  if (!args.database) {
    return { ok: false, reason: 'Informe --database=<id> (ex.: --database=dataviz-dev). É obrigatório em todo modo.' };
  }
  if (args.database === productionDatabase && !args.allowProd) {
    return {
      ok: false,
      reason: `--database=${args.database} é o banco de PRODUÇÃO. Use um banco de desenvolvimento ou passe --allow-prod explicitamente.`,
    };
  }
  return { ok: true };
};

/** Every step runs as `node --import tsx <script>`, with the node running this process. */
const tsxStep = (label: string, script: string, flags: string[]): DemoStep => ({
  label,
  command: process.execPath,
  args: ['--import', 'tsx', script, ...flags],
});

/**
 * There is one GCP project and `imobiliaria_demo` is shared by every Firestore
 * database in it, so a non-production `--database` does not isolate BigQuery.
 * BigQuery writes and deletes therefore require `--project` on the command
 * line; the project is never taken from env for them.
 */
export const BIGQUERY_SKIPPED_NOTE =
  `BigQuery não foi tocado: a carga de ${DEMO_DATASET_ID} (drop + recriação das tabelas) só roda com --project explícito. ` +
  'Para carregar, repita com --project=<id>.';

const loaderStep = (args: DemoArgs, bigqueryFlags: string[]): DemoStep => {
  const step = tsxStep(`Carga BigQuery (${DEMO_DATASET_ID})`, 'scripts/bq-seed-synthetic-data.ts', ['--domain=real-estate', ...bigqueryFlags]);
  if (args.mode !== 'apply') return step;
  if (!args.project) return { ...step, skipReason: BIGQUERY_SKIPPED_NOTE };
  return { ...step, bigqueryWriteProject: args.project };
};

/**
 * Seeds write when they see `--apply`, even next to `--dry-run`, so a step
 * gets exactly one of the two. `--project=` goes only to the scripts that
 * parse it (loader, validator, contract seed); the others read it from env.
 * `--allow-prod` goes only to the seeds, which refuse `--apply` on the
 * production database without it.
 */
export const buildApplySteps = (args: DemoArgs): DemoStep[] => {
  const dryRun = args.mode !== 'apply';
  const projectFlag = args.project ? [`--project=${args.project}`] : [];
  const bigqueryFlags = [...(dryRun ? ['--dry-run'] : []), ...projectFlag];
  const seedFlags = [
    dryRun ? '--dry-run' : '--apply',
    ...(args.force ? ['--force'] : []),
    ...(args.allowProd ? ['--allow-prod'] : []),
  ];
  return [
    loaderStep(args, bigqueryFlags),
    tsxStep('Validação das 268 receitas', 'scripts/bq-validate-real-estate-metrics.ts', bigqueryFlags),
    tsxStep('Contrato e produto imobiliaria', 'scripts/seed-real-estate-contract.mjs', [...seedFlags, ...projectFlag]),
    tsxStep('Cliente imob-demo', 'scripts/seed-real-estate-client.mjs', seedFlags),
    tsxStep('Métricas imobiliaria.*', 'scripts/seed-real-estate-metrics.mjs', seedFlags),
    tsxStep('Templates imobiliaria-*', 'scripts/seed-real-estate-templates.ts', seedFlags),
    tsxStep('Grupos e relatórios do cliente', 'scripts/seed-real-estate-reports.mjs', seedFlags),
  ];
};

/**
 * Child env. `--project` overrides every project variable the steps read,
 * because they resolve in different orders (`BIGQUERY_PROJECT_ID` first in the
 * BigQuery scripts, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` first in the seeds);
 * setting only `GOOGLE_CLOUD_PROJECT` would lose to a value from `.env.local`.
 */
export const buildStepEnv = (args: DemoArgs, baseEnv: Env): Env => {
  const env: Env = { ...baseEnv };
  if (args.database) env.DATAVIZ_DATABASE_ID = args.database;
  if (args.project) {
    env.GOOGLE_CLOUD_PROJECT = args.project;
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = args.project;
    env.BIGQUERY_PROJECT_ID = args.project;
  }
  return env;
};

const METRIC_PREFIX = 'imobiliaria.';
const TEMPLATE_PREFIX = 'imobiliaria-';

const assertDemoIds = (label: string, ids: string[], prefix: string): void => {
  if (ids.length === 0) throw new Error(`Lista de ids de ${label} vazia: nada a apagar com segurança.`);
  const foreign = ids.filter((id) => !id.startsWith(prefix));
  if (foreign.length) throw new Error(`Ids de ${label} fora do prefixo ${prefix}: ${foreign.join(', ')}`);
};

/**
 * Everything the seven steps write, derived from the seeds themselves.
 * Metrics and templates are deleted by the exact ids the demo exports, never
 * by bare prefix, so a non-demo doc sharing the prefix survives.
 */
export const buildTeardownTargets = (ids: DemoIds): TeardownTargets => {
  assertDemoIds('metrics', ids.metricIds, METRIC_PREFIX);
  assertDemoIds('dashboardTemplates', ids.templateIds, TEMPLATE_PREFIX);
  return {
    firestore: [`clients/${DEMO_CLIENT_ID}`, 'dataContracts/imobiliaria', 'products/imobiliaria'],
    firestoreDocs: [
      { collection: 'metrics', ids: ids.metricIds },
      { collection: 'dashboardTemplates', ids: ids.templateIds },
    ],
    firestorePrefixes: [
      { collection: 'metrics', idPrefix: METRIC_PREFIX },
      { collection: 'dashboardTemplates', idPrefix: TEMPLATE_PREFIX },
    ],
    bigqueryDatasets: [DEMO_DATASET_ID],
  };
};

/** The dataset is a teardown target, and deleted on `--confirm`, only with an explicit `--project`. */
export const planDatasetTeardown = (args: DemoArgs): DatasetTeardownPlan[] => [
  { datasetId: DEMO_DATASET_ID, target: args.project !== null, delete: args.project !== null && args.confirm, project: args.project },
];

export const datasetKeptHint = (datasetId: string): string =>
  `Dataset ${datasetId} mantido: ele é compartilhado por todos os bancos Firestore do projeto. ` +
  `Para removê-lo, repita com --teardown --confirm --project=<id>.`;

export const TEARDOWN_ORDER_NOTE =
  'Ordem: Firestore primeiro, depois BigQuery. Se parar no meio, repetir o teardown é idempotente (só apaga o que ainda existe).';

export const findUnexpectedIds = (foundIds: string[], expectedIds: string[]): string[] => {
  const expected = new Set(expectedIds);
  return foundIds.filter((id) => !expected.has(id));
};

/** First value that is non-empty after trimming, like the seeds' `||` + `trim()`. */
const firstNonBlank = (...values: (string | null | undefined)[]): string | null => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

export const resolveFirestoreProject = (args: DemoArgs, env: Env): string | null =>
  firstNonBlank(args.project, env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, env.GOOGLE_CLOUD_PROJECT, env.GCP_PROJECT_ID);

/** For reads (listing). BigQuery writes and deletes use `args.project` only. */
export const resolveBigQueryProject = (args: DemoArgs, env: Env): string | null =>
  firstNonBlank(args.project, env.BIGQUERY_PROJECT_ID, env.GOOGLE_CLOUD_PROJECT);

export const dryRunFailureHint = (): string =>
  'Em um banco/projeto sem a demo (ou inexistente — erro NOT_FOUND), o dry-run só vai até o primeiro passo que depende de escritas anteriores ' +
  '(ex.: a validação precisa das tabelas de imobiliaria_demo; o seed de relatórios precisa de clients/imob-demo). ' +
  'Nesse caso, a falha do dry-run não indica erro na demo.';

export const RUNTIME_DATA_NOTE =
  `Dados de runtime com clientId ${DEMO_CLIENT_ID} (workingMemory, embeddings*, sqlCatalog*, evalRuns) ` +
  'não são criados pelos seeds e não são removidos pelo teardown.';

export const grantAccessHint = (): string =>
  `Para ver o cliente no app, conceda o acesso:\n  pnpm tsx scripts/grant-claims.ts --email=<você> --clientIds=<atuais>,${DEMO_CLIENT_ID}`;

export const revokeAccessHint = (): string =>
  `O teardown não mexe nos claims dos usuários. Para tirar ${DEMO_CLIENT_ID} de quem tinha acesso:\n` +
  `  pnpm tsx scripts/grant-claims.ts --list\n` +
  `  pnpm tsx scripts/grant-claims.ts --email=<usuário> --clientIds=<atuais sem ${DEMO_CLIENT_ID}>`;

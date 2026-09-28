import { describe, expect, it } from 'vitest';
import {
  buildApplySteps,
  buildStepEnv,
  buildTeardownTargets,
  checkDemoTarget,
  DemoUsageError,
  findUnexpectedIds,
  parseDemoArgs,
  planDatasetTeardown,
  resolveBigQueryProject,
  resolveFirestoreProject,
  type DemoArgs,
} from './real-estate-demo';

const PRODUCTION = 'dataviz';

const makeArgs = (overrides: Partial<DemoArgs> = {}): DemoArgs => ({
  mode: 'dry-run',
  database: 'dataviz-dev',
  project: null,
  allowProd: false,
  force: false,
  confirm: false,
  ...overrides,
});

describe('parseDemoArgs', () => {
  it('defaults to dry-run with every flag off', () => {
    expect(parseDemoArgs([])).toEqual({
      mode: 'dry-run',
      database: null,
      project: null,
      allowProd: false,
      force: false,
      confirm: false,
    });
  });

  it('reads database, project and boolean flags', () => {
    expect(parseDemoArgs(['--database=dataviz-dev', '--project=p1', '--apply', '--force', '--allow-prod'])).toEqual({
      mode: 'apply',
      database: 'dataviz-dev',
      project: 'p1',
      allowProd: true,
      force: true,
      confirm: false,
    });
  });

  it('enters teardown mode and accepts --confirm with it', () => {
    const args = parseDemoArgs(['--database=dataviz-dev', '--teardown', '--confirm']);
    expect(args.mode).toBe('teardown');
    expect(args.confirm).toBe(true);
  });

  it('rejects --apply together with --teardown', () => {
    expect(() => parseDemoArgs(['--apply', '--teardown'])).toThrow(/--apply.*--teardown/);
  });

  it('rejects --confirm without --teardown', () => {
    expect(() => parseDemoArgs(['--confirm'])).toThrow(/--confirm/);
    expect(() => parseDemoArgs(['--apply', '--confirm'])).toThrow(/--confirm/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseDemoArgs(['--delete-everything'])).toThrow(/--delete-everything/);
  });

  it('rejects an empty --database value', () => {
    expect(() => parseDemoArgs(['--database='])).toThrow(/--database/);
  });

  // A malformed id must not slip past the production check as "some other database".
  it.each(['dataviz', 'dataviz-dev', 'abcd', 'a1-b2', `a${'b'.repeat(62)}`])('accepts the valid database id %s', (id) => {
    expect(parseDemoArgs([`--database=${id}`]).database).toBe(id);
  });

  it('accepts the (default) database id', () => {
    expect(parseDemoArgs(['--database=(default)']).database).toBe('(default)');
  });

  it.each([
    ['contains a space', 'dataviz --x'],
    ['is too short', 'abc'],
    ['is too long', `a${'b'.repeat(63)}`],
    ['has uppercase letters', 'Dataviz'],
    ['starts with a digit', '1dataviz'],
    ['starts with a hyphen', '-dataviz'],
    ['ends with a hyphen', 'dataviz-'],
    ['has an underscore', 'dataviz_dev'],
    ['is a mis-cased (default)', '(DEFAULT)'],
  ])('rejects a database id that %s', (_why, id) => {
    expect(() => parseDemoArgs([`--database=${id}`])).toThrow(DemoUsageError);
    expect(() => parseDemoArgs([`--database=${id}`])).toThrow(/--database.*inválido/);
  });

  // An empty --project must never read as "no project given, fall back to env":
  // BigQuery writes and deletes depend on an explicit project.
  it.each(['--project=', '--project=   '])('rejects a blank project value (%s)', (flag) => {
    expect(() => parseDemoArgs(['--database=dataviz-dev', flag])).toThrow(/--project/);
  });
});

describe('checkDemoTarget', () => {
  it('fails when --database is missing', () => {
    const result = checkDemoTarget(makeArgs({ database: null }), PRODUCTION);
    expect(result.ok).toBe(false);
  });

  it('fails on the production database without --allow-prod, in every mode', () => {
    for (const mode of ['dry-run', 'apply', 'teardown'] as const) {
      const result = checkDemoTarget(makeArgs({ mode, database: PRODUCTION }), PRODUCTION);
      expect(result.ok).toBe(false);
    }
  });

  it('allows the production database with --allow-prod', () => {
    expect(checkDemoTarget(makeArgs({ database: PRODUCTION, allowProd: true }), PRODUCTION)).toEqual({ ok: true });
  });

  it('allows a non-production database', () => {
    expect(checkDemoTarget(makeArgs(), PRODUCTION)).toEqual({ ok: true });
  });
});

describe('buildApplySteps', () => {
  const scriptOf = (step: { args: string[] }) => step.args.find((a) => a.startsWith('scripts/'));

  it('lists the seven steps in order', () => {
    expect(buildApplySteps(makeArgs()).map(scriptOf)).toEqual([
      'scripts/bq-seed-synthetic-data.ts',
      'scripts/bq-validate-real-estate-metrics.ts',
      'scripts/seed-real-estate-contract.mjs',
      'scripts/seed-real-estate-client.mjs',
      'scripts/seed-real-estate-metrics.mjs',
      'scripts/seed-real-estate-templates.ts',
      'scripts/seed-real-estate-reports.mjs',
    ]);
  });

  it('loads the real estate domain', () => {
    expect(buildApplySteps(makeArgs())[0].args).toContain('--domain=real-estate');
  });

  it('passes --dry-run to every step in dry-run and never --apply', () => {
    for (const step of buildApplySteps(makeArgs())) {
      expect(step.args).toContain('--dry-run');
      expect(step.args).not.toContain('--apply');
    }
  });

  it('passes --apply to the seeds and no --dry-run anywhere in apply mode', () => {
    const steps = buildApplySteps(makeArgs({ mode: 'apply' }));
    for (const step of steps) expect(step.args).not.toContain('--dry-run');
    for (const step of steps.slice(2)) expect(step.args).toContain('--apply');
    for (const step of steps.slice(0, 2)) expect(step.args).not.toContain('--apply');
  });

  it('passes --force to the seeds only when set', () => {
    for (const step of buildApplySteps(makeArgs())) expect(step.args).not.toContain('--force');
    const forced = buildApplySteps(makeArgs({ mode: 'apply', force: true }));
    for (const step of forced.slice(2)) expect(step.args).toContain('--force');
    for (const step of forced.slice(0, 2)) expect(step.args).not.toContain('--force');
  });

  it('never gives the same step both --dry-run and --apply', () => {
    for (const mode of ['dry-run', 'apply'] as const) {
      for (const step of buildApplySteps(makeArgs({ mode, force: true }))) {
        expect(step.args.includes('--dry-run') && step.args.includes('--apply')).toBe(false);
      }
    }
  });

  it('passes --project only to the scripts that accept it', () => {
    const steps = buildApplySteps(makeArgs({ project: 'p2' }));
    const withProject = steps.filter((s) => s.args.includes('--project=p2')).map(scriptOf);
    expect(withProject).toEqual([
      'scripts/bq-seed-synthetic-data.ts',
      'scripts/bq-validate-real-estate-metrics.ts',
      'scripts/seed-real-estate-contract.mjs',
    ]);
    for (const step of buildApplySteps(makeArgs())) {
      expect(step.args.some((a) => a.startsWith('--project'))).toBe(false);
    }
  });

  it('forwards --allow-prod to the seeds only when given, in apply and dry-run', () => {
    for (const mode of ['dry-run', 'apply'] as const) {
      const steps = buildApplySteps(makeArgs({ mode, allowProd: true, project: 'p1' }));
      for (const step of steps.slice(2)) expect(step.args).toContain('--allow-prod');
      for (const step of steps.slice(0, 2)) expect(step.args).not.toContain('--allow-prod');
      for (const step of buildApplySteps(makeArgs({ mode, project: 'p1' }))) expect(step.args).not.toContain('--allow-prod');
    }
  });

  it('skips the BigQuery load in apply mode without --project, keeping the other steps', () => {
    const steps = buildApplySteps(makeArgs({ mode: 'apply' }));
    expect(steps).toHaveLength(7);
    expect(steps[0].skipReason).toMatch(/BigQuery não foi tocado/);
    expect(steps[0].skipReason).toMatch(/--project=<id>/);
    for (const step of steps.slice(1)) expect(step.skipReason).toBeUndefined();
  });

  it('runs the BigQuery load in apply mode with --project and names the project it writes to', () => {
    const steps = buildApplySteps(makeArgs({ mode: 'apply', project: 'p1' }));
    expect(steps[0].skipReason).toBeUndefined();
    expect(steps[0].bigqueryWriteProject).toBe('p1');
    for (const step of steps.slice(1)) expect(step.bigqueryWriteProject).toBeUndefined();
  });

  it('keeps the BigQuery load running in dry-run, with or without --project, and never marks it as a write', () => {
    for (const project of [null, 'p1']) {
      for (const step of buildApplySteps(makeArgs({ project }))) {
        expect(step.skipReason).toBeUndefined();
        expect(step.bigqueryWriteProject).toBeUndefined();
      }
    }
  });

  it('runs every step through the tsx loader of the current node', () => {
    for (const step of buildApplySteps(makeArgs())) {
      expect(step.command).toBe(process.execPath);
      expect(step.args.slice(0, 2)).toEqual(['--import', 'tsx']);
    }
  });
});

describe('buildStepEnv', () => {
  it('sets the database and keeps the inherited env', () => {
    const env = buildStepEnv(makeArgs(), { PATH: '/bin', DATAVIZ_DATABASE_ID: 'dataviz' });
    expect(env.DATAVIZ_DATABASE_ID).toBe('dataviz-dev');
    expect(env.PATH).toBe('/bin');
  });

  it('overrides every project variable the steps read when --project is given', () => {
    const env = buildStepEnv(makeArgs({ project: 'p2' }), {
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'p1',
      BIGQUERY_PROJECT_ID: 'p1',
      GOOGLE_CLOUD_PROJECT: 'p1',
    });
    expect(env.GOOGLE_CLOUD_PROJECT).toBe('p2');
    expect(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe('p2');
    expect(env.BIGQUERY_PROJECT_ID).toBe('p2');
  });

  it('leaves project variables untouched without --project', () => {
    const env = buildStepEnv(makeArgs(), { GOOGLE_CLOUD_PROJECT: 'p1' });
    expect(env.GOOGLE_CLOUD_PROJECT).toBe('p1');
    expect(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBeUndefined();
  });
});

describe('buildTeardownTargets', () => {
  const metricIds = ['imobiliaria.vgv', 'imobiliaria.leads'];
  const templateIds = ['imobiliaria-painel-executivo'];

  it('returns the demo documents, the exact exported ids and the dataset', () => {
    expect(buildTeardownTargets({ metricIds, templateIds })).toEqual({
      firestore: ['clients/imob-demo', 'dataContracts/imobiliaria', 'products/imobiliaria'],
      firestoreDocs: [
        { collection: 'metrics', ids: metricIds },
        { collection: 'dashboardTemplates', ids: templateIds },
      ],
      firestorePrefixes: [
        { collection: 'metrics', idPrefix: 'imobiliaria.' },
        { collection: 'dashboardTemplates', idPrefix: 'imobiliaria-' },
      ],
      bigqueryDatasets: ['imobiliaria_demo'],
    });
  });

  it('rejects an exported id outside the demo prefix', () => {
    expect(() => buildTeardownTargets({ metricIds: ['vila-rosa.pdd'], templateIds })).toThrow(/vila-rosa\.pdd/);
    expect(() => buildTeardownTargets({ metricIds, templateIds: ['covenants-x'] })).toThrow(/covenants-x/);
  });

  it('rejects empty id lists', () => {
    expect(() => buildTeardownTargets({ metricIds: [], templateIds })).toThrow(/metrics/);
    expect(() => buildTeardownTargets({ metricIds, templateIds: [] })).toThrow(/dashboardTemplates/);
  });
});

describe('findUnexpectedIds', () => {
  it('returns the ids found under the prefix that the demo does not export', () => {
    expect(findUnexpectedIds(['imobiliaria.a', 'imobiliaria.custom'], ['imobiliaria.a', 'imobiliaria.b'])).toEqual([
      'imobiliaria.custom',
    ]);
  });
});

describe('planDatasetTeardown', () => {
  const teardown = (overrides: Partial<DemoArgs>) => makeArgs({ mode: 'teardown', ...overrides });

  it('lists the dataset as kept when listing without --project', () => {
    expect(planDatasetTeardown(teardown({}))).toEqual([
      { datasetId: 'imobiliaria_demo', target: false, delete: false, project: null },
    ]);
  });

  it('keeps the dataset on --confirm without --project', () => {
    expect(planDatasetTeardown(teardown({ confirm: true }))).toEqual([
      { datasetId: 'imobiliaria_demo', target: false, delete: false, project: null },
    ]);
  });

  it('lists the dataset as a target, without deleting, when listing with --project', () => {
    expect(planDatasetTeardown(teardown({ project: 'p1' }))).toEqual([
      { datasetId: 'imobiliaria_demo', target: true, delete: false, project: 'p1' },
    ]);
  });

  it('deletes the dataset only with --confirm and --project', () => {
    expect(planDatasetTeardown(teardown({ project: 'p1', confirm: true }))).toEqual([
      { datasetId: 'imobiliaria_demo', target: true, delete: true, project: 'p1' },
    ]);
  });
});

describe('project resolution', () => {
  it('prefers --project over every env variable', () => {
    const env = { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'f', GOOGLE_CLOUD_PROJECT: 'g', GCP_PROJECT_ID: 'c', BIGQUERY_PROJECT_ID: 'b' };
    expect(resolveFirestoreProject(makeArgs({ project: 'p1' }), env)).toBe('p1');
    expect(resolveBigQueryProject(makeArgs({ project: 'p1' }), env)).toBe('p1');
  });

  it('resolves Firestore as NEXT_PUBLIC_FIREBASE_PROJECT_ID, then GOOGLE_CLOUD_PROJECT, then GCP_PROJECT_ID', () => {
    const args = makeArgs();
    expect(resolveFirestoreProject(args, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'f', GOOGLE_CLOUD_PROJECT: 'g', GCP_PROJECT_ID: 'c' })).toBe('f');
    expect(resolveFirestoreProject(args, { GOOGLE_CLOUD_PROJECT: 'g', GCP_PROJECT_ID: 'c' })).toBe('g');
    expect(resolveFirestoreProject(args, { GCP_PROJECT_ID: 'c' })).toBe('c');
    expect(resolveFirestoreProject(args, {})).toBeNull();
  });

  it('resolves BigQuery as BIGQUERY_PROJECT_ID, then GOOGLE_CLOUD_PROJECT', () => {
    const args = makeArgs();
    expect(resolveBigQueryProject(args, { BIGQUERY_PROJECT_ID: 'b', GOOGLE_CLOUD_PROJECT: 'g' })).toBe('b');
    expect(resolveBigQueryProject(args, { GOOGLE_CLOUD_PROJECT: 'g' })).toBe('g');
    expect(resolveBigQueryProject(args, {})).toBeNull();
  });

  it('trims values and skips empty or blank ones, like the seeds', () => {
    const args = makeArgs();
    expect(resolveFirestoreProject(args, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '  g  ' })).toBe('g');
    expect(resolveFirestoreProject(args, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: '   ', GCP_PROJECT_ID: 'c' })).toBe('c');
    expect(resolveBigQueryProject(args, { BIGQUERY_PROJECT_ID: ' ', GOOGLE_CLOUD_PROJECT: ' g' })).toBe('g');
    expect(resolveBigQueryProject(args, { BIGQUERY_PROJECT_ID: '  ' })).toBeNull();
  });
});

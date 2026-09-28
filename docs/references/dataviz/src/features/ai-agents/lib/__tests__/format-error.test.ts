import { describe, it, expect, afterEach } from 'vitest';
import { formatToolError } from '../format-error';
import { rememberProjectIds, forgetProjectIds } from '@/shared/lib/bigquery/known-project-ids';

describe('formatToolError — teto de bytes', () => {
  it('turns the BigQuery byte-cap refusal into an instruction the model can act on', () => {
    const err = new Error('Query exceeded limit for bytes billed: 5368709120. 10737418240 or higher required.');

    const out = formatToolError(err);

    expect(out).toMatch(/teto de bytes/);
    expect(out).toMatch(/data_base_report/);
    expect(out).not.toContain('5368709120');
  });
});

/**
 * O id do projeto GCP não é informação que o modelo precise ter, e a regex
 * antiga só pegava `palavra-palavra-123.algo`: o formato gerado pelo GCP
 * (`white-smile-508914-q2`, com sufixo), a referência legada com dois-pontos
 * (`projeto:dataset.tabela`), ids sem número e ids com domínio passavam.
 */
describe('formatToolError — id de projeto GCP', () => {
  it.each([
    ['gerado pelo GCP, com sufixo, forma legada', 'Not found: Table white-smile-508914-q2:vila_rosa_monitor.contratos was not found in location US', 'white-smile-508914-q2'],
    ['gerado pelo GCP, com sufixo, forma com ponto', 'Access Denied: Table white-smile-508914-q2.outro.vendas: User does not have permission', 'white-smile-508914-q2'],
    ['gerado pelo GCP, sem sufixo', 'Not found: Dataset my-project-123456:outro', 'my-project-123456'],
    ['só palavras e hífen', 'Not found: Table liquid-play-prod:ds.tabela', 'liquid-play-prod'],
    ['curto com hífen', 'Access Denied: Table proj-teste.ds.t: denied', 'proj-teste'],
    ['sem hífen, forma legada', 'Not found: Table meuprojeto:ds.tabela', 'meuprojeto'],
    ['com domínio', 'Not found: Table example.com:my-project:ds.t', 'my-project'],
    ['depois de "project"', 'User does not have bigquery.jobs.create permission in project white-smile-508914-q2.', 'white-smile-508914-q2'],
    ['em caminho de recurso', 'Error: projects/white-smile-508914-q2/jobs/abc not found', 'white-smile-508914-q2'],
    ['solto, formato gerado', 'Quota exceeded for white-smile-508914-q2 today', 'white-smile-508914-q2'],
    ['entre crases antes do ponto', 'Not found: Table `liquid-play-prod`.ds.t', 'liquid-play-prod'],
    ['entre aspas antes dos dois-pontos', 'Not found: Table "liquid-play-prod":ds.t', 'liquid-play-prod'],
    ['AI Studio (gen-lang-client)', 'Quota exceeded for gen-lang-client-0123456789 today', 'gen-lang-client-0123456789'],
    ['chave projectId em JSON', '{"projectId":"liquid-play-prod","reason":"x"}', 'liquid-play-prod'],
    ['chave project_id', 'labels: project_id=liquid-play-prod', 'liquid-play-prod'],
  ])('%s', (_name, message, id) => {
    const out = formatToolError(new Error(message));

    expect(out).not.toContain(id);
    expect(out).toContain('[project]');
  });

  it('redacts the configured project id even when it has no hyphen', () => {
    const before = process.env.GOOGLE_CLOUD_PROJECT;
    process.env.GOOGLE_CLOUD_PROJECT = 'acmedata';
    try {
      const out = formatToolError(new Error('Access Denied: Table acmedata.outro.vendas'));

      expect(out).not.toContain('acmedata');
    } finally {
      if (before === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
      else process.env.GOOGLE_CLOUD_PROJECT = before;
    }
  });

  it.each([
    'Unrecognized name: saldo_devedr at [3:14]',
    'Not found: Table vila_rosa_monitor.contratos',
    'Column contratos.saldo_devedor is not numeric',
    'Syntax error: Expected end of input but got keyword FROM at [1:8]',
    'Table is read-only',
    'No matching signature for user-defined function vila_rosa_monitor.f',
  ])('keeps what the model needs to fix its own query: %s', (message) => {
    expect(formatToolError(new Error(message))).toBe(message);
  });

  it('keeps the dataset and table after the redacted project', () => {
    expect(formatToolError(new Error('Not found: Table white-smile-508914-q2:vila_rosa_monitor.contratos')))
      .toBe('Not found: Table [project]:vila_rosa_monitor.contratos');
  });
});

/**
 * Revisão 2 do PR P: a heurística "hífen + dígito, ou dois hífens" apagava
 * região, modelo e palavra comum (us-central1, gemini-2.0-flash, utf-8,
 * out-of-range) e deixava passar id sem hífen (`acmeprod:ds`). Agora são duas
 * fontes: ids CONHECIDOS (config do app + `dataSources/*.projectId`), exatos em
 * qualquer lugar; e padrões que só casam na POSIÇÃO de projeto.
 */
const PROJECT_ENVS = ['BIGQUERY_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'GOOGLE_VERTEX_PROJECT', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'];
const withoutProjectEnv = <T>(fn: () => T): T => {
  const previous = PROJECT_ENVS.map((k) => [k, process.env[k]] as const);
  PROJECT_ENVS.forEach((k) => delete process.env[k]);
  try { return fn(); } finally {
    previous.forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  }
};

describe('formatToolError — id de projeto pela posição (23 formatos da revisão)', () => {
  it.each([
    'Not found: Dataset acmeprod:imobiliaria_demo was not found in location US',
    'Not found: Dataset acme-prod:imobiliaria_demo was not found in location US',
    'Not found: Table acmeprod:imobiliaria_demo.vendas was not found in location US',
    'Not found: Model acmeprod:vila_rosa_monitor.m',
    'Access Denied: Project acmeprod: User does not have bigquery.jobs.create permission in project acmeprod.',
    'Access Denied: Table acme-prod:ds.t: User does not have permission',
    'Invalid project ID acmeprod. Project IDs must contain 6-63 lowercase letters',
    'https://bigquery.googleapis.com/bigquery/v2/projects/acmeprod/jobs?prettyPrint=false',
    'Table `acme-prod.ds.t` not found',
    'Table "acme-prod.ds.t" not found',
    "Table 'acme-prod'.ds.t not found",
    'Resource acmeprod.ds.t not found',
    'Not found: Connection acmeprod.us.conn',
    'Not found: Connection projects/acmeprod/locations/us/connections/conn',
    'Dataset acmeprod:ds is still in use',
    'serviceAccount:dataviz@acmeprod.iam.gserviceaccount.com lacks permission',
    'dataviz@acme-prod-123.iam.gserviceaccount.com lacks permission',
    // Id que COMEÇA com palavra comum: a exclusão de palavra não pode pegá-lo.
    'Access Denied: Project acme-billing-42: User does not have permission in project acme-billing-42.',
    '{"projectId":"acmeprod","datasetId":"ds"}',
    'project_id=acmeprod',
    'white-smile-508914-q2 is the project',
    'Table white-smile-508914-q2:ds.t',
    'google.com:acmeprod:ds.t',
    'example.com:acme-prod.ds.t',
  ])('%s', (message) => {
    const out = withoutProjectEnv(() => formatToolError(new Error(message)));

    expect(out).not.toMatch(/acme|white-smile/);
  });

  it('redacts the whole service-account email, not only its project', () => {
    const out = withoutProjectEnv(() => formatToolError(new Error('serviceAccount:dataviz@acmeprod.iam.gserviceaccount.com lacks permission')));

    expect(out).not.toContain('dataviz@');
  });
});

describe('formatToolError — palavras comuns ficam intactas', () => {
  it.each([
    'The query is read-only and user-defined functions are allowed',
    'Encoding must be utf-8',
    'Not found in location us-central1',
    'Not found in location southamerica-east1',
    'Model gemini-2.0-flash is not available',
    'Endpoint text-embedding-004 not found',
    'Index is out-of-range',
    'Value is up-to-date',
    'Syntax error: Expected end of input but got keyword FROM at [1:8]',
    'Unrecognized name: zzz; Did you mean venda_id? at [1:8]',
    'No matching signature for operator = for argument types: STRING, INT64 at [1:45]',
    'Table vila_rosa_monitor.contratos has no column zzz',
    'Function not found: sha-256',
    'Use x-goog-user-project header',
    'Timestamp 2024-01-01T00:00:00 is invalid',
    'Reading region-us.INFORMATION_SCHEMA.JOBS',
    // Nome de permissão IAM tem a forma de `projeto.dataset.tabela`.
    'User does not have bigquery.jobs.create permission',
    'Permission resourcemanager.projects.get denied on resource',
    'Caller lacks storage.objects.create',
    'Missing serviceusage.services.use on the resource',
    // Palavra comum depois de "project" não é id.
    'Project settings are invalid',
    'Project default location is US',
    'The project billing account is disabled',
    'The project metadata cannot be read',
  ])('%s', (message) => {
    expect(withoutProjectEnv(() => formatToolError(new Error(message)))).toBe(message);
  });
});

describe('formatToolError — ids conhecidos (dataSources) em qualquer posição', () => {
  afterEach(() => forgetProjectIds());

  /** Trocado o projeto primeiro, o padrão do e-mail não casava e o nome da conta ficava. */
  it('redacts a whole service-account email whose project is known', () => {
    rememberProjectIds(['white-smile-508914-q2']);

    const out = withoutProjectEnv(() => formatToolError(new Error(
      'Permission denied for dataviz-sa@white-smile-508914-q2.iam.gserviceaccount.com',
    )));

    expect(out).toBe('Permission denied for [service-account]');
  });

  it('redacts a known data-source project id wherever it appears', () => {
    rememberProjectIds(['liquid-play-prod', 'bright-river-12345', 'acmeprod']);

    const out = withoutProjectEnv(() => formatToolError(new Error(
      'Quota exceeded for liquid-play-prod today; billing disabled for bright-river-12345; owner acmeprod',
    )));

    expect(out).not.toMatch(/liquid-play-prod|bright-river|acmeprod/);
  });

  it('does not redact a longer word that only contains a known id', () => {
    rememberProjectIds(['acmeprod']);

    expect(withoutProjectEnv(() => formatToolError(new Error('acmeprod_backup and acmeprod-old stay')))).toBe('acmeprod_backup and acmeprod-old stay');
  });
});

describe('formatToolError — id que começa com palavra comum', () => {
  it.each([
    ['Access Denied: Project billing-prod-42: denied in project billing-prod-42.', 'billing-prod-42'],
    ['Not found: projects/metadata-lake/datasets/x', 'metadata-lake'],
    ['Error in project "labels-prod"', 'labels-prod'],
    ['Project default-analytics does not exist', 'default-analytics'],
  ])('%s', (message, id) => {
    expect(withoutProjectEnv(() => formatToolError(new Error(message)))).not.toContain(id);
  });
});

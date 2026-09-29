/**
 * Sanitizadores de identificadores BigQuery.
 *
 * IMPORTANTE: BigQuery NÃO parametriza identificadores (nomes de
 * projeto, dataset, tabela, coluna). Toda interpolação DEVE passar
 * por estes helpers antes de ser concatenada em SQL.
 *
 * Regras:
 *  - `safeIdentifier`: aceita `[a-zA-Z_][a-zA-Z0-9_]*` (identificador SQL comum).
 *  - `safeProjectId`:  aceita `[a-z][a-z0-9-]{5,29}` (regras GCP).
 *  - `safeDatasetRef`: aceita `projeto.dataset` ou `dataset`.
 *  - `quoteIdentifier`: escapa em backticks (para tabelas/colunas).
 */

const SQL_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const GCP_PROJECT_RE = /^[a-z][a-z0-9-]{5,29}$/;

export class UnsafeIdentifierError extends Error {
  constructor(public readonly value: string, public readonly kind: string) {
    super(`Identificador inseguro (${kind}): "${value}"`);
    this.name = 'UnsafeIdentifierError';
  }
}

export function isSafeIdentifier(value: string): boolean {
  return SQL_IDENTIFIER_RE.test(value);
}

export function safeIdentifier(value: string, kind = 'identifier'): string {
  if (!isSafeIdentifier(value)) {
    throw new UnsafeIdentifierError(value, kind);
  }
  return value;
}

export function safeProjectId(value: string): string {
  if (!GCP_PROJECT_RE.test(value)) {
    throw new UnsafeIdentifierError(value, 'gcp-project-id');
  }
  return value;
}

/**
 * Aceita "dataset" ou "projeto.dataset". Retorna componentes validados.
 */
export function safeDatasetRef(value: string): { projectId?: string; datasetId: string } {
  const trimmed = value.trim();
  const lastDot = trimmed.lastIndexOf('.');

  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { datasetId: safeIdentifier(trimmed, 'dataset') };
  }

  return {
    projectId: safeProjectId(trimmed.slice(0, lastDot)),
    datasetId: safeIdentifier(trimmed.slice(lastDot + 1), 'dataset'),
  };
}

/**
 * Escapa identificador em backticks para uso seguro em SQL.
 * Ex: quoteIdentifier('contratos') => `contratos`
 */
export function quoteIdentifier(value: string, kind = 'identifier'): string {
  return `\`${safeIdentifier(value, kind)}\``;
}

/**
 * Constrói ref `projeto.dataset.tabela` com todos os componentes validados.
 */
export function quoteTableRef(params: {
  projectId?: string;
  datasetId: string;
  tableId: string;
}): string {
  const parts: string[] = [];
  if (params.projectId) parts.push(safeProjectId(params.projectId));
  parts.push(safeIdentifier(params.datasetId, 'dataset'));
  parts.push(safeIdentifier(params.tableId, 'table'));
  return `\`${parts.join('.')}\``;
}

/**
 * Literal de string GoogleSQL para valor que PRECISA ir no texto do SQL
 * (DDL de BQML não aceita query parameter). Prefira `params` sempre que der.
 *
 * Escapa a barra ANTES da aspa: no GoogleSQL a barra é o escape e `''` não é.
 * Só dobrar a aspa (o que se fazia) deixava `\'` fechar o literal — `x\'` virava
 * `'x\''`, e o que viesse depois era código.
 */
export function quoteStringLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `'${escaped}'`;
}

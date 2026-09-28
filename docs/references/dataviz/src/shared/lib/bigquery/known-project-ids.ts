/**
 * Ids de projeto GCP CONHECIDOS — redigidos por `formatToolError` em qualquer
 * posição, inclusive soltos no texto e sem hífen (`acmeprod`), que nenhum
 * padrão de posição pega.
 *
 * Duas fontes: a config do app (env, lida a cada chamada) e os
 * `dataSources/*.projectId` do Firestore, que o servidor registra aqui
 * (`warmKnownProjectIds` e cada `getDataSource`). Este módulo não importa nada:
 * `formatToolError` é síncrono e não pode abrir Firestore.
 */

const PROJECT_ENV_VARS = [
  'BIGQUERY_PROJECT_ID',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'GOOGLE_VERTEX_PROJECT',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
] as const;

const registered = new Set<string>();

export function rememberProjectIds(ids: Iterable<string | null | undefined>): void {
  for (const id of ids) {
    const trimmed = id?.trim();
    if (trimmed) registered.add(trimmed);
  }
}

/** Para testes. */
export function forgetProjectIds(): void {
  registered.clear();
}

export function knownProjectIds(): string[] {
  const fromEnv = PROJECT_ENV_VARS.map((k) => process.env[k]?.trim()).filter((v): v is string => !!v);
  return [...new Set([...fromEnv, ...registered])];
}

/**
 * Converte `firestore.indexes.json` (formato da Firebase CLI) no formato da
 * Firestore Admin REST API, e dá uma chave estável para comparar índices.
 *
 * Existe porque a Firebase CLI não é pré-requisito do projeto (o deploy de
 * regras já é feito por REST em `deploy-firestore-rules.mjs`), e sem os
 * índices compostos a lista de conversas do assistente quebra com
 * "The query requires an index" — descoberto na primeira instalação limpa.
 */

/** Chave `collectionGroup|scope|campo:ordem,...` — ignora o `__name__` que a API acrescenta. */
export const indexKey = (collectionGroup, index) => {
  const fieldList = (index.fields ?? [])
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`)
    .join(',');
  return `${collectionGroup}|${index.queryScope}|${fieldList}`;
};

/** Corpo do POST `.../collectionGroups/{cg}/indexes`. */
export const indexRequestBody = (index) => {
  return {
    queryScope: index.queryScope,
    fields: index.fields.map((f) =>
      f.arrayConfig
        ? { fieldPath: f.fieldPath, arrayConfig: f.arrayConfig }
        : { fieldPath: f.fieldPath, order: f.order },
    ),
  };
};

/** `collectionGroup` de um índice listado pela API (`projects/.../collectionGroups/{cg}/indexes/{id}`). */
export const collectionGroupFromName = (name) => {
  const m = /\/collectionGroups\/([^/]+)\/indexes\//.exec(name ?? '');
  return m ? m[1] : null;
};

/** Índices declarados que ainda não existem na API. */
export const missingIndexes = (declared, existing) => {
  const existingKeys = new Set(
    existing
      .map((i) => {
        const cg = collectionGroupFromName(i.name);
        return cg ? indexKey(cg, i) : null;
      })
      .filter(Boolean),
  );
  return declared.filter((i) => !existingKeys.has(indexKey(i.collectionGroup, i)));
};

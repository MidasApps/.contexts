/**
 * Normalização de id de cliente para nome de dataset BigQuery.
 *
 * Este arquivo já foi a "fonte única de tenants", com a lista de clientes
 * escrita em `TENANT_IDS`. A lista saiu: cliente é cadastro da administração
 * (`clients/` no Firestore), e mantê-la aqui significava que todo cliente novo
 * nascia recusado pelo BQML, ausente do filtro do catálogo SQL e inválido para
 * o compilador — até alguém lembrar de editar o array e fazer deploy.
 *
 * O que sobrou é regra de infraestrutura, não de negócio: o BigQuery não aceita
 * hífen em nome de dataset, e o id canônico do cliente usa hífen.
 */

/**
 * Segmento de nome de dataset BigQuery derivado de um id de cliente.
 * Ex.: `vila-rosa` → `vila_rosa`, compondo `dataviz_bqml_vila_rosa`.
 */
export function tenantDatasetSegment(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, '_');
}

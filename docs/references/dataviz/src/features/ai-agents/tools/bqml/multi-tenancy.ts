import { recordSpan } from '@/shared/lib/telemetry/record-span';
import { tenantDatasetSegment } from '@/shared/config/tenants';
import { Slug } from '@/shared/schemas/identifier';
import { quoteTableRef } from '@/shared/lib/bigquery/identifier';

/**
 * Validação ESTRUTURAL do clientId, não allowlist.
 *
 * Aqui havia um `Set` derivado de uma lista de tenants escrita no código. O
 * efeito era silencioso e ruim: cliente cadastrado pela admin — que é onde
 * cliente se cadastra — era recusado pelo BQML até alguém lembrar de editar o
 * array e fazer deploy. A lista de clientes vive no Firestore; repetir um
 * recorte dela aqui só cria uma segunda verdade que envelhece.
 *
 * O que a allowlist realmente protegia era a interpolação do id num nome de
 * dataset. Isso o formato de slug garante sozinho — `^[a-z][a-z0-9-]*$` não
 * deixa passar ponto, crase, espaço ou barra, que são os caracteres com os
 * quais se escapa de um nome de dataset.
 *
 * O isolamento entre tenants NÃO dependia desta função e continua onde
 * sempre esteve: `assertClientMatchesDataset`, que recusa modelo cujo dataset
 * não é o do cliente da requisição.
 */
function normalizeClient(clientId: string): string {
  // String(... ?? '') evita TypeError quando recebe undefined/non-string —
  // cai na mensagem clara "Invalid client id" em vez de quebrar antes do check.
  const id = String(clientId ?? '').trim().toLowerCase();
  if (!Slug.safeParse(id).success) {
    throw new Error(`Invalid client id: ${clientId}`);
  }
  // BQ não aceita hífen em dataset → segmento normalizado (ex.: vila-rosa → vila_rosa).
  return tenantDatasetSegment(id);
}

export function deriveBqmlDataset(clientId: string): string {
  return `dataviz_bqml_${normalizeClient(clientId)}`;
}

/**
 * Forma aceita de model_ref: `[projeto.]dataviz_bqml_<tenant>.bqml_<nome>`, com
 * ou sem UM par de crases em volta do todo. Ancorado nas DUAS pontas: o regex
 * anterior só ancorava o início, e `…bqml_x\`; DROP TABLE t; --` passava e
 * fechava a crase do SQL que o tool monta.
 */
const MODEL_REF_RE = /^(?:([a-z][a-z0-9-]{5,29})\.)?dataviz_bqml_([a-z0-9_]+)\.(bqml_[A-Za-z0-9_]+)$/;

/**
 * Valida o model_ref vindo do modelo contra o tenant da requisição e devolve a
 * referência RECOMPOSTA a partir das partes validadas (`quoteTableRef`), pronta
 * para interpolar. Nunca interpole o texto original.
 *
 * O projeto é descartado de propósito: `bqml_create_or_use_model` cria todo
 * modelo sem projeto (no projeto do job), então um projeto diferente no ref só
 * serviria para apontar para o dataset homônimo de OUTRO projeto.
 */
export function resolveTenantModelRef(clientId: string, modelRef: string): string {
  const raw = String(modelRef ?? '').trim();
  const withoutBackticks = /^`[^`]*`$/.test(raw) ? raw.slice(1, -1) : raw;
  const m = withoutBackticks.match(MODEL_REF_RE);
  if (!m) {
    throw new Error(`Invalid BQML model ref: ${modelRef}`);
  }
  const datasetClient = m[2]!;
  const expected = normalizeClient(clientId);
  if (datasetClient !== expected) {
    void recordSpan(
      {
        name: 'bqml.security.cross_tenant_denied',
        attributes: { clientId: expected, modelRef, datasetClient },
      },
      () => undefined,
    );
    throw new Error(
      `Cross-tenant model access denied: client=${expected} ref=${modelRef}`,
    );
  }
  return quoteTableRef({ datasetId: `dataviz_bqml_${datasetClient}`, tableId: m[3]! });
}

export function assertClientMatchesDataset(clientId: string, modelRef: string): void {
  resolveTenantModelRef(clientId, modelRef);
}

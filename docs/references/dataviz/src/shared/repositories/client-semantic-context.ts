import 'server-only';
import { getDb } from '@/shared/lib/firebase/admin';
import { getProduct } from '@/shared/repositories/product-repo';
import { METRIC_SHAPES, type MetricShape } from '@/shared/schemas/metric';

/**
 * Resolver de contexto semântico por cliente (frente C — ADR-0014/0015).
 *
 * Monta, a partir de `clients/{clientId}`, o contexto que a IA usa para:
 *  - **reusar** métricas que o cliente já tem (dos produtos contratados);
 *  - **criar** métricas novas a partir do data contract (entidades/atributos).
 *
 * É pura montagem de contexto — **sem gating**. Degrada graciosamente:
 * cliente inexistente ⇒ `null`; refs órfãs/deprecated ⇒ ignoradas com
 * `console.warn`, nunca fatal. Apoia-se no cache do `product-repo` e nas
 * coleções Firestore `metrics` + `dataContracts/{c}/entities/{e}/attributes`.
 */

export interface ClientSemanticContext {
  clientId: string;
  /** Métricas que o cliente já tem (dos produtos contratados), para reuso. */
  metrics: Array<{
    id: string; // MetricId "domain.slug"
    name: string;
    description?: string;
    /** Recipe da métrica (discriminated union `{ kind: 'aggregation' | 'sql', ... }`).
     *  Passado bruto — a camada de prompt decide o quanto renderizar. `undefined`
     *  ⇒ métrica é só rótulo semântico (sem caminho executável). */
    recipe?: unknown;
    /** Forma do resultado (`MetricDoc.shape`). `undefined` ⇒ métrica ainda não
     *  classificada: o prompt precisa dizer isso ao modelo, porque presumir
     *  `scalar` é exatamente o bug que trouxe KPI de série temporal. */
    shape?: MetricShape;
    /** Colunas devolvidas pela query, na ordem do SELECT (`MetricDoc.outputColumns`). */
    outputColumns?: string[];
    /**
     * Campos que esta métrica sabe filtrar (`MetricDoc.filterFields`, ADR-0026):
     * chave do filtro → o que ela compara e qual coluna do resultado exibe
     * aquele valor. É o vocabulário de `list_page_fields` / `add_page_filter`.
     */
    filterFields?: Record<string, { expr?: string; field?: string; label?: string }>;
    requires: string[]; // AttributeRef[] "contract.entity.attr"
    /**
     * Qual produto contratado surfaçou a métrica. Ausente nas métricas que são
     * do próprio cliente (criadas na conversa): elas não vêm de produto nenhum.
     */
    productId?: string;
  }>;
  /** Data contract dos produtos contratados, para criar métricas novas. */
  dataContracts: Array<{
    contractId: string;
    entities: Array<{
      entityId: string;
      attributes: Array<{ attributeId: string; type?: string; description?: string; column?: string | null }>;
    }>;
  }>;
}

interface RawBinding {
  productId?: unknown;
  enabledIndicators?: unknown;
  datasets?: unknown;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Aceita `shape` só quando o valor gravado é uma das formas conhecidas.
 *
 * O documento vem do Firestore sem passar pelo Zod (o resolver lê `data()`
 * cru), e uma forma desconhecida no prompt é pior que forma nenhuma: o modelo
 * escolheria bloco por um rótulo que nenhum bloco declara aceitar.
 */
function readShape(value: unknown): MetricShape | undefined {
  if (typeof value !== 'string') return undefined;
  const isKnown = (METRIC_SHAPES as readonly string[]).includes(value);
  if (!isKnown) {
    console.warn(`[client-semantic-context] shape desconhecido ignorado: ${value}`);
    return undefined;
  }
  return value as MetricShape;
}

/**
 * Coleta os ids de métricas que cada binding surfaça, aplicando
 * `enabledIndicators` como intersecção quando não-null.
 * Mapa metricId → productId (primeiro produto que surfaçou vence — rastreio).
 */
function collectMetricIds(
  metricRefs: string[],
  enabledIndicators: unknown,
): string[] {
  if (Array.isArray(enabledIndicators)) {
    const enabled = new Set(readStringArray(enabledIndicators));
    return metricRefs.filter((id) => enabled.has(id));
  }
  // null/ausente ⇒ todas as métricas do produto.
  return metricRefs;
}

/**
 * `filterFields` do doc, quando tem forma de mapa (ADR-0026).
 *
 * Sem `expr` a entrada não compara nada, então não entra: ela levaria o
 * assistente a oferecer um filtro que o WHERE ignora.
 */
function leFilterFields(
  raw: unknown,
): Record<string, { expr?: string; field?: string; label?: string }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const output: Record<string, { expr?: string; field?: string; label?: string }> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as { expr?: unknown; field?: unknown; label?: unknown };
    if (typeof v.expr !== 'string') continue;
    output[key] = {
      expr: v.expr,
      ...(typeof v.field === 'string' ? { field: v.field } : {}),
      ...(typeof v.label === 'string' ? { label: v.label } : {}),
    };
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

/** Doc de `metrics/{id}` → item do contexto. `null` quando deprecated. */
function readMetric(
  id: string,
  data: Record<string, unknown>,
  productId?: string,
): ClientSemanticContext['metrics'][number] | null {
  if (data.status === 'deprecated') return null;
  const outputColumns = readStringArray(data.outputColumns);
  return {
    id,
    name: typeof data.label === 'string' ? data.label : id,
    description: typeof data.description === 'string' ? data.description : undefined,
    recipe: data.recipe ?? undefined,
    shape: readShape(data.shape),
    outputColumns: outputColumns.length > 0 ? outputColumns : undefined,
    filterFields: leFilterFields(data.filterFields),
    requires: readStringArray(data.requires),
    ...(productId ? { productId } : {}),
  };
}

export async function getClientSemanticContext(
  clientId: string,
): Promise<ClientSemanticContext | null> {
  try {
    const db = getDb();

    const clientSnap = await db.collection('clients').doc(clientId).get();
    if (!clientSnap.exists) return null;

    const clientData = clientSnap.data() ?? {};
    const rawBindings: RawBinding[] = Array.isArray(clientData.productBindings)
      ? (clientData.productBindings as RawBinding[])
      : [];

    // Mapa coluna física por ref 3-part, a partir dos schemaBindings dos
    // datasets bound (G5). Mesma fonte que resolveColumn usa: chave
    // `contractRef.entity.attr` → coluna; `null` quando mapeado a null.
    const columnByRef = new Map<string, string | null>();
    for (const binding of rawBindings) {
      const datasets = Array.isArray(binding.datasets) ? binding.datasets : [];
      for (const ds of datasets) {
        const d = ds as { contractRef?: unknown; schemaBindings?: unknown };
        const contractRef = typeof d.contractRef === 'string' ? d.contractRef : null;
        const sb = d.schemaBindings && typeof d.schemaBindings === 'object'
          ? (d.schemaBindings as Record<string, unknown>)
          : null;
        if (!contractRef || !sb) continue;
        for (const [entityAttr, col] of Object.entries(sb)) {
          columnByRef.set(`${contractRef}.${entityAttr}`, typeof col === 'string' ? col : null);
        }
      }
    }

    // 1. Resolve produtos e coleta (metricId → productId) e (contractId+entityId)
    //    de cada produto contratado.
    const metricIdToProduct = new Map<string, string>();
    /** contractId → Set<entityId> a carregar do data contract. */
    const contractEntities = new Map<string, Set<string>>();

    for (const binding of rawBindings) {
      const productId = typeof binding.productId === 'string' ? binding.productId : null;
      if (!productId) continue;

      let product;
      try {
        product = await getProduct(productId);
      } catch (err) {
        console.warn(`[client-semantic-context] falha ao ler produto ${productId} (cliente ${clientId}), ignorado:`, err);
        continue;
      }
      if (!product) {
        console.warn(`[client-semantic-context] binding aponta para produto inexistente: ${productId} (cliente ${clientId})`);
        continue;
      }

      const surfaced = collectMetricIds(product.metricRefs, binding.enabledIndicators);
      for (const metricId of surfaced) {
        // Dedup: primeiro produto que surfaça a métrica registra o productId.
        if (!metricIdToProduct.has(metricId)) metricIdToProduct.set(metricId, productId);
      }

      // entityRefs (entity ids puros) pertencem aos contractRefs do produto.
      // Single-contract MVP: contractRefs === ['canonical']. Só inventamos o
      // fallback 'canonical' quando há entityRefs a resolver — não criamos
      // contract para produto que não tem nada a resolver.
      if (product.entityRefs.length > 0) {
        const contractRefs = product.contractRefs.length > 0 ? product.contractRefs : ['canonical'];
        for (const contractId of contractRefs) {
          let entities = contractEntities.get(contractId);
          if (!entities) {
            entities = new Set<string>();
            contractEntities.set(contractId, entities);
          }
          for (const entityId of product.entityRefs) entities.add(entityId);
        }
      }
    }

    // 2. Resolve as definições de métricas, pulando órfãs/deprecated/falhas.
    //
    // As leituras vão EM PARALELO de propósito. Em série, um cliente com 64
    // métricas pagava 64 round-trips enfileirados a cada mensagem do chat —
    // medido em 13–26s, ou seja, a maior parte da latência que o usuário
    // sentia como "a IA é lenta". O try/catch continua POR MÉTRICA (e não um
    // batch `getAll`) porque a falha de uma não pode derrubar as outras.
    const resolvedMetrics = await Promise.all(
      [...metricIdToProduct].map(async ([metricId, productId]) => {
        let metricSnap;
        try {
          metricSnap = await db.collection('metrics').doc(metricId).get();
        } catch (err) {
          console.warn(`[client-semantic-context] falha ao ler métrica ${metricId}, ignorada:`, err);
          return null;
        }
        if (!metricSnap.exists) {
          console.warn(`[client-semantic-context] metricRef órfã (métrica inexistente): ${metricId}`);
          return null;
        }
        const parsed = readMetric(metricId, metricSnap.data() ?? {}, productId);
        if (!parsed) console.warn(`[client-semantic-context] metricRef deprecated, ignorada: ${metricId}`);
        return parsed;
      }),
    );
    // `Promise.all` preserva a ordem de entrada, então a lista final sai na
    // mesma ordem do laço sequencial anterior.
    const metrics: ClientSemanticContext['metrics'] = resolvedMetrics.filter(
      (m): m is NonNullable<typeof m> => m !== null,
    );

    /*
     * 2.b As métricas do PRÓPRIO cliente.
     *
     * O catálogo até aqui é o que os produtos contratados surfaçam
     * (`metricRefs`). Métrica criada na conversa não pertence a produto nenhum:
     * ela nasce com `ownerClientId` do cliente e ponto. Sem esta consulta, ela
     * executaria normalmente (a rota de dados lê `metrics/{id}` direto) mas
     * sumiria do catálogo no turno seguinte — a IA a criaria, usaria, e na
     * mensagem seguinte diria que o indicador não existe.
     *
     * Degrada como o resto do arquivo: falha de leitura vira warn, não exceção.
     */
    try {
      const ownedMetrics = await db.collection('metrics').where('ownerClientId', '==', clientId).get();
      for (const doc of ownedMetrics.docs) {
        if (metricIdToProduct.has(doc.id)) continue; // já veio por produto
        const parsed = readMetric(doc.id, doc.data() ?? {});
        if (parsed) metrics.push(parsed);
      }
    } catch (err) {
      console.warn(`[client-semantic-context] falha ao ler métricas do cliente ${clientId}, ignoradas:`, err);
    }

    // 3. Fallback: sem entityRefs nos produtos, deriva os pares
    //    contractId/entityId dos requires[] das métricas resolvidas.
    const hasAnyEntityRef = [...contractEntities.values()].some((s) => s.size > 0);
    if (!hasAnyEntityRef) {
      for (const metric of metrics) {
        for (const ref of metric.requires) {
          const [contractId, entityId] = ref.split('.');
          if (!contractId || !entityId) continue;
          let entities = contractEntities.get(contractId);
          if (!entities) {
            entities = new Set<string>();
            contractEntities.set(contractId, entities);
          }
          entities.add(entityId);
        }
      }
    }

    // 4. Carrega os data contracts (entities + attributes), pulando entities
    //    vazias/inexistentes/com falha de leitura graciosamente.
    // Também em paralelo, e pelo mesmo motivo do passo 2: cada entity é uma
    // leitura de subcoleção, e enfileirá-las só somava round-trips.
    const dataContracts: ClientSemanticContext['dataContracts'] = [];
    const resolvedContracts = await Promise.all(
      [...contractEntities].map(async ([contractId, entityIds]) => {
        const parsedEntities = await Promise.all(
          [...entityIds].map(async (entityId) => {
            let attrsSnap;
            try {
              attrsSnap = await db
                .collection('dataContracts')
                .doc(contractId)
                .collection('entities')
                .doc(entityId)
                .collection('attributes')
                .get();
            } catch (err) {
              console.warn(`[client-semantic-context] falha ao ler atributos de ${contractId}.${entityId}, ignorada:`, err);
              return null;
            }

            const attributes = attrsSnap.docs
              .filter((d) => d.data()?.deprecated !== true)
              .map((d) => {
                const a = d.data() ?? {};
                return {
                  attributeId: d.id,
                  type: typeof a.type === 'string' ? a.type : undefined,
                  description: typeof a.description === 'string' ? a.description : undefined,
                  column: columnByRef.get(`${contractId}.${entityId}.${d.id}`) ?? null,
                };
              });

            if (attributes.length === 0) {
              console.warn(`[client-semantic-context] entity sem atributos (órfã/vazia), ignorada: ${contractId}.${entityId}`);
              return null;
            }
            return { entityId, attributes };
          }),
        );

        const entities = parsedEntities.filter((e): e is NonNullable<typeof e> => e !== null);
        return entities.length > 0 ? { contractId, entities } : null;
      }),
    );
    for (const contract of resolvedContracts) {
      if (contract) dataContracts.push(contract);
    }

    return { clientId, metrics, dataContracts };
  } catch (err) {
    // Nunca quebra o chat por falta de contexto: qualquer erro inesperado
    // (rede, quota, permissão, leitura do client doc) degrada para null.
    console.error(`[client-semantic-context] erro inesperado ao montar contexto do cliente ${clientId}, degradando para null:`, err);
    return null;
  }
}

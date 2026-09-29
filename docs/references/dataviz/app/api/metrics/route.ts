import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { MetricDoc, MetricId, type MetricRecipe } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { authorizeMetricWrite } from '@/shared/lib/metrics/authorize-metric';
import { verifyClientAccess, verifyAuthToken } from '@/shared/lib/api-auth';
import { auditFields } from '@/shared/lib/firestore/audit';
import { archiveRevision } from '@/shared/lib/metrics/metric-revisions';
import { preservedFromPrevious } from '@/shared/lib/metrics/preserve-fields';

/**
 * CRUD para metrics/ — catálogo global de KPIs/gráficos/tabelas (ADR-0015).
 *
 * POST valida que cada ref em `requires` aponta para um attribute existente
 * no contract correspondente — fail-loud impede métrica órfã.
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}


/**
 * Verifica que cada `contractId.entityId.attributeId` em `requires`
 * corresponde a um attribute existente. Retorna lista de refs inválidas
 * (vazia se todas existem).
 */
async function findInvalidRefs(requires: string[]): Promise<string[]> {
  const db = firestore();
  const invalid: string[] = [];
  for (const ref of requires) {
    const [contractId, entityId, attributeId] = ref.split('.');
    if (!contractId || !entityId || !attributeId) {
      invalid.push(ref);
      continue;
    }
    const snap = await db
      .collection('dataContracts')
      .doc(contractId)
      .collection('entities')
      .doc(entityId)
      .collection('attributes')
      .doc(attributeId)
      .get();
    if (!snap.exists) invalid.push(ref);
  }
  return invalid;
}

/**
 * Validação SOFT (não-bloqueante): para cada ref de `requires` que JÁ EXISTE,
 * sinaliza (sem 422) se o attribute alvo está `deprecated === true`.
 * Referenciar attribute deprecated é permitido, mas vira `warnings` no 200.
 * Assume que as refs já passaram por `findInvalidRefs` (todas existem).
 */
async function collectDeprecatedRefWarnings(requires: string[]): Promise<string[]> {
  const db = firestore();
  const warnings: string[] = [];
  for (const ref of requires) {
    const [contractId, entityId, attributeId] = ref.split('.');
    if (!contractId || !entityId || !attributeId) continue;
    const snap = await db
      .collection('dataContracts')
      .doc(contractId)
      .collection('entities')
      .doc(entityId)
      .collection('attributes')
      .doc(attributeId)
      .get();
    if (snap.exists && snap.data()?.deprecated === true) {
      warnings.push(`requires "${ref}" referencia attribute deprecated`);
    }
  }
  return warnings;
}

/**
 * Validação SOFT (A2): `requires` referencia múltiplos contracts. Hoje o
 * sistema é single-contract (sempre `canonical`), então normalmente não
 * dispara — é um guard p/ o futuro multi-contract, onde o roteamento de
 * dataset usa apenas o PRIMEIRO contract. Nunca bloqueia (sem 422).
 */
function collectMultiContractWarnings(requires: string[]): string[] {
  const contracts = new Set(requires.map((r) => r.split('.')[0]));
  if (contracts.size <= 1) return [];
  return [
    `requires referencia múltiplos contratos (${[...contracts].join(', ')}); o roteamento de dataset usa apenas o primeiro`,
  ];
}

/**
 * Resolve uma ref de atributo do recipe contra o(s) contract(s) presentes em
 * `requires`. A ref pode ser 2-part (`entityId.attributeId` — contract
 * implícito) ou 3-part (`contractId.entityId.attributeId` — já fully-qualified).
 * Para 2-part, tenta cada contract de `requires` até resolver.
 *
 * Retorna `'missing'` (não existe em nenhum contract candidato),
 * `'deprecated'` (existe mas `deprecated === true`) ou `null` (resolve ok).
 */
async function resolveRecipeRef(
  ref: string,
  contractIds: string[],
): Promise<'missing' | 'deprecated' | null> {
  const db = firestore();
  const parts = ref.split('.');

  let candidates: Array<{ contractId: string; entityId: string; attributeId: string }>;
  if (parts.length === 3) {
    const [contractId, entityId, attributeId] = parts;
    candidates = [{ contractId, entityId, attributeId }];
  } else if (parts.length === 2) {
    const [entityId, attributeId] = parts;
    candidates = contractIds.map((contractId) => ({ contractId, entityId, attributeId }));
  } else {
    return 'missing';
  }

  let sawDeprecated = false;
  for (const { contractId, entityId, attributeId } of candidates) {
    if (!contractId || !entityId || !attributeId) continue;
    const snap = await db
      .collection('dataContracts')
      .doc(contractId)
      .collection('entities')
      .doc(entityId)
      .collection('attributes')
      .doc(attributeId)
      .get();
    if (snap.exists) {
      if (snap.data()?.deprecated === true) {
        sawDeprecated = true;
        continue; // pode existir não-deprecated em outro contract candidato
      }
      return null;
    }
  }
  return sawDeprecated ? 'deprecated' : 'missing';
}

/**
 * Validação SOFT (A7): valida as refs de atributo dentro do `recipe` contra o
 * contract. Essas refs NÃO precisam estar em `requires[]`, então a checagem é
 * separada e sempre não-bloqueante (sem 422) — refs inexistentes/deprecated
 * viram `warnings` no 200.
 *
 * - aggregation: `valueAttribute`, `groupByAttributes[]`, `filters[].attribute`
 *   e `orderBy?.attribute` (campos exatos do schema).
 * - sql: best-effort — extrai placeholders `{entity.attribute}` do `template`
 *   (placeholders single-part `{entity}` e `{filter.*}` são ignorados).
 */
async function collectRecipeRefWarnings(
  recipe: MetricRecipe | undefined,
  requires: string[],
): Promise<string[]> {
  if (!recipe) return [];
  const contractIds = [...new Set(requires.map((r) => r.split('.')[0]).filter(Boolean))];
  // No fluxo da API isto nunca dispara: MetricDoc.requires é `.min(1)` (400 antes
  // daqui). Se esse invariante for relaxado (ex.: métricas só-label com recipe),
  // a validação de refs do recipe vira no-op silencioso — revisite este guard.
  if (contractIds.length === 0) return [];

  const refs: string[] = [];
  if (recipe.kind === 'aggregation') {
    if (recipe.valueAttribute) refs.push(recipe.valueAttribute);
    for (const g of recipe.groupByAttributes) refs.push(g);
    for (const f of recipe.filters) refs.push(f.attribute);
    if (recipe.orderBy?.attribute) refs.push(recipe.orderBy.attribute);
  } else if (recipe.kind === 'sql') {
    // sql: extrai `{entityId.attributeId}` do template. Ignora placeholders
    // single-part (`{entityId}` → tabela) e filtros globais (`{filter.x}`).
    const re = /\{(\w+)\.(\w+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(recipe.template)) !== null) {
      if (m[1] === 'filter') continue;
      refs.push(`${m[1]}.${m[2]}`);
    }
  } else {
    // derived: refs 3-part (`contractId.entity.attr`) dos termos, group-by,
    // filtros, tempo e ordenação. `resolveRecipeRef` aceita 3-part direto.
    for (const t of recipe.terms) if (t.valueRef) refs.push(t.valueRef);
    for (const g of recipe.groupByRefs ?? []) refs.push(g);
    for (const f of recipe.filters ?? []) refs.push(f.attribute);
    if (recipe.timeRef) refs.push(recipe.timeRef);
    if (recipe.orderBy?.ref) refs.push(recipe.orderBy.ref);
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const result = await resolveRecipeRef(ref, contractIds);
    if (result === 'missing') {
      warnings.push(`recipe referencia atributo inexistente "${ref}"`);
    } else if (result === 'deprecated') {
      warnings.push(`recipe referencia atributo deprecated "${ref}"`);
    }
  }
  return warnings;
}

export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const clientId = url.searchParams.get('clientId');
    let query = firestore().collection('metrics') as FirebaseFirestore.Query;
    if (status) query = query.where('status', '==', status);
    const snap = await query.get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
      id: string;
      ownerClientId?: string | null;
    }>;

    // Escopo por dono: globais (null) visíveis a todos; métricas de cliente só
    // se o usuário tem acesso àquele cliente. Admin sem clientId → todas.
    const admin = isAdminEmail(email);
    if (admin && !clientId) {
      return NextResponse.json({ data: all });
    }
    const canSeeClient = clientId ? (await verifyClientAccess(email, clientId)).allowed : false;
    const data = all.filter((m) => {
      const owner = m.ownerClientId ?? null;
      return owner === null || (canSeeClient && owner === clientId);
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Promoção (cliente→global): admin-only, flip de campo, id/refs estáveis.
  const rawBody = await req.json();
  if (rawBody?.action === 'promote') {
    const idParse = MetricId.safeParse(rawBody?.id);
    if (!idParse.success) return NextResponse.json({ error: 'Metric ID inválido' }, { status: 400 });
    const ref = firestore().collection('metrics').doc(idParse.data);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Métrica não encontrada' }, { status: 422 });
    const currentOwner = ((snap.data() as { ownerClientId?: string | null }).ownerClientId) ?? null;
    const auth = await authorizeMetricWrite(email, currentOwner, 'promote');
    if (!auth.allowed) return NextResponse.json({ error: auth.error ?? 'Sem permissão' }, { status: auth.status ?? 403 });
    await ref.update({ ownerClientId: null, updatedAt: Timestamp.now() });
    return NextResponse.json({ ok: true, id: idParse.data });
  }

  try {
    const idParse = MetricId.safeParse(rawBody?.id);
    if (!idParse.success) {
      return NextResponse.json(
        { error: 'Metric ID inválido (esperado "domain.slug")' },
        { status: 400 },
      );
    }

    const ref = firestore().collection('metrics').doc(idParse.data);
    const existing = await ref.get();
    const previous = existing.exists ? (existing.data() as Record<string, unknown>) : null;

    /*
     * O que o formulário não expressa sobrevive a ele.
     *
     * Este handler reconstrói o documento do zero (`merge: false`), então todo
     * campo fora do formulário some. `origin` e `derivedFrom` dizem de onde a
     * métrica veio (conversa ou administração, e de qual métrica é variação);
     * `filterFields` declara o que o filtro de página compara nela (ADR-0026) e
     * é escrito por seed/admin de catálogo. Salvar pela tela apagava os três —
     * mesma classe do anti-sequestro logo abaixo.
     *
     * `origin` fica aqui, e não em `preserve-fields`, porque é a diferença
     * entre os dois escritores: o chat reescreve o campo de propósito (a recipe
     * passou mesmo a ser dele), o formulário não tem como expressá-lo.
     */
    const notExpressedByForm = {
      ...(typeof previous?.origin === 'string' ? { origin: previous.origin } : {}),
      ...preservedFromPrevious(previous),
    };

    /*
     * O preservado entra no `safeParse` junto com o formulário: o que vai para
     * o Firestore é exatamente o que o `MetricDoc` aprovou. Antes, ele era
     * costurado depois da validação, e uma declaração malformada no documento
     * antigo seria regravada sem passar por schema nenhum.
     */
    const docParse = MetricDoc.omit({ createdAt: true, updatedAt: true }).safeParse({
      label: rawBody.label,
      description: rawBody.description ?? null,
      type: rawBody.type,
      category: rawBody.category ?? null,
      unit: rawBody.unit ?? null,
      requires: rawBody.requires ?? [],
      recipe: rawBody.recipe ?? undefined,
      version: rawBody.version ?? '1.0.0',
      status: rawBody.status ?? 'active',
      ownerClientId: rawBody.ownerClientId ?? null,
      ...notExpressedByForm,
    });
    if (!docParse.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: docParse.error.issues },
        { status: 400 },
      );
    }

    // Anti-sequestro: em update, autoriza e preserva o dono do DOC existente
    // (ignora ownerClientId do corpo). Em create, usa o dono do corpo.
    const effectiveOwner = existing.exists
      ? ((previous as { ownerClientId?: string | null } | null)?.ownerClientId ?? null)
      : docParse.data.ownerClientId;

    const auth = await authorizeMetricWrite(email, effectiveOwner, existing.exists ? 'update' : 'create');
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error ?? 'Sem permissão' }, { status: auth.status ?? 403 });
    }

    // Fail-loud: refs órfãs viram erro 422.
    const invalid = await findInvalidRefs(docParse.data.requires);
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: 'Refs inexistentes no contract',
          invalidRefs: invalid,
        },
        { status: 422 },
      );
    }

    // Validação SOFT (não-bloqueante): tudo aqui vira `warnings` no 200 —
    // referenciar é permitido, mas sinalizado. NUNCA 422.
    const warnings = [
      // refs de `requires` para attributes deprecated
      ...(await collectDeprecatedRefWarnings(docParse.data.requires)),
      // A2: `requires` espalhado por múltiplos contracts
      ...collectMultiContractWarnings(docParse.data.requires),
      // A7: refs de atributo dentro do `recipe` (inexistentes/deprecated)
      ...(await collectRecipeRefWarnings(docParse.data.recipe, docParse.data.requires)),
    ];
    if (warnings.length > 0) {
      console.warn(`[POST /api/metrics] ${idParse.data}:`, warnings);
    }

    // O histórico é da métrica, não do caminho que a alterou: uma edição pela
    // administração some do `revisions` se só o chat arquivar.
    if (previous) {
      await archiveRevision({ db: firestore(), metricId: idParse.data, doc: previous, email });
    }

    // `docParse.data` já traz o preservado — ele foi validado junto, acima.
    await ref.set(
      {
        ...docParse.data,
        ownerClientId: effectiveOwner,
        ...auditFields(email, !existing.exists),
      },
      { merge: false },
    );

    // `warnings` só aparece quando há algo a sinalizar (happy-path inalterado).
    return NextResponse.json({
      ok: true,
      id: idParse.data,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Soft-delete: marca métrica como deprecated.
 * Hard-delete: remove permanentemente — bloqueado (422) se qualquer produto
 * (`metricRefs`) ou dashboardTemplate (`metricRefs`) ainda referencia a métrica.
 * O rename usa o endpoint atômico dedicado (`POST /api/metrics/rename`), que
 * re-aponta as refs; este handler nunca bypassa o guard.
 */
export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const hard = url.searchParams.get('hard') === 'true';
    const idParse = MetricId.safeParse(id);
    if (!idParse.success) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const db = firestore();
    const ref = db.collection('metrics').doc(idParse.data);

    // Permissão por dono: autoriza pelo ownerClientId do DOC existente.
    const snap = await ref.get();
    const owner = snap.exists ? (((snap.data() as { ownerClientId?: string | null }).ownerClientId) ?? null) : null;
    const auth = await authorizeMetricWrite(email, owner, 'delete');
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error ?? 'Sem permissão' }, { status: auth.status ?? 403 });
    }

    if (hard) {
      // Guard: bloqueia hard-delete se products OU dashboardTemplates referenciam.
      const [productsSnap, templatesSnap] = await Promise.all([
        db.collection('products').where('metricRefs', 'array-contains', idParse.data).get(),
        db.collection('dashboardTemplates').where('metricRefs', 'array-contains', idParse.data).get(),
      ]);
      if (!productsSnap.empty || !templatesSnap.empty) {
        const dependentProducts = productsSnap.docs.map((d) => d.id);
        const dependentTemplates = templatesSnap.docs.map((d) => d.id);
        return NextResponse.json(
          {
            error: 'Métrica referenciada',
            dependentProducts,
            dependentTemplates,
          },
          { status: 422 },
        );
      }
      await ref.delete();
    } else {
      await ref.update({ status: 'deprecated', updatedAt: Timestamp.now() });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao depreciar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

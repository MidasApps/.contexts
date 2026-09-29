import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { MetricDoc, MetricId, type MetricShape } from '@/shared/schemas/metric';
import { auditFields } from '@/shared/lib/firestore/audit';
import { generateUniqueMetricId } from './metric-id';
import { archiveRevision } from './metric-revisions';
import { preservedFromPrevious } from './preserve-fields';

/**
 * Grava a métrica que nasceu de uma conversa.
 *
 * É o ÚNICO caminho em que uma recipe escrita por LLM vira documento do
 * catálogo. O POST /api/metrics valida com `MetricDoc` antes de gravar; este
 * caminho não passa por lá, então a validação acontece aqui, imediatamente
 * antes do `set()` — documento inválido em `metrics/{id}` só falharia depois,
 * na execução, longe da causa.
 *
 * O domínio é sempre `chat`, e o id é sempre novo: métrica é compartilhada por
 * todos os relatórios que a referenciam, então sobrescrever uma existente seria
 * mexer em página que ninguém pediu para mexer. Editar no lugar existe, mas é
 * decisão de quem chama (`metricId` explícito), tomada depois de conferir quem
 * usa a métrica.
 */

export interface ChatMetric {
  /** Dono. Métrica de chat nunca é global — global é catálogo da Liquid. */
  clientId: string;
  label: string;
  description?: string | null;
  unit?: string | null;
  /** Template SQL com placeholders do contrato (`{entidade.atributo}`). */
  sql: string;
  /** Refs `contrato.entidade.atributo`; a PRIMEIRA decide o dataset. */
  requires: string[];
  shape: MetricShape;
  /** Nomes das colunas na ordem do SELECT — vêm do dry-run, não do modelo. */
  outputColumns: string[];
  /** Colunas em pontos percentuais, já conferidas contra `outputColumns` (ADR-0033). */
  percentPointColumns?: string[];
  /** Métrica de origem, quando esta nasce como variação de outra. */
  derivedFrom?: string;
}

/** `chat.<slug>` a partir do rótulo (minúsculas, sem acento, [a-z0-9_]). */
export function slugFromLabel(label: string): string {
  const norm = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return norm.slice(0, 40).replace(/^[0-9_]+/, '') || 'metrica';
}

export interface SaveChatMetricOptions {
  db: FirebaseFirestore.Firestore;
  metric: ChatMetric;
  /** Quem está escrevendo, do token verificado — nunca do corpo/input. */
  email: string;
  /** Ausente ⇒ id novo em `chat.`. Presente ⇒ reescreve aquele documento. */
  metricId?: string;
  /** Preservado na reescrita — só a criação carimba `createdAt`. */
  createdAt?: unknown;
  /** Semver do documento; a reescrita passa a versão já incrementada. */
  version?: string;
  /**
   * O documento como está hoje. Presente ⇒ vai para `revisions` antes de ser
   * sobrescrito. Quem reescreve já o leu para decidir a escrita; pedi-lo aqui
   * evita uma segunda leitura e deixa explícito que reescrever ARQUIVA.
   */
  previousDoc?: Record<string, unknown>;
}

export async function saveChatMetric(
  opts: SaveChatMetricOptions,
): Promise<{ metricId: string } | null> {
  const { db, metric } = opts;
  const metricId = opts.metricId
    ?? (await generateUniqueMetricId(db, 'chat', slugFromLabel(metric.label)));
  const now = Timestamp.now();

  const parsed = MetricDoc.safeParse({
    label: metric.label.slice(0, 120),
    description: metric.description ?? null,
    // `type` é back-compat (nenhum leitor em runtime); quem manda na
    // renderização é `shape`, e quem escolhe o bloco é o supervisor.
    type: 'kpi',
    category: null,
    unit: metric.unit ?? null,
    requires: metric.requires,
    recipe: { kind: 'sql', template: metric.sql },
    shape: metric.shape,
    outputColumns: metric.outputColumns,
    ...(metric.percentPointColumns?.length ? { percentPointColumns: metric.percentPointColumns } : {}),
    // `origin` é reescrito de propósito — aqui a recipe passou MESMO a ser do
    // chat. É o campo que este caminho expressa e a rota admin não.
    origin: 'chat',
    // O que o rascunho não sabe expressar (ver `preserve-fields.ts`). Vem
    // antes do `derivedFrom` do rascunho: linhagem informada explicitamente
    // (variação nova) manda mais que a herdada do documento reescrito.
    ...preservedFromPrevious(opts.previousDoc),
    ...(metric.derivedFrom ? { derivedFrom: metric.derivedFrom } : {}),
    version: opts.version ?? '1.0.0',
    status: 'active',
    ownerClientId: metric.clientId,
    createdAt: opts.createdAt ?? now,
    updatedAt: now,
  });

  const idOk = MetricId.safeParse(metricId).success;
  if (!parsed.success || !idOk) {
    console.warn('[metrica-do-chat] doc inválido, não persistido', {
      metricId,
      idOk,
      issues: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return null;
  }

  /*
   * Autoria fora do schema, como na rota de administração (`auditFields`): o
   * achado R19 vale para toda escrita, e o caminho do chat era o único que não
   * registrava quem pediu a métrica.
   */
  const data = { ...parsed.data, ...auditFields(opts.email, !opts.metricId) };

  // Arquiva ANTES de sobrescrever — depois não há mais o que arquivar.
  if (opts.previousDoc) {
    await archiveRevision({ db, metricId, doc: opts.previousDoc, email: opts.email });
  }

  const ref = db.collection('metrics').doc(metricId);
  /*
   * `create` na criação, `set` só na reescrita.
   *
   * O id novo sai de um laço check-then-use (`generateUniqueMetricId` procura o
   * primeiro livre): duas criações simultâneas com o mesmo rótulo chegam ao
   * mesmo id, e com `set` a segunda apagaria a primeira em silêncio. `create`
   * falha nesse caso — perder a corrida é um erro que a tool conta ao usuário,
   * não uma métrica que some.
   */
  if (opts.metricId) await ref.set(data);
  else await ref.create(data);
  return { metricId };
}

/** Incrementa o patch do semver; qualquer coisa fora de forma vira `1.0.1`. */
export function nextVersion(current: unknown): string {
  const m = typeof current === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(current) : null;
  if (!m) return '1.0.1';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

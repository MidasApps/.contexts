import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Histórico de uma métrica: `metrics/{id}/revisions`.
 *
 * Sem isto, alterar uma métrica apaga o que ela era — o template anterior
 * simplesmente deixa de existir. Enquanto a política era "na dúvida, cria
 * variante", dava para viver com isso: a original ficava intacta. Deixou de
 * dar quando a correção passou a valer para todas as páginas que usam a
 * métrica, que é o que se quer de um catálogo compartilhado. Propagar sem
 * poder desfazer é a versão perigosa dessa ideia.
 *
 * Guarda o documento INTEIRO, não um diff: o registro precisa se bastar para
 * restaurar, e um diff exige que a cadeia esteja completa desde o começo — o
 * que ela não está, para as métricas que já existem.
 *
 * Id automático, e não a versão: o formulário da administração grava sem
 * incrementar `version`, então duas edições por lá arquivariam sob a mesma
 * chave e a segunda apagaria a primeira. A ordem vem de `archivedAt`.
 */

export interface MetricRevision {
  /** Versão do documento arquivado (`null` quando ele não declarava). */
  version: string | null;
  /** O documento como estava antes de ser substituído. */
  doc: Record<string, unknown>;
  archivedAt: unknown;
  /** Quem causou a substituição. */
  archivedBy: string;
}

function revisionsCollection(db: FirebaseFirestore.Firestore, metricId: string) {
  return db.collection('metrics').doc(metricId).collection('revisions');
}

/** Arquiva o documento atual ANTES de ele ser sobrescrito. */
export async function archiveRevision(opts: {
  db: FirebaseFirestore.Firestore;
  metricId: string;
  /** O documento como está agora — quem chama já o leu para decidir a escrita. */
  doc: Record<string, unknown>;
  email: string;
}): Promise<void> {
  const revision: MetricRevision = {
    version: typeof opts.doc.version === 'string' ? opts.doc.version : null,
    doc: opts.doc,
    archivedAt: Timestamp.now(),
    archivedBy: opts.email,
  };
  await revisionsCollection(opts.db, opts.metricId).add(revision);
}

/** A revisão mais recente — o estado para o qual um desfazer volta. */
export async function latestRevision(
  db: FirebaseFirestore.Firestore,
  metricId: string,
): Promise<MetricRevision | null> {
  const snap = await revisionsCollection(db, metricId).orderBy('archivedAt', 'desc').limit(1).get();
  const doc = snap.docs[0];
  return doc ? (doc.data() as MetricRevision) : null;
}

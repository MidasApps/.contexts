/**
 * Repository CRUD para o catálogo de SQL validado (ADR-0009) — Firestore-backed
 * (Bulk F4 / ADR-0013). Substitui `liquid_meta.sql_catalog` (BigQuery DML) por
 * coleção `sqlCatalog` no Firestore Admin via `getDb()`.
 *
 * Multi-tenancy (ADR-0006): TODA operação que cruza tenant exige `clientId`
 * server-bound. Repository lança se `clientId` for vazio em métodos
 * tenant-scoped (insertDraft, listByClient, incrementUse, findByHash).
 *
 * Public API (`createRepository(): SqlCatalogRepository`) é a mesma — sem args
 * de BigQuery. Métodos `insertDraft`, `listByClient`, `countByClient`,
 * `getById`, `updateFields`, `approve`, `reject`, `incrementUse`,
 * `markNeedsRevalidation`, `findByHash` mantêm assinatura.
 */
import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { canonicalSqlHash } from './hash';

export type SqlCatalogStatus = 'draft' | 'approved' | 'deprecated' | 'needs_revalidation';

const COLLECTION = 'sqlCatalog';
const BATCH_SIZE = 500;

export interface SqlCatalogRow {
  id: string;
  intent: string;
  sql: string;
  sql_hash: string;
  schema_snapshot: Record<string, unknown> | null;
  client_id: string;
  persona_id: string | null;
  tags: string[] | null;
  quality_score: number | null;
  curated_by: string | null;
  curated_at: string | null;
  glossary_version: string | null;
  regulatory_pack_version: string | null;
  status: SqlCatalogStatus;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export const QUALITY_SCORE_MIN = 0.7;

export class QualityScoreTooLowError extends Error {
  constructor(public readonly qualityScore: number) {
    super(
      `quality_score=${qualityScore} é menor que o gate ADR-0009 (>= ${QUALITY_SCORE_MIN}).`,
    );
    this.name = 'QualityScoreTooLowError';
  }
}

export interface InsertDraftInput {
  intent: string;
  sql: string;
  clientId: string;
  personaId: string | null;
  schemaSnapshot: Record<string, unknown> | null;
  tags: string[] | null;
  qualityScore?: number | null;
}

export interface ListByClientInput {
  clientId: string;
  status?: SqlCatalogStatus;
  personaId?: string | null;
  limit: number;
  offset?: number;
}

export interface ApproveInput {
  id: string;
  curatedBy: string;
  qualityScore: number;
  glossaryVersion: string;
  regulatoryPackVersion: string;
}

export interface IncrementUseInput {
  sqlHash: string;
  clientId: string;
}

export interface FindByHashInput {
  sqlHash: string;
  clientId: string;
}

export interface UpdateFieldsInput {
  id: string;
  intent?: string;
  sql?: string;
  tags?: string[] | null;
  qualityScore?: number | null;
  schemaSnapshot?: Record<string, unknown> | null;
}

export interface SqlCatalogRepository {
  insertDraft(input: InsertDraftInput): Promise<{ id: string; sqlHash: string }>;
  listByClient(input: ListByClientInput): Promise<SqlCatalogRow[]>;
  countByClient(input: Omit<ListByClientInput, 'limit' | 'offset'>): Promise<number>;
  getById(id: string): Promise<SqlCatalogRow | null>;
  updateFields(input: UpdateFieldsInput): Promise<void>;
  approve(input: ApproveInput): Promise<void>;
  reject(input: { id: string }): Promise<void>;
  incrementUse(input: IncrementUseInput): Promise<void>;
  markNeedsRevalidation(input: { affectedIds: string[] }): Promise<void>;
  findByHash(input: FindByHashInput): Promise<SqlCatalogRow | null>;
}

function assertClientId(clientId: string, ctx: string): void {
  if (!clientId || clientId.trim() === '') {
    throw new Error(`${ctx}: clientId obrigatório (ADR-0006 multi-tenancy strict).`);
  }
}

function tsToIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  // Firestore at runtime returns objects with `.toDate()`.
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return new Date(v).toISOString();
  return null;
}

function rowFromDoc(
  id: string,
  data: DocumentData | undefined,
): SqlCatalogRow {
  const d = data ?? {};
  return {
    id,
    intent: (d.intent as string) ?? '',
    sql: (d.sql as string) ?? '',
    sql_hash: (d.sqlHash as string) ?? '',
    schema_snapshot: (d.schemaSnapshot as Record<string, unknown> | null) ?? null,
    client_id: (d.clientId as string) ?? '',
    persona_id: (d.personaId as string | null) ?? null,
    tags: (d.tags as string[] | null) ?? null,
    quality_score: (d.qualityScore as number | null) ?? null,
    curated_by: (d.curatedBy as string | null) ?? null,
    curated_at: tsToIso(d.curatedAt),
    glossary_version: (d.glossaryVersion as string | null) ?? null,
    regulatory_pack_version: (d.regulatoryPackVersion as string | null) ?? null,
    status: ((d.status as SqlCatalogStatus) ?? 'draft'),
    use_count: typeof d.useCount === 'number' ? d.useCount : 0,
    last_used_at: tsToIso(d.lastUsedAt),
    created_at: tsToIso(d.createdAt) ?? '',
    updated_at: tsToIso(d.updatedAt) ?? '',
  };
}

export function createRepository(): SqlCatalogRepository {
  const col = () => getDb().collection(COLLECTION);

  return {
    async insertDraft(input) {
      assertClientId(input.clientId, 'insertDraft');
      const sqlHash = canonicalSqlHash(input.sql);
      const ref = await col().add({
        intent: input.intent,
        sql: input.sql,
        sqlHash,
        schemaSnapshot: input.schemaSnapshot ?? null,
        clientId: input.clientId,
        personaId: input.personaId,
        tags: input.tags ?? [],
        qualityScore: input.qualityScore ?? null,
        curatedBy: null,
        curatedAt: null,
        glossaryVersion: null,
        regulatoryPackVersion: null,
        status: 'draft' as SqlCatalogStatus,
        useCount: 0,
        lastUsedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { id: ref.id, sqlHash };
    },

    async listByClient(input) {
      assertClientId(input.clientId, 'listByClient');
      let q = col().where('clientId', '==', input.clientId);
      if (input.status) q = q.where('status', '==', input.status);
      if (input.personaId !== undefined && input.personaId !== null) {
        q = q.where('personaId', '==', input.personaId);
      }
      q = q.orderBy('updatedAt', 'desc');
      if (input.offset && input.offset > 0) q = q.offset(input.offset);
      q = q.limit(input.limit);
      const snap = await q.get();
      return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) =>
        rowFromDoc(d.id, d.data()),
      );
    },

    async countByClient(input) {
      assertClientId(input.clientId, 'countByClient');
      let q = col().where('clientId', '==', input.clientId);
      if (input.status) q = q.where('status', '==', input.status);
      if (input.personaId !== undefined && input.personaId !== null) {
        q = q.where('personaId', '==', input.personaId);
      }
      const agg = await q.count().get();
      const data = agg.data() as { count?: number } | undefined;
      return Number(data?.count ?? 0) || 0;
    },

    async getById(id) {
      const snap = await col().doc(id).get();
      if (!snap.exists) return null;
      return rowFromDoc(snap.id, snap.data());
    },

    async updateFields(input) {
      const update: Record<string, unknown> = {};
      if (input.intent !== undefined) update.intent = input.intent;
      if (input.sql !== undefined) {
        update.sql = input.sql;
        update.sqlHash = canonicalSqlHash(input.sql);
      }
      if (input.tags !== undefined) update.tags = input.tags ?? [];
      if (input.qualityScore !== undefined) update.qualityScore = input.qualityScore;
      if (input.schemaSnapshot !== undefined) update.schemaSnapshot = input.schemaSnapshot;
      if (Object.keys(update).length === 0) return;
      update.updatedAt = FieldValue.serverTimestamp();
      await col().doc(input.id).update(update);
    },

    async approve(input) {
      if (input.qualityScore < QUALITY_SCORE_MIN) {
        throw new QualityScoreTooLowError(input.qualityScore);
      }
      await col().doc(input.id).update({
        status: 'approved' as SqlCatalogStatus,
        curatedBy: input.curatedBy,
        curatedAt: FieldValue.serverTimestamp(),
        qualityScore: input.qualityScore,
        glossaryVersion: input.glossaryVersion,
        regulatoryPackVersion: input.regulatoryPackVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });
    },

    async reject(input) {
      await col().doc(input.id).update({
        status: 'deprecated' as SqlCatalogStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
    },

    async incrementUse(input) {
      assertClientId(input.clientId, 'incrementUse');
      const snap = await col()
        .where('sqlHash', '==', input.sqlHash)
        .where('clientId', '==', input.clientId)
        .limit(1)
        .get();
      if (snap.empty) return;
      const doc = snap.docs[0];
      await doc.ref.update({
        useCount: FieldValue.increment(1),
        lastUsedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    },

    async markNeedsRevalidation(input) {
      if (input.affectedIds.length === 0) return;
      const db = getDb();
      for (let i = 0; i < input.affectedIds.length; i += BATCH_SIZE) {
        const slice = input.affectedIds.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const id of slice) {
          batch.update(db.collection(COLLECTION).doc(id), {
            status: 'needs_revalidation' as SqlCatalogStatus,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    },

    async findByHash(input) {
      assertClientId(input.clientId, 'findByHash');
      const snap = await col()
        .where('sqlHash', '==', input.sqlHash)
        .where('clientId', '==', input.clientId)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const d = snap.docs[0];
      return rowFromDoc(d.id, d.data());
    },
  };
}

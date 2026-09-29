import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { hashId } from '@/shared/lib/rag/pii-scrubber';
import { deleteKbDocChunks } from './kb-upsert';

const SOURCES_COL = 'knowledgeBaseSources';
const KB_COL = 'knowledgeBases';

type Db = FirebaseFirestore.Firestore;
type KbStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface KbSourceRecord {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KbStatus;
  chunkCount: number;
  error?: string;
  uploadedBy?: string;
}

export function sourceDocId(knowledgeBaseId: string, filename: string): string {
  return hashId(`${knowledgeBaseId}:${filename}`);
}

export interface UpsertSourceInput {
  knowledgeBaseId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KbStatus;
  chunkCount?: number;
  error?: string;
  uploadedBy?: string;
}

export async function upsertSource(input: UpsertSourceInput, db?: Db): Promise<string> {
  const firestore = db ?? getDb();
  const id = sourceDocId(input.knowledgeBaseId, input.filename);
  const ref = firestore.collection(SOURCES_COL).doc(id);
  const existing = await ref.get();
  await ref.set(
    {
      knowledgeBaseId: input.knowledgeBaseId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: input.status,
      chunkCount: input.chunkCount ?? 0,
      ...(input.error !== undefined ? { error: input.error } : {}),
      ...(input.uploadedBy !== undefined ? { uploadedBy: input.uploadedBy } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  return id;
}

function serialize(id: string, d: FirebaseFirestore.DocumentData): KbSourceRecord {
  return {
    id,
    knowledgeBaseId: d.knowledgeBaseId,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes ?? 0,
    status: (d.status as KbStatus) ?? 'pending',
    chunkCount: d.chunkCount ?? 0,
    error: d.error,
    uploadedBy: d.uploadedBy,
  };
}

export async function listSources(knowledgeBaseId: string, db?: Db): Promise<KbSourceRecord[]> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(SOURCES_COL).where('knowledgeBaseId', '==', knowledgeBaseId).get();
  return snap.docs.map((doc) => serialize(doc.id, doc.data()));
}

export async function getSource(id: string, db?: Db): Promise<KbSourceRecord | null> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(SOURCES_COL).doc(id).get();
  if (!snap.exists) return null;
  return serialize(snap.id, snap.data()!);
}

export async function recomputeKbCounters(knowledgeBaseId: string, db?: Db): Promise<void> {
  const firestore = db ?? getDb();
  const sources = await listSources(knowledgeBaseId, db);
  const ready = sources.filter((s) => s.status === 'ready');
  const docCount = ready.length;
  const chunkCount = ready.reduce((sum, s) => sum + (s.chunkCount ?? 0), 0);
  await firestore.collection(KB_COL).doc(knowledgeBaseId).set(
    { docCount, chunkCount, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function deleteSource(id: string, db?: Db): Promise<void> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(SOURCES_COL).doc(id).get();
  if (!snap.exists) return;
  const knowledgeBaseId = snap.data()!.knowledgeBaseId as string;
  await deleteKbDocChunks(id, db);
  await firestore.collection(SOURCES_COL).doc(id).delete();
  await recomputeKbCounters(knowledgeBaseId, db);
}

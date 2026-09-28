import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import {
  WorkingMemorySchema,
  WorkingMemoryPatchSchema,
  type WorkingMemory,
  type WorkingMemoryPatch,
} from './schema';
import { withMetric } from './metrics';

/**
 * Sprint 1.A memory-service — Firestore-backed (ADR-0013).
 *
 * Layout:
 * - `workingMemory/{threadId}` — working memory payload + thread metadata
 *   (resourceId, clientId, createdAt, updatedAt).
 * - `workingMemory/{threadId}/messages` — subcoleção de mensagens, ordenadas
 *   por `seq` (numeração crescente atribuída no append).
 *
 * Multi-tenancy (ADR-0006): callers são obrigados a passar `clientId` no
 * `createThread`. `setWorkingMemory`/`patchWorkingMemory` validam o payload
 * via Zod (`WorkingMemorySchema`), que exige `clientId`.
 */

const WORKING_MEMORY_COL = 'workingMemory';
const MESSAGES_SUBCOL = 'messages';

export interface Thread {
  id: string;
  resourceId: string;
  clientId: string;
  createdAt: Date;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  // Firestore returns objects with .toDate() at runtime.
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  return new Date();
}

/**
 * Cria (ou re-cria) um thread doc em `workingMemory/{id}`. Gera id quando não
 * fornecido. O payload de working memory começa vazio — chame
 * `setWorkingMemory`/`patchWorkingMemory` depois para popular.
 */
export async function createThread(input: {
  resourceId: string;
  clientId: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
}): Promise<Thread> {
  const db = getDb();
  const ref = input.threadId
    ? db.collection(WORKING_MEMORY_COL).doc(input.threadId)
    : db.collection(WORKING_MEMORY_COL).doc();

  await ref.set(
    {
      resourceId: input.resourceId,
      clientId: input.clientId,
      metadata: input.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const snap = await ref.get();
  const data = snap.data() ?? {};
  return {
    id: ref.id,
    resourceId: (data.resourceId as string) ?? input.resourceId,
    clientId: (data.clientId as string) ?? input.clientId,
    createdAt: toDate(data.createdAt),
  };
}

/**
 * Persiste a working memory de um thread, sobrescrevendo o payload anterior
 * (campo `payload`). Mantém metadados de thread (resourceId, clientId,
 * createdAt) intactos via merge.
 */
export async function setWorkingMemory(
  threadId: string,
  payload: WorkingMemory,
): Promise<WorkingMemory> {
  return withMetric(
    'setWorkingMemory',
    async () => {
      const validated = WorkingMemorySchema.parse(payload);
      const db = getDb();
      const ref = db.collection(WORKING_MEMORY_COL).doc(threadId);
      await ref.set(
        {
          payload: validated,
          clientId: validated.clientId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return WorkingMemorySchema.parse(validated);
    },
    { threadId },
  );
}

export async function getWorkingMemory(threadId: string): Promise<WorkingMemory | null> {
  return withMetric(
    'getWorkingMemory',
    async () => {
      const db = getDb();
      const snap = await db.collection(WORKING_MEMORY_COL).doc(threadId).get();
      if (!snap.exists) return null;
      const data = snap.data();
      const payload = data?.payload;
      if (!payload) return null;
      return WorkingMemorySchema.parse(payload);
    },
    { threadId },
  );
}

export async function patchWorkingMemory(
  threadId: string,
  patch: WorkingMemoryPatch,
): Promise<WorkingMemory> {
  const validatedPatch = WorkingMemoryPatchSchema.parse(patch);
  const current = (await getWorkingMemory(threadId)) ?? null;
  const merged: WorkingMemory = WorkingMemorySchema.parse({
    ...(current ?? {}),
    ...validatedPatch,
  });
  return setWorkingMemory(threadId, merged);
}

export interface StoredMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  parts: unknown[];
  createdAt: Date;
}

/**
 * Append a message to the thread's `messages` subcollection. Atribui `seq`
 * monotonicamente crescente baseado no maior seq existente (read+write não
 * transacional — aceitável: race condition resulta em duas msgs com mesmo
 * seq, ordenação por createdAt resolve em fallback).
 */
/**
 * Remove chaves com valor `undefined`, recursivamente.
 *
 * O Firestore recusa o documento inteiro se qualquer campo aninhado for
 * `undefined` ("Cannot use \"undefined\" as a Firestore value"). As `parts` de
 * mensagem vêm do AI SDK, que preenche campos opcionais com `undefined`
 * (`providerMetadata`, por exemplo) — então toda resposta de assistente era
 * recusada, e o histórico ficava vazio sem ninguém perceber.
 *
 * `undefined` e "ausente" significam a mesma coisa aqui, então descartar não
 * perde informação.
 */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => withoutUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      output[k] = withoutUndefined(v);
    }
    return output as T;
  }
  return value;
}

export async function appendMessage(
  threadId: string,
  input: { role: StoredMessage['role']; parts: unknown[] },
): Promise<StoredMessage> {
  const db = getDb();
  const parts = withoutUndefined(input.parts);
  const subcol = db
    .collection(WORKING_MEMORY_COL)
    .doc(threadId)
    .collection(MESSAGES_SUBCOL);

  const lastSnap = await subcol.orderBy('seq', 'desc').limit(1).get();
  const lastSeq = lastSnap.empty ? 0 : ((lastSnap.docs[0].data().seq as number) ?? 0);
  const nextSeq = lastSeq + 1;

  const docRef = await subcol.add({
    role: input.role,
    parts,
    seq: nextSeq,
    createdAt: FieldValue.serverTimestamp(),
  });

  const snap = await docRef.get();
  const data = snap.data() ?? {};
  return {
    id: docRef.id,
    threadId,
    role: (data.role as StoredMessage['role']) ?? input.role,
    parts: (data.parts as unknown[]) ?? parts,
    createdAt: toDate(data.createdAt),
  };
}

/**
 * Retorna mensagens do thread ordenadas pelas mais recentes primeiro
 * (DESC por `seq`), respeitando `limit` (default 50).
 */
export async function getMessages(
  threadId: string,
  opts: { limit?: number } = {},
): Promise<StoredMessage[]> {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const snap = await db
    .collection(WORKING_MEMORY_COL)
    .doc(threadId)
    .collection(MESSAGES_SUBCOL)
    .orderBy('seq', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      threadId,
      role: data.role as StoredMessage['role'],
      parts: (data.parts as unknown[]) ?? [],
      createdAt: toDate(data.createdAt),
    };
  });
}

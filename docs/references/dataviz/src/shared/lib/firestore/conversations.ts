import {
  collection, doc, addDoc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  type Unsubscribe, Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';
import type { CanvasPage, ChatRequestFilters } from '@/shared/config/agents/types';
import { migratePage, serializeBlocks } from '@/shared/config/agents/types';

// ── Types ──

export interface Conversation {
  id: string;
  userId: string;
  clientId: string;
  title: string;
  /**
   * Assunto fixo da conversa, quando ela pertence a um indicador
   * (`indicator:<rótulo>`). É como o modal reencontra a conversa daquele card
   * sem guardar id em lugar nenhum. `null` nas conversas livres da barra
   * lateral, que o usuário cria e nomeia à vontade.
   */
  subject: string | null;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  messages: SerializedMessage[];
  pages: CanvasPage[];
  filters: Partial<ChatRequestFilters> | null;
}

/** Minimal serializable message shape compatible with Vercel AI SDK UIMessage */
export interface SerializedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts: unknown[];
  createdAt?: string;
}

// ── Helpers ──

const COLLECTION = 'conversations';

function getCol() {
  return collection(getFirebaseDb(), COLLECTION);
}

function toDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date();
}

function docToConversation(id: string, data: Record<string, unknown>): Conversation {
  return {
    id,
    userId: data.userId as string,
    clientId: data.clientId as string,
    title: (data.title as string) || 'Nova conversa',
    subject: (data.subject as string) ?? null,
    pinned: (data.pinned as boolean) ?? false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    messages: (data.messages as SerializedMessage[]) ?? [],
    pages: ((data.pages as unknown[]) ?? []).map(p => migratePage(p as CanvasPage)),
    filters: (data.filters as Partial<ChatRequestFilters>) ?? null,
  };
}

// ── CRUD ──

export async function createConversation(
  userId: string,
  clientId: string,
  title: string,
  subject: string | null = null,
): Promise<string> {
  const ref = await addDoc(getCol(), {
    userId,
    clientId,
    title,
    subject,
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    messages: [],
    pages: [],
    filters: null,
  });
  return ref.id;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const snap = await getDoc(doc(getFirebaseDb(), COLLECTION, id));
  if (!snap.exists()) return null;
  return docToConversation(snap.id, snap.data() as Record<string, unknown>);
}

/** Strip undefined values recursively to avoid Firestore errors */
function stripUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (typeof obj === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== undefined) clean[k] = stripUndefined(v);
    }
    return clean;
  }
  return obj;
}

export async function updateConversation(
  id: string,
  data: Partial<Pick<Conversation, 'title' | 'pinned' | 'messages' | 'pages' | 'filters'>>,
): Promise<void> {
  const cleaned = stripUndefined(data) as Record<string, unknown>;
  // Serialize pages to include both new format (blockMap/layout) and legacy (blocks) for backward compat
  if (cleaned.pages) {
    cleaned.pages = (cleaned.pages as CanvasPage[]).map(p => ({
      ...p,
      blocks: serializeBlocks(p),
    }));
  }
  await updateDoc(doc(getFirebaseDb(), COLLECTION, id), {
    ...cleaned,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), COLLECTION, id));
}

export async function togglePin(id: string, pinned: boolean): Promise<void> {
  await updateConversation(id, { pinned });
}

// ── Queries ──

// listConversations() removida — a UI usa onConversationsSnapshot (abaixo),
// que é o listener em tempo real. A leitura pontual não tinha chamador.

/** Real-time listener for conversation list */
export function onConversationsSnapshot(
  userId: string,
  callback: (conversations: Conversation[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(getCol(), where('userId', '==', userId), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const conversations = snap.docs.map((d) =>
        docToConversation(d.id, d.data() as Record<string, unknown>),
      );
      callback(conversations);
    },
    (error) => {
      console.error('[Firestore] Conversations snapshot error:', error.message);
      // On permission error, return empty list instead of crashing
      callback([]);
      onError?.(error);
    },
  );
}

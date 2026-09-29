'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '@/features/auth/providers/AuthProvider';
import {
  onConversationsSnapshot,
  createConversation,
  updateConversation,
  getConversation,
  deleteConversation,
  togglePin,
  type Conversation,
  type SerializedMessage,
} from '@/shared/lib/firestore/conversations';
import type { CanvasPage, ChatRequestFilters } from '@/shared/config/agents/types';
import { useAppStore } from '@/shared/stores/app-store';

export function useConversations() {
  const { user } = useAuthContext();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time listener
  useEffect(() => {
    if (!user?.uid) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onConversationsSnapshot(user.uid, (convs) => {
      setConversations(convs);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const uid = user?.uid;
  const create = useCallback(async (title: string, subject: string | null = null) => {
    if (!uid || !activeClientId) return null;
    const id = await createConversation(uid, activeClientId, title, subject);
    return id;
  }, [uid, activeClientId]);

  const save = useCallback(async (
    id: string,
    data: {
      messages?: SerializedMessage[];
      pages?: CanvasPage[];
      filters?: Partial<ChatRequestFilters>;
      title?: string;
    },
  ) => {
    await updateConversation(id, data);
  }, []);

  const load = useCallback(async (id: string) => {
    return getConversation(id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id);
  }, []);

  const pin = useCallback(async (id: string, pinned: boolean) => {
    await togglePin(id, pinned);
  }, []);

  // Sorted: pinned first, then by updatedAt
  const sorted = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return {
    conversations: sorted,
    loading,
    create,
    save,
    load,
    remove,
    pin,
  };
}

/** Debounced auto-save hook */
export function useAutoSave(
  conversationId: string | null,
  save: (id: string, data: { messages?: SerializedMessage[]; pages?: CanvasPage[]; filters?: Partial<ChatRequestFilters> }) => Promise<void>,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const debouncedSave = useCallback((data: {
    messages?: SerializedMessage[];
    pages?: CanvasPage[];
    filters?: Partial<ChatRequestFilters>;
  }) => {
    if (!conversationId) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (savingRef.current) return; // skip if a save is already in flight
      savingRef.current = true;
      save(conversationId, data)
        .then(() => setSaveError(null))
        .catch((err) => {
          console.error('[auto-save] Failed:', err);
          setSaveError('Erro ao salvar conversa. Suas alterações podem não ter sido salvas.');
        })
        .finally(() => { savingRef.current = false; });
    }, 3000);
  }, [conversationId, save]);

  const dismissSaveError = useCallback(() => setSaveError(null), []);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return { debouncedSave, saveError, dismissSaveError };
}

'use client';

import { MessageSquare, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Skeleton } from '@/shared/ui/skeleton';
import type { Conversation } from '@/shared/lib/firestore/conversations';

interface ConversationHistoryProps {
  conversations: Conversation[];
  loading: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onPin: (id: string, pinned: boolean) => void;
  onRemove: (id: string) => void;
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/**
 * Histórico de conversas do assistente.
 *
 * Lista própria, e não a do `/explore`: aquela vive dentro de um componente de
 * 1200 linhas amarrado ao chrome daquela página (seletor de cliente, volta ao
 * dashboard, abas). Os DADOS são os mesmos — `useConversations` sobre a
 * coleção `conversations` — então não há segunda fonte de verdade, só uma
 * segunda apresentação, enxuta para caber na barra lateral.
 */
export function ConversationHistory({
  conversations,
  loading,
  activeId,
  onOpen,
  onNew,
  onPin,
  onRemove,
}: ConversationHistoryProps) {
  const pinnedConversations = conversations.filter((c) => c.pinned);
  const recent = conversations.filter((c) => !c.pinned);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-3 pb-2">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova conversa
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3 pt-1">
          {loading ? (
            // Esqueleto, não "nenhuma conversa": antes de a lista chegar não se
            // sabe se está vazia, e afirmar isso é o defeito que já corrigimos
            // no corpo do chat.
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-9 w-full rounded-lg bg-muted/40" />
              <Skeleton className="h-9 w-full rounded-lg bg-muted/40" />
              <Skeleton className="h-9 w-4/5 rounded-lg bg-muted/40" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-1 pt-6 text-center text-[11px] text-muted-foreground/50">
              Nenhuma conversa ainda. A primeira pergunta cria uma.
            </p>
          ) : (
            <>
              {pinnedConversations.length > 0 && (
                <Section title="Fixadas">
                  {pinnedConversations.map((c) => (
                    <Item
                      key={c.id}
                      conversation={c}
                      ativa={c.id === activeId}
                      onOpen={onOpen}
                      onPin={onPin}
                      onRemove={onRemove}
                    />
                  ))}
                </Section>
              )}
              {recent.length > 0 && (
                <Section title="Recentes">
                  {recent.map((c) => (
                    <Item
                      key={c.id}
                      conversation={c}
                      ativa={c.id === activeId}
                      onOpen={onOpen}
                      onPin={onPin}
                      onRemove={onRemove}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {title}
      </p>
      {children}
    </div>
  );
}

function Item({
  conversation,
  ativa: isActive,
  onOpen,
  onPin,
  onRemove,
}: {
  conversation: Conversation;
  ativa: boolean;
  onOpen: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/5'
          : 'border-transparent hover:border-border hover:bg-muted/40',
      )}
    >
      <button
        onClick={() => onOpen(conversation.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-foreground">{conversation.title}</span>
          <span className="block text-[10px] text-muted-foreground/50">
            {conversation.messages.length} mensagens · {dateLabel(conversation.updatedAt)}
          </span>
        </span>
      </button>

      {/* `focus-visible:opacity-100`: sem isto os botões recebem foco por Tab e
          continuam invisíveis até o hover do mouse. */}
      <button
        onClick={() => onPin(conversation.id, !conversation.pinned)}
        aria-label={conversation.pinned ? `Desafixar ${conversation.title}` : `Fixar ${conversation.title}`}
        className="shrink-0 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        {conversation.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
      </button>
      <button
        onClick={() => onRemove(conversation.id)}
        aria-label={`Apagar ${conversation.title}`}
        className="shrink-0 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

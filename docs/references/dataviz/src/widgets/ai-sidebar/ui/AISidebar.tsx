'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { cn } from '@/shared/lib/utils';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { useAppStore } from '@/shared/stores/app-store';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { useActiveDataset } from '@/shared/hooks/useActiveClient';
import { applyToolResult, type ApplyDeps } from '@/features/report-authoring/apply-tool-result';
import { updateReport } from '@/shared/lib/firestore/reports';
import { Button } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  X, Sparkles, Send, Loader2, User, Wrench, Check,
  History as HistoryIcon, Plus,
  Search, BarChart3, FlaskConical, Download,
  TrendingUp, Lightbulb, Shield, DollarSign, Globe,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolStepIndicator } from './ToolStepIndicator';
import { InlineDataRenderer } from './InlineDataRenderer';
import { ClarificationOptions } from './ClarificationOptions';
import type { PreliminaryStatus, ClarificationRequest } from '@/shared/config/agents/types';
import { getIndicatorSuggestions } from '@/shared/config/indicator-suggestions';
import {
  GENERAL_CONVERSATION_KEY,
  indicatorConversationKey,
} from '@/shared/lib/chat/conversation-key';
import { useConversations } from '@/shared/hooks/useConversations';
import { readLastConversation, saveLastConversation } from '@/shared/lib/chat/last-conversation';
import { chatErrorMessage } from '@/shared/lib/chat/model-error';
import type { SerializedMessage } from '@/shared/lib/firestore/conversations';
import { pruneParts } from '@/shared/lib/firestore/conversation-pruning';
import { ConversationHistory } from './ConversationHistory';
import { SelectedBlocksChip } from './SelectedBlocksChip';

export interface AISidebarFocusedIndicator {
  name: string;
  value?: string;
  history?: string;
}

interface AISidebarProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  embedded?: boolean;
  /** Auto-send this prompt when opened */
  initialPrompt?: string;
  /** Indicator currently being viewed (modal or page focus) */
  focusedIndicator?: AISidebarFocusedIndicator;
  /** When true, use canvas-chat API and process canvas tool results */
  editMode?: boolean;
}

const TOOL_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  descriptive_agent: { label: 'Analisando dados', icon: BarChart3 },
  diagnostic_agent: { label: 'Diagnosticando causas', icon: Search },
  predictive_agent: { label: 'Projetando tendências', icon: TrendingUp },
  simulation_agent: { label: 'Rodando simulação', icon: FlaskConical },
  prescriptive_agent: { label: 'Gerando recomendações', icon: Lightbulb },
  monitoring_agent: { label: 'Verificando compliance', icon: Shield },
  cashflow_agent: { label: 'Analisando fluxo', icon: DollarSign },
  external_agent: { label: 'Buscando dados econômicos', icon: Globe },
  generate_pdf: { label: 'Gerando PDF', icon: Download },
  generate_csv: { label: 'Exportando CSV', icon: Download },
};

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
        em: ({ children }) => <em className="text-muted-foreground italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 ml-3 space-y-0.5 list-disc marker:text-muted-foreground/40">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-3 space-y-0.5 list-decimal marker:text-muted-foreground/60">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        h1: ({ children }) => <h1 className="text-sm font-bold text-foreground mb-1.5 mt-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-[13px] font-bold text-foreground/85 mb-1 mt-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[12px] font-semibold text-foreground mb-1 mt-1.5">{children}</h3>,
        code: ({ className, children }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <pre className="my-2 rounded-lg bg-muted/40 border border-border p-3 overflow-x-auto">
                <code className="text-[11px] font-mono text-primary/80 leading-relaxed">{children}</code>
              </pre>
            );
          }
          return <code className="rounded bg-muted/50 px-1 py-0.5 text-[11px] font-mono text-primary/80">{children}</code>;
        },
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[11px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/40 border-b border-border">{children}</thead>,
        th: ({ children }) => <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1.5 text-muted-foreground border-t border-border">{children}</td>,
        hr: () => <hr className="my-2 border-border" />,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-primary/30 pl-3 text-muted-foreground italic">{children}</blockquote>
        ),
        a: ({ href, children }) => {
          const isSafe = href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/'));
          if (!isSafe) return <span className="text-muted-foreground">{children}</span>;
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function MessageBubble({ message, onClarificationResponse }: { message: UIMessage; onClarificationResponse?: (value: string) => void }) {
  const isUser = message.role === 'user';

  // Detect if any tool part in this message has awaiting_input
  const hasAwaitingInput = !isUser && message.parts.some((part) => {
    if (!part.type.startsWith('tool-')) return false;
    const tp = part as { state?: string; output?: unknown };
    if (tp.state !== 'output-available' || tp.output == null) return false;
    const out = tp.output as Record<string, unknown>;
    return out.status === 'awaiting_input';
  });

  return (
    <div className={cn('flex gap-2.5 items-start', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Mesmo `mt` nos dois lados. O avatar da IA tinha `mt-[14px]` contra o
          `mt-1` do usuário, e o texto dela não tinha o `pt-[6px]` que o texto
          do usuário tem: o ícone descia uma linha inteira em relação à
          primeira linha da resposta. */}
      <div className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-1',
        isUser ? 'bg-muted/70' : 'bg-primary/10',
      )}>
        {isUser
          ? <User className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
          : <Sparkles className="h-3 w-3 text-primary" strokeWidth={1.5} />
        }
      </div>

      <div className={cn(
        'max-w-[90%] pt-[6px] text-[13px] leading-relaxed text-foreground',
        /*
         * O `pt-[6px]` acima foi medido para TEXTO: ele centra a primeira
         * linha de 13px na altura do avatar. Pílula de ferramenta é outra
         * caixa — margem 6 + borda 1 + padding 8 —, e herdando o mesmo recuo
         * ela nascia 12px abaixo do topo do avatar contra os 4px dele: o
         * avatar ficava pendurado acima do bloco.
         *
         * Quando a pílula É a primeira coisa da resposta, esta regra SUBSTITUI
         * a margem dela (`my-1.5`, +6px) por -2px: com o recuo de 6px do
         * container, o topo da pílula cai exatamente nos 4px do avatar.
         * Medido no navegador — antes: 8px abaixo; depois: 0.
         *
         * A regra é CSS, e não um booleano em JS, porque só o DOM sabe qual
         * ramo de renderização ganhou: nem toda parte `tool-*` vira pílula —
         * algumas viram texto ou tabela. As duas variantes cobrem a pílula
         * embrulhada e a solta.
         */
        '[&>[data-passo-ferramenta]:first-child]:-mt-0.5',
        '[&>:first-child>[data-passo-ferramenta]:first-child]:-mt-0.5',
      )}>
        {message.parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              if (isUser) {
                return <div key={`${message.id}-${i}`} className="whitespace-pre-wrap">{part.text}</div>;
              }
              return <MarkdownContent key={`${message.id}-${i}`} text={part.text} />;

            default:
              // Tool invocation parts have type "tool-{toolName}" (e.g. "tool-descriptive_agent")
              if (part.type.startsWith('tool-')) {
                const toolPart = part as {
                  type: string;
                  toolCallId?: string;
                  state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'output-denied';
                  output?: unknown;
                  preliminary?: boolean;
                };

                // Extract tool name from type (e.g. "tool-descriptive_agent" → "descriptive_agent")
                const toolName = toolPart.type.replace('tool-', '');

                // Output available — could be preliminary (yield) or final (return)
                if (toolPart.state === 'output-available' && toolPart.output != null) {
                  const output = toolPart.output as Record<string, unknown>;

                  // Preliminary result from async generator yield (has status field)
                  if (typeof output.status === 'string') {
                    const isDone = output.status === 'done';
                    const isAwaiting = output.status === 'awaiting_input';
                    const agentText = typeof output.message === 'string' ? output.message : '';

                    // Awaiting input — render clarification options
                    if (isAwaiting && output.clarification) {
                      return (
                        <div key={`${message.id}-${i}`}>
                          <ToolStepIndicator
                            status="awaiting_input"
                            agent={output.agent as string}
                            isActive={false}
                          />
                          <ClarificationOptions
                            clarification={output.clarification as ClarificationRequest}
                            onResponse={(value) => onClarificationResponse?.(value)}
                          />
                        </div>
                      );
                    }

                    // When another agent is done but there's a pending clarification,
                    // dim the done results
                    const shouldDim = hasAwaitingInput && isDone;

                    // When done with a text response, render as normal markdown message
                    if (isDone && agentText.length > 0) {
                      return (
                        <div key={`${message.id}-${i}`} className={cn(shouldDim && 'opacity-40')}>
                          <ToolStepIndicator
                            status={output.status as PreliminaryStatus}
                            agent={output.agent as string}
                            elapsedMs={output.elapsedMs as number}
                            rowCount={output.rowCount as number}
                            isActive={false}
                          />
                          {shouldDim ? (
                            <p className="text-[11px] text-muted-foreground/60 italic mt-1">Resultado disponível — aguardando resposta</p>
                          ) : (
                            <>
                              <MarkdownContent text={agentText} />
                              {output.data != null && (
                                <InlineDataRenderer data={output} />
                              )}
                            </>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={`${message.id}-${i}`} className={cn(shouldDim && 'opacity-40')}>
                        <ToolStepIndicator
                          status={output.status as PreliminaryStatus}
                          agent={output.agent as string}
                          message={output.message as string}
                          sql={output.sql as string}
                          rowCount={output.rowCount as number}
                          elapsedMs={output.elapsedMs as number}
                          isActive={toolPart.preliminary === true}
                        />
                        {!shouldDim && output.data != null && (
                          <InlineDataRenderer data={output} />
                        )}
                      </div>
                    );
                  }

                  // Final structured result (no status field) — render inline data
                  const rendered = <InlineDataRenderer key={`${message.id}-${i}`} data={output} />;
                  if (rendered !== null) return rendered;
                }

                // Error state
                if (toolPart.state === 'output-error') {
                  return (
                    <ToolStepIndicator
                      key={`${message.id}-${i}`}
                      status="error"
                      agent={toolName}
                      message={(toolPart as { errorText?: string }).errorText ?? 'Erro desconhecido'}
                      isActive={false}
                    />
                  );
                }

                // In-progress states (input-streaming, input-available) — show active indicator
                if (toolPart.state !== 'output-available') {
                  const config = TOOL_LABELS[toolName];
                  return (
                    <ToolStepIndicator
                      key={`${message.id}-${i}`}
                      status="analyzing"
                      agent={toolName}
                      message={config?.label ?? toolName.replace('_', ' ')}
                      isActive
                    />
                  );
                }

                // Fallback for output-available without renderable data
                const fallbackConfig = TOOL_LABELS[toolName] ?? {
                  label: toolName.replace('_', ' '),
                  icon: Wrench,
                };
                return (
                  <div
                    key={`${message.id}-${i}`}
                    className="my-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] border bg-emerald-500/5 border-emerald-500/15 text-emerald-400/70"
                  >
                    <Check className="h-3 w-3" strokeWidth={2} />
                    <span>{fallbackConfig.label} ✓</span>
                  </div>
                );
              }
              return null;
          }
        })}
      </div>
    </div>
  );
}

/**
 * Sugestões específicas por rota.
 *
 * Eram 10 entradas, uma por página fixa do Play — todas removidas na purga de
 * clientes. As páginas de hoje são reports dinâmicos (`/g/{grupo}/r/{report}`),
 * que uma chave estática não endereça. Sem match o componente cai em
 * GENERIC_SUGGESTIONS, que já era o comportamento nos reports antes disto.
 */
const SUGGESTIONS_BY_PAGE: Record<string, string[]> = {};

const GENERIC_SUGGESTIONS = [
  'Qual o resumo da carteira atual?',
  'Quais contratos têm maior risco?',
];

// getIndicatorSuggestions is now imported from '@/shared/config/indicator-suggestions'

/** Até onde a caixa de pergunta cresce antes de passar a rolar por dentro. */
const MAX_INPUT_LINES = 4;

/** Texto corrido de uma mensagem, juntando as partes de texto. */
function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p?.type === 'text')
    .map((p) => p.text)
    .join('');
}

function toUIMessage(m: SerializedMessage): UIMessage {
  return {
    id: m.id,
    role: m.role,
    // Conversas antigas guardavam só `content`; as novas guardam `parts`.
    parts: (m.parts?.length ? m.parts : [{ type: 'text', text: m.content }]) as UIMessage['parts'],
  } as UIMessage;
}

/**
 * Marca as tool-calls destas mensagens como já aplicadas, SEM aplicá-las.
 *
 * Usada na carga do histórico: as mensagens vêm do Firestore com as tool-parts
 * `output-available` originais, iguaizinhas às que acabaram de chegar pelo
 * stream. Sem marcá-las, o efeito de aplicação não tem como saber que aquele
 * `add_block` é de outro dia — e o reaplica no relatório aberto agora.
 */
function markToolCallsApplied(msgs: UIMessage[], applied: Set<string>): void {
  for (const msg of msgs) {
    for (const part of msg.parts ?? []) {
      const { toolCallId } = part as { toolCallId?: string };
      if (toolCallId) applied.add(toolCallId);
    }
  }
}

/**
 * A mensagem como ela vai para o Firestore.
 *
 * Os `parts` passam pela poda: o documento da conversa é reescrito INTEIRO a
 * cada ponto estável do turno, e guardar tool result ali fez a maior conversa
 * chegar a 252 KB — reescrita ~2x por pergunta, até o Firestore recusar com
 * `resource-exhausted` e a 25% do teto duro de 1 MiB por documento. Ver
 * `conversation-pruning.ts` para o critério.
 *
 * A poda é pura: `m.parts` continua inteiro em memória, que é de onde a tela
 * desenha a tabela e o gráfico do turno atual.
 */
function toSerialized(m: UIMessage): SerializedMessage {
  return {
    id: m.id,
    role: m.role as SerializedMessage['role'],
    content: messageText(m),
    parts: pruneParts((m.parts ?? []) as unknown[]),
  };
}

/**
 * Título da conversa. Indicador dá o nome dele; conversa livre usa a primeira
 * pergunta, que é como a pessoa vai reconhecê-la na lista depois.
 */
function conversationTitle(messages: UIMessage[], indicatorName?: string): string {
  if (indicatorName) return indicatorName;
  const first = messages.find((m) => m.role === 'user');
  const text = first ? messageText(first).trim() : '';
  if (!text) return 'Nova conversa';
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/**
 * Esqueleto de conversa, com a forma de um par pergunta/resposta: a pergunta
 * curta e alinhada à direita, a resposta em linhas à esquerda. Ancora no
 * rodapé junto com as mensagens reais, então quando o histórico chega o
 * conteúdo não salta de lugar.
 */
function ChatLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex justify-end">
        <Skeleton className="h-7 w-2/3 rounded-xl bg-muted/50" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-5/6 bg-muted/40" />
        <Skeleton className="h-3.5 w-full bg-muted/40" />
        <Skeleton className="h-3.5 w-3/5 bg-muted/40" />
      </div>
    </div>
  );
}

export function AISidebar({ open, onClose, className, embedded = false, initialPrompt, focusedIndicator, editMode = false }: AISidebarProps) {
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const processingQueueRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();

  let filterCtx: ReturnType<typeof useDataFilters> | null = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- hook opcional em try/catch (fail-soft fora do <Provider>)
  try { filterCtx = useDataFilters(); } catch { /* outside provider */ }

  const suggestions = useMemo(() => {
    const pageKey = Object.keys(SUGGESTIONS_BY_PAGE).find(key => pathname?.startsWith(key));
    const pageSuggestions = pageKey ? SUGGESTIONS_BY_PAGE[pageKey] : [];
    return [...new Set([...pageSuggestions, ...GENERIC_SUGGESTIONS])].slice(0, 4);
  }, [pathname]);

  const buildAIContext = useAppStore((s) => s.buildAIContext);
  const currentThreadId = useAppStore((s) => s.currentThreadId);
  const setCurrentThreadId = useAppStore((s) => s.setCurrentThreadId);
  const currentPersonaId = useAppStore((s) => s.currentPersonaId);
  const currentIcpId = useAppStore((s) => s.currentIcpId);
  const featureFlags = useAppStore((s) => s.featureFlags);
  // `clients/{id}` doc key (slug, ex.: `vila-rosa`) — distinto do `dataset`
  // (escopo BigQuery). Plumbado para o backend resolver o contexto semântico.
  const activeClientId = useAppStore((s) => s.activeClientId);
  const bumpReportsList = useAppStore((s) => s.bumpReportsList);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const bumpGroupsList = useAppStore((s) => s.bumpGroupsList);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const chatAgentId = useAppStore((s) => s.chatAgentId);
  const activeDataset = useActiveDataset();
  const router = useRouter();

  const apiEndpoint = editMode ? '/api/canvas-chat' : '/api/chat';

  const transport = useMemo(() => new DefaultChatTransport({
    api: apiEndpoint,
    headers: async (): Promise<Record<string, string>> => {
      try {
        const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
        const user = getFirebaseAuth().currentUser;
        if (user) {
          // Force refresh to avoid expired token issues
          const token = await user.getIdToken(true);
          return { Authorization: `Bearer ${token}` };
        }
      } catch (err) {
        console.error('[AISidebar] Failed to get auth token:', err);
      }
      return {};
    },
    // Custom fetch wrapper to capture x-thread-id response header (Sprint 1.A Task 14).
    // DefaultChatTransport accepts a fetch-compatible function in v6.
    fetch: async (url, init) => {
      const res = await fetch(url, init);
      try {
        const tid = res.headers.get('x-thread-id');
        if (tid && tid !== useAppStore.getState().currentThreadId) {
          setCurrentThreadId(tid);
        }
      } catch {
        // ignore header read errors
      }
      return res;
    },
  }), [apiEndpoint, setCurrentThreadId]);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    onError: (error) => {
      console.error('[AISidebar] Chat error:', error);
      // "Erro ao processar mensagem" dizia a coisa errada quando a falha era
      // cota do provedor: o pedido estava certo, e reenviar na hora gasta a
      // mesma cota que acabou. Ver `model-error.ts`.
      setChatError(chatErrorMessage(error));
    },
  });

  /**
   * Assunto desta conversa. Indicador em foco ⇒ conversa dele; caso contrário,
   * a conversa geral da barra lateral. Sai de graça do `focusedIndicator` que
   * o modal já passa — nenhuma tela precisa declarar chave à mão.
   */
  const conversationKey = focusedIndicator
    ? indicatorConversationKey(focusedIndicator.name)
    : GENERAL_CONVERSATION_KEY;

  /**
   * Carrega o que já foi conversado sobre este assunto.
   *
   * O modal remonta o componente a cada abertura e o `useChat` nasce vazio,
   * então sem isto a análise pedida ontem — ou há dois minutos — não existia
   * mais em lugar nenhum da tela.
   *
   * Só na abertura e só uma vez por assunto: recarregar no meio de uma
   * conversa apagaria o que está sendo escrito agora.
   */
  /**
   * Histórico do usuário vem da coleção `conversations` — a mesma que a tela
   * `/explore` já usava, com título, fixar e apagar. Os threads em
   * `workingMemory` continuam existindo do lado do servidor, mas como MEMÓRIA
   * DO AGENTE (o recall lê de lá), não como histórico de tela: duas fontes
   * para a mesma coisa seria dívida, uma fonte para cada propósito não é.
   */
  const {
    conversations,
    loading: isLoadingList,
    create: createConversation,
    save: saveConversation,
    load: loadConversation,
    remove: removeConversation,
    pin: pinConversation,
  } = useConversations();

  /*
   * Conversa de indicador é reencontrada pelo assunto; conversa livre é a que
   * o usuário escolheu na lista (ou a que a primeira pergunta criou).
   *
   * O valor inicial vem do localStorage porque este estado é a ÚNICA coisa que
   * se perdia num refresh: a conversa continuava gravada no Firestore, mas sem
   * saber qual era, a tela voltava vazia e o usuário concluía que tinha perdido
   * o que escreveu. Ver `last-conversation.ts`.
   */
  const [freeConversationId, setFreeConversationIdRaw] = useState<string | null>(
    () => readLastConversation(activeClientId),
  );

  /** Trocar de conversa é sempre também lembrar dela — daí o wrapper. */
  const setFreeConversationId = useCallback((id: string | null) => {
    setFreeConversationIdRaw(id);
    saveLastConversation(activeClientId, id);
  }, [activeClientId]);
  const [isListOpen, setIsListOpen] = useState(false);
  const activeConversationId = focusedIndicator
    ? conversations.find((c) => c.subject === conversationKey)?.id ?? null
    : freeConversationId;

  const loadedConversationRef = useRef<string | null>(null);
  /**
   * Marca posta só DEPOIS de as mensagens da conversa entrarem na tela — é ela
   * que autoriza gravar. A de cima é posta no INÍCIO da carga, e serve para
   * não buscar duas vezes; usá-la para autorizar gravação deixava um intervalo
   * em que a conversa nova já era a ativa mas a tela ainda mostrava a velha.
   */
  const appliedConversationRef = useRef<string | null>(null);
  const savedSignatureRef = useRef('');

  /**
   * Tool-calls que já não devem mexer no canvas — as aplicadas neste turno e as
   * que vieram do histórico. Declarada aqui, acima da carga de conversa, porque
   * é lá que a semeadura acontece.
   */
  const processedToolCalls = useRef(new Set<string>());

  // Lista e "Nova conversa" só fazem sentido no assistente geral.
  const showsHistory = !focusedIndicator && !editMode;

  /**
   * `pendente` até sabermos se existe conversa anterior. Um booleano de
   * "carregando" não bastava: entre o efeito terminar e as mensagens entrarem
   * no estado do chat existe um render em que nada carrega e nada existe — e
   * era nele que a pergunta inicial se pré-preenchia por cima de um histórico
   * que estava chegando.
   */
  const [history, setHistory] = useState<'pendente' | 'vazio' | 'carregado'>('pendente');
  const isFetchingHistory = history === 'pendente';

  const startNewConversation = useCallback(() => {
    setFreeConversationId(null);   // esquece também a guardada: começar do zero é uma escolha
    loadedConversationRef.current = null;
    appliedConversationRef.current = null;
    savedSignatureRef.current = '';
    setMessages([]);
    setHistory('vazio');
  }, [setMessages, setFreeConversationId]);
  /*
   * Trocar de cliente troca de conversa.
   *
   * A conversa é sobre a carteira de UM cliente; mantê-la na tela depois da
   * troca deixaria uma discussão sobre outros números sob o nome do cliente
   * novo. Retoma a última daquele cliente, ou começa limpo se não houver.
   *
   * A `ref` guarda o cliente da montagem para este efeito não disparar no
   * primeiro render — ali o estado inicial já veio do localStorage certo, e
   * chamar `startNewConversation` apagaria a retomada antes de ela acontecer.
   */
  const conversationClientRef = useRef(activeClientId);
  useEffect(() => {
    if (conversationClientRef.current === activeClientId) return;
    conversationClientRef.current = activeClientId;
    const stored = readLastConversation(activeClientId);
    if (!stored) {
      startNewConversation();
      return;
    }
    setFreeConversationIdRaw(stored);
    loadedConversationRef.current = null;
    appliedConversationRef.current = null;
    savedSignatureRef.current = '';
  }, [activeClientId, startNewConversation]);

  // Carrega as mensagens da conversa ativa. `loadedConversationRef` impede que
  // uma gravação recém-feita dispare recarga por cima do que está na tela.
  useEffect(() => {
    if (editMode || !activeClientId) {
      setHistory('vazio');
      return;
    }
    if (!open) return;
    if (isLoadingList) {
      setHistory('pendente');
      return;
    }
    if (!activeConversationId) {
      loadedConversationRef.current = null;
      appliedConversationRef.current = null;
      setHistory('vazio');
      return;
    }
    if (loadedConversationRef.current === activeConversationId) return;
    loadedConversationRef.current = activeConversationId;
    setHistory('pendente');

    loadConversation(activeConversationId)
      .then((conversation) => {
        const msgs = (conversation?.messages ?? []).map(toUIMessage);
        // ANTES do `setMessages`: mensagem lida do histórico nunca pode mutar o
        // canvas. Semear aqui é o que separa "resultado que acabou de chegar"
        // de "resultado gravado num turno anterior" — as duas chegam ao efeito
        // de aplicação com exatamente a mesma forma.
        markToolCallsApplied(msgs, processedToolCalls.current);
        // Sempre substitui, mesmo por lista vazia: abrir uma conversa sem
        // mensagens deixava as da conversa ANTERIOR na tela, como se fossem
        // dela.
        setMessages(msgs);
        appliedConversationRef.current = activeConversationId;
        setHistory(msgs.length ? 'carregado' : 'vazio');
      })
      .catch((err) => {
        // Histórico é conforto, não requisito: falhar aqui abre a conversa
        // limpa em vez de bloquear a pergunta nova.
        console.error('[AISidebar] falha ao carregar conversa:', err);
        setHistory('vazio');
      });
  }, [open, editMode, activeClientId, isLoadingList, activeConversationId, loadConversation, setMessages]);

  /**
   * Grava quando um turno termina, criando a conversa na primeira pergunta —
   * só então ela existe de fato e merece entrar na lista.
   *
   * A assinatura evita regravar o que acabou de ser carregado: sem ela, abrir
   * uma conversa antiga a reescreveria e a jogaria para o topo da lista como
   * se houvesse conversa nova.
   */
  useEffect(() => {
    if (editMode || !activeClientId) return;
    /*
     * Grava em todo ponto ESTÁVEL do turno, não só no fim feliz.
     *
     * Era `status !== 'ready'`, e o preço aparecia quando o turno não terminava
     * bem: stream cortado (servidor reiniciado, rede, quota) deixava `status`
     * em `error`, o efeito desistia, e sumia a pergunta do usuário JUNTO com a
     * resposta parcial. Pior: as tools daquele turno já tinham mudado o app —
     * o filtro estava na página, o bloco estava no relatório — e o registro do
     * pedido não existia em lugar nenhum. Fechar e reabrir o chat mostrava a
     * conversa como se nada tivesse acontecido.
     *
     * `submitted` grava a pergunta assim que ela entra; `ready`/`error` gravam
     * o que o turno produziu. A assinatura abaixo evita a escrita repetida.
     */
    const isTurnStable = status === 'submitted' || status === 'ready' || status === 'error';
    if (!isTurnStable || messages.length === 0) return;
    /*
     * As mensagens na tela pertencem à conversa ativa?
     *
     * Ao trocar de conversa, `activeConversationId` muda ANTES de a carga terminar
     * — e neste intervalo `messages` ainda é da conversa anterior. Sem esta
     * guarda, este efeito gravava o conteúdo da conversa velha por cima da que
     * o usuário acabou de abrir. Não era só "não carrega": destruía a conversa
     * de destino.
     */
    if (activeConversationId && appliedConversationRef.current !== activeConversationId) return;
    const signature = `${activeConversationId ?? 'nova'}|${messages.length}|${messages[messages.length - 1]?.id ?? ''}`;
    if (savedSignatureRef.current === signature) return;
    savedSignatureRef.current = signature;

    (async () => {
      try {
        let id = activeConversationId;
        if (!id) {
          id = await createConversation(
            conversationTitle(messages, focusedIndicator?.name),
            focusedIndicator ? conversationKey : null,
          );
          if (!id) return;
          loadedConversationRef.current = id;
          appliedConversationRef.current = id;
          if (!focusedIndicator) setFreeConversationId(id);
        }
        await saveConversation(id, { messages: messages.map(toSerialized) });
      } catch (err) {
        console.error('[AISidebar] falha ao gravar conversa:', err);
      }
    })();
  }, [messages, status, editMode, activeClientId, activeConversationId, conversationKey, focusedIndicator, createConversation, saveConversation, setFreeConversationId]);

  const isStreaming = status === 'streaming';
  const isSubmitted = status === 'submitted';
  const isLoading = isStreaming || isSubmitted;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages]);

  /**
   * A caixa de pergunta nasce com uma linha e cresce conforme o texto quebra,
   * até o teto de `MAX_INPUT_LINES`; dali em diante ela para de crescer e o
   * conteúdo rola por dentro.
   *
   * O teto sai da altura de linha computada, não de um pixel fixo (era `120`,
   * que dava umas seis linhas e mudava de significado a cada ajuste de fonte).
   */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_INPUT_LINES;
    const exceedsMax = ta.scrollHeight > maxHeight;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    // Sem isto o textarea mostra barra de rolagem antes de haver o que rolar.
    ta.style.overflowY = exceedsMax ? 'auto' : 'hidden';
  }, [input]);

  // Filtros lidos para fora do `useCallback`: `filterCtx` é `let` (atribuído
  // dentro de um try), e o compilador não acompanha membro de variável
  // reatribuída — com os campos em constantes, a lista abaixo é a real.
  const filterDateRange = filterCtx?.dateRange;
  const filterCompareEnabled = filterCtx?.compareEnabled;
  const filterComparePeriod = filterCtx?.comparePeriod;
  const filterViewMode = filterCtx?.viewMode;
  const buildBody = useCallback(() => {
    const base = {
      dataset: activeDataset,
      clientId: activeClientId || undefined,
      filters: {
        dateRange: filterDateRange ?? { start: '', end: '' },
        compareEnabled: filterCompareEnabled ?? false,
        comparePeriod: filterComparePeriod,
        viewMode: filterViewMode ?? 'snapshot',
      },
      dashboardState: buildAIContext(),
      page: pathname ?? '/dashboard',
      focusedIndicator: focusedIndicator ?? undefined,
      // `/api/chat` deriva o thread do assunto + usuário autenticado e ignora
      // qualquer id vindo daqui. `/api/canvas-chat` (editMode) ainda usa o id
      // do store — outro caminho, outro ciclo de vida.
      conversationKey,
      threadId: editMode ? currentThreadId ?? undefined : undefined,
      personaId: currentPersonaId ?? undefined,
      icpId: currentIcpId ?? undefined,
      // Quem atende a conversa. Vem do store (seletor no header do painel),
      // então o modal de indicador herda a mesma escolha sem ter seletor
      // próprio. `orchestrator` = supervisor, o comportamento de sempre.
      agentId: chatAgentId,
      // Onde a autoria cria página quando o pedido não nomeia outro relatório.
      // Sem isto o servidor caía no primeiro relatório do cliente — quem estava
      // em "Covenants" recebia a página dentro de outro qualquer.
      activeGroupId: useAppStore.getState().activeGroupId || undefined,
      useImprovedSupervisor: featureFlags.useImprovedSupervisor,
      useVertexPromptCache: featureFlags.useVertexPromptCache,
      // Vão SEMPRE, não só em editMode: o supervisor de `/api/chat` agora
      // constrói páginas, e sem o inventário ele editaria às cegas. Fora da
      // edição a lista é vazia — custo nenhum, e a capacidade deixa de
      // depender da tela em que a pessoa está.
      pagesContext: useCanvasStore.getState().getPagesContext(),
      selectedBlockIds: useCanvasStore.getState().selectedBlockIds,
    };

    return base;
  // `dateRange` e `comparePeriod` entram como objeto: o DataProvider os guarda
  // em `useState`, então a identidade só muda quando o período muda. Faltava
  // `comparePeriod` aqui, e trocar o período com a comparação ligada mandava o
  // anterior ao assistente. `buildAIContext` é função estável do store e lê os
  // indicators na hora da chamada — por isso eles não entram na lista (o que
  // re-renderizaria em loop: useRegisterIndicators os atualiza a cada render).
  }, [activeDataset, activeClientId, filterDateRange, filterCompareEnabled, filterComparePeriod, filterViewMode, buildAIContext, pathname, focusedIndicator, editMode, conversationKey, currentThreadId, currentPersonaId, currentIcpId, chatAgentId, featureFlags.useImprovedSupervisor, featureFlags.useVertexPromptCache]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDataset || !input.trim()) return;
    setChatError(null);
    if (isLoading) {
      // Queue the message instead of blocking
      setMessageQueue((q) => [...q, input.trim()]);
      setInput('');
      return;
    }
    sendMessage({ text: input }, { body: buildBody() });
    setInput('');
  };

  // Process queued messages when ready
  useEffect(() => {
    if (status !== 'ready') {
      processingQueueRef.current = false;
      return;
    }
    if (messageQueue.length > 0 && !processingQueueRef.current) {
      processingQueueRef.current = true;
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      sendMessage({ text: next }, { body: buildBody() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messageQueue.length]);

  const handleClarificationResponse = useCallback((value: string) => {
    if (!activeDataset) return;
    setChatError(null);
    if (isLoading) {
      setMessageQueue((q) => [...q, value]);
    } else {
      sendMessage({ text: value }, { body: buildBody() });
    }
  }, [activeDataset, isLoading, sendMessage, buildBody]);

  const handleSuggestion = (text: string) => {
    if (!activeDataset) return;
    setChatError(null);
    sendMessage({ text }, { body: buildBody() });
  };

  // Pre-fill input with initialPrompt
  const hasPrefilledRef = useRef(false);
  useEffect(() => {
    if (!initialPrompt || hasPrefilledRef.current || !open) return;
    // Só quando se sabe que NÃO há conversa anterior. Com histórico na tela,
    // propor de novo a mesma análise inicial é ruído: quem volta ao indicador
    // quer continuar dali, não repetir a primeira pergunta.
    if (history !== 'vazio') return;
    hasPrefilledRef.current = true;
    setInput(initialPrompt);
  }, [initialPrompt, open, history]);

  // Auto-fill report blocks when event is received
  useEffect(() => {
    const handler = (e: CustomEvent<{ prompt: string }>) => {
      if (!activeDataset || !open || !embedded) return;
      // Small delay to ensure chat is ready
      setTimeout(() => {
        const prompt = e.detail?.prompt;
        if (prompt) {
          setChatError(null);
          sendMessage({ text: prompt }, { body: buildBody() });
        }
      }, 1000);
    };
    window.addEventListener('auto-fill-report', handler as EventListener);
    return () => window.removeEventListener('auto-fill-report', handler as EventListener);
  }, [activeDataset, open, embedded, sendMessage, buildBody]);

  /**
   * Página criada no Firestore pela IA. Ela entra no canvas como página ATIVA,
   * para que os blocos que a IA adiciona logo em seguida caiam nela — a página
   * que estava aberta segue intacta no índice anterior. Gravar e navegar fica
   * para o fim do turno, quando não há mais bloco chegando.
   */
  const newPageRef = useRef<
    { groupId: string; reportId: string; name: string; pageId: string } | null
  >(null);
  /**
   * Relatório criado no Firestore pela IA. Não tem conteúdo de canvas — é o
   * container das páginas — então aqui só se guarda o destino; atualizar o
   * seletor e navegar fica para o fim do turno, junto com a página.
   *
   * Guardado em ref pelo mesmo motivo da página: se a IA criar o relatório e
   * uma página dentro dele no mesmo turno, quem manda no destino é a PÁGINA.
   * Navegar aqui, no meio do stream, abriria o relatório vazio e remontaria a
   * tela antes de a página ser gravada.
   */
  const newReportRef = useRef<{ groupId: string; name: string } | null>(null);
  const onReportCreated = useCallback((info: { groupId: string; name: string }) => {
    newReportRef.current = info;
  }, []);

  const onReportPageCreated = useCallback((info: { groupId: string; reportId: string; name: string }) => {
    const index = useCanvasStore.getState().createPage(info.name);
    // Guarda a IDENTIDADE da página, não a posição dela. `createPage` devolve o
    // índice, mas índice deixa de valer assim que o store muda — e é o que
    // fazia o conteúdo do relatório atual ser gravado no documento da página
    // nova. Mesma ideia de `reportPage` (`src/pages/report/ui/report-canvas.ts`).
    const pageId = useCanvasStore.getState().pages[index]?.id ?? '';
    newPageRef.current = { ...info, pageId };
  }, []);

  /**
   * Filtro de página mudou no banco — a página aberta precisa reler o documento.
   *
   * Evento de janela, como o `new-page-request` da barra lateral: quem sabe
   * recarregar é a `ReportPage`, e ela não é ancestral nem descendente desta
   * barra.
   */
  const onPageFilterChanged = useCallback((info: { groupId: string; reportId: string }) => {
    window.dispatchEvent(new CustomEvent('report-filters-changed', { detail: info }));
  }, []);

  // Aplica no canvas o que as tools de autoria devolveram. Roda SEMPRE, não só
  // em `editMode`: o supervisor de `/api/chat` também constrói páginas agora.
  useEffect(() => {
    const deps: ApplyDeps = {
      getState: () => useCanvasStore.getState(),
      // O relatório tem uma página só (índice 0); durante a criação de uma
      // página nova, a ativa é ela.
      resolvePageIndex: () => useCanvasStore.getState().activePage,
      onReportCreated,
      onReportPageCreated,
      onPageFilterChanged,
      onMetricCatalogChanged: () => useAppStore.getState().bumpMetricsCatalog(),
    };

    for (const msg of messages) {
      if (msg.role === 'user') continue;
      for (const part of msg.parts) {
        if (!part.type.startsWith('tool-')) continue;
        const toolPart = part as {
          type: string;
          toolCallId?: string;
          state?: string;
          output?: unknown;
        };
        if (toolPart.state !== 'output-available' || !toolPart.toolCallId) continue;
        const toolName = toolPart.type.replace('tool-', '');
        const result = toolPart.output as Record<string, unknown> | null;
        if (!result) continue;

        // Uma invocação, uma aplicação — o efeito reprocessa a lista inteira a
        // cada chunk do stream.
        if (processedToolCalls.current.has(toolPart.toolCallId)) continue;
        processedToolCalls.current.add(toolPart.toolCallId);

        applyToolResult({ toolName, result }, deps);
      }
    }
  }, [messages, onReportCreated, onReportPageCreated, onPageFilterChanged]);

  /**
   * Fim do turno: grava a página que a IA acabou de montar e navega até ela.
   *
   * Gravar no meio do streaming pegaria a página pela metade, e navegar antes
   * de gravar remontaria o relatório a partir do documento vazio — os blocos
   * do canvas iriam embora sem nunca terem sido persistidos.
   */
  useEffect(() => {
    if (status !== 'ready') return;

    /*
     * Relatório criado neste turno. O seletor precisa saber dele em qualquer
     * caso; navegar até ele, só quando o turno NÃO produziu página — "crie o
     * relatório X e monte a página Y nele" termina na página, e abrir o
     * relatório vazio depois deixaria a tela em branco justamente no turno que
     * produziu conteúdo.
     */
    const newReport = newReportRef.current;
    if (newReport) {
      newReportRef.current = null;
      bumpGroupsList();
      if (!newPageRef.current) {
        setActiveGroup(newReport.groupId);
        router.push(`/g/${newReport.groupId}`);
      }
    }

    const destino = newPageRef.current;
    if (!destino || !activeClientId) return;
    newPageRef.current = null;

    (async () => {
      try {
        // Pela identidade, não por `pages[activePage]`: um `loadPages` disparado
        // durante o stream substitui o store, e aí aquela POSIÇÃO é outra
        // página — gravar por índice escreveria o conteúdo do relatório atual
        // dentro do documento da página nova. Não achar é motivo para NÃO
        // gravar: página vazia se recupera, relatório sobrescrito não.
        const page = useCanvasStore.getState().pages.find((p) => p.id === destino.pageId);
        if (!page) {
          throw new Error(`página ${destino.pageId} saiu do canvas antes de ser gravada`);
        }
        await updateReport(activeClientId, destino.groupId, destino.reportId, page.blockMap, page.layout);
        bumpReportsList();
        setActiveReport(destino.groupId, destino.reportId);
        router.push(`/g/${destino.groupId}/r/${destino.reportId}`);
      } catch (err) {
        console.error('[AISidebar] falha ao gravar a página criada pela IA:', err);
        // A página existe no Firestore, só ficou vazia — e antes isso acontecia
        // em silêncio: o usuário via a construção terminar e nada aparecer.
        // Atualiza a lista mesmo assim, para ela ao menos existir na navegação.
        bumpReportsList();
        setChatError(
          `A página "${destino.name}" foi criada, mas o conteúdo não pôde ser salvo. `
          + 'Abra a página e peça para montar de novo.',
        );
      }
    })();
  }, [status, activeClientId, bumpReportsList, setActiveReport, bumpGroupsList, setActiveGroup, router]);

  // Clear pre-filled input when a suggestion is sent
  const handleSuggestionWithClear = (text: string) => {
    setInput('');
    handleSuggestion(text);
  };

  return (
    <aside
      className={cn(
        'flex flex-col min-h-0',
        embedded
          ? 'flex-1 w-full'
          : [
              'h-full border-l border-border bg-muted/40 backdrop-blur-3xl shadow-[-4px_0_24px_rgba(0,0,0,0.2)]',
              'transition-[width,opacity] duration-300 ease-out',
              open ? 'w-[460px] opacity-100' : 'w-0 opacity-0 overflow-hidden',
            ],
        className,
      )}
    >
      {/* Header — only when standalone */}
      {!embedded && (
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Assistente AI
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar assistente"
            className="h-8 w-8 text-muted-foreground/80 hover:text-foreground hover:bg-muted/50"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      )}

      {/* Barra de conversas — só no assistente geral. No modal de indicador a
          conversa é a daquele card, então não há o que listar nem criar. */}
      {showsHistory && (
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
          <button
            onClick={() => setIsListOpen((v) => !v)}
            aria-expanded={isListOpen}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              isListOpen
                ? 'bg-muted/60 text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <HistoryIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
            Conversas
            {conversations.length > 0 && (
              <span className="text-muted-foreground/50">({conversations.length})</span>
            )}
          </button>
          {!isListOpen && messages.length > 0 && (
            <button
              onClick={startNewConversation}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Nova
            </button>
          )}
        </div>
      )}

      {showsHistory && isListOpen ? (
        <ConversationHistory
          conversations={conversations}
          loading={isLoadingList}
          activeId={activeConversationId}
          onOpen={(id) => {
            setFreeConversationId(id);
            setIsListOpen(false);
          }}
          onNew={() => {
            startNewConversation();
            setIsListOpen(false);
          }}
          onPin={pinConversation}
          onRemove={async (id) => {
            await removeConversation(id);
            if (id === freeConversationId) startNewConversation();
          }}
        />
      ) : (
      <>
      {/* Conversation area */}
      {/*
        As três variantes miram o wrapper interno do Radix, que `globals.css`
        força a `display: block` (regra que existe para impedir scroll
        horizontal da página). Bloco com altura de conteúdo não dá à lista
        espaço para ancorar no rodapé: medido, ela ficava em 158px dentro de um
        viewport de 567px, colada no topo, com 400px mortos até o campo de
        digitação. Virando coluna flex que estica, o `justify-end` da lista
        volta a funcionar — e `min-h` (não `h`) deixa o wrapper crescer quando a
        conversa passa da altura da tela.
      */}
      <ScrollArea
        className={cn(
          'flex-1 min-h-0',
          '[&_[data-radix-scroll-area-viewport]>div]:!flex',
          '[&_[data-radix-scroll-area-viewport]>div]:!flex-col',
          '[&_[data-radix-scroll-area-viewport]>div]:!min-h-full',
        )}
        ref={scrollRef}
      >
        <div className={cn(
          'flex flex-1 flex-col gap-4 p-4',
          messages.length === 0 && !isFetchingHistory ? 'justify-center' : 'justify-end',
        )}>
          {isFetchingHistory && messages.length === 0 ? (
            /*
             * Enquanto não se sabe se existe conversa anterior, esqueleto.
             *
             * O "Como posso ajudar?" com sugestões é uma AFIRMAÇÃO: diz que a
             * conversa está vazia e convida a começar. Mostrá-lo antes da
             * resposta do histórico fazia a tela abrir afirmando isso e trocar
             * para a conversa logo depois. Esqueleto não afirma nada.
             */
            <ChatLoading />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Como posso ajudar?
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/80 leading-relaxed">
                  Pergunte sobre indicadores, contratos ou qualquer dado do dashboard.
                </p>
              </div>

              {/* Suggestions */}
              <div className="flex flex-col gap-1.5 w-full pt-2">
                {initialPrompt ? (
                  getIndicatorSuggestions(initialPrompt).map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleSuggestionWithClear(s.fullPrompt)}
                      disabled={!activeDataset}
                      className="w-full text-left rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-foreground"
                    >
                      {s.label}
                    </button>
                  ))
                ) : (
                  suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestionWithClear(s)}
                      disabled={!activeDataset}
                      className="w-full text-left rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onClarificationResponse={handleClarificationResponse} />
              ))}
              {isSubmitted && !chatError && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Pensando...</span>
                </div>
              )}
              {/* Queued messages */}
              {messageQueue.map((qMsg, idx) => (
                <div key={`queue-${idx}`} className="flex gap-2.5 items-start flex-row-reverse">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/70 mt-1">
                    <User className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="max-w-[90%] text-[13px] leading-relaxed text-muted-foreground/80 pt-[6px]">
                    <div className="whitespace-pre-wrap">{qMsg}</div>
                    <span className="text-[10px] text-muted-foreground/40 italic">Na fila...</span>
                  </div>
                </div>
              ))}
              {chatError && (
                <div className="flex items-center gap-2 text-[11px] text-[#F27C7C]">
                  <span>{chatError}</span>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Input area — pinned to bottom */}
      <div className="shrink-0 border-t border-border p-3">
        {/* O escopo vem antes do campo: é a condição da mensagem que se vai
            escrever, não um resumo do que já foi escrito. */}
        <SelectedBlocksChip />
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 pl-3 pr-[7px] py-[7px] transition-colors focus-within:border-border focus-within:bg-muted/50">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={activeDataset ? (isLoading ? 'Envie — será adicionado à fila...' : 'Pergunte algo...') : 'Selecione um cliente para usar o chat'}
              rows={1}
              className="flex-1 resize-none bg-transparent m-0 p-0 block text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none leading-[1.5]"
              disabled={!activeDataset}
            />
            <button
              type="submit"
              disabled={!activeDataset || !input.trim()}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                input.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                  : 'text-muted-foreground/40'
              )}
              aria-label="Enviar mensagem"
            >
              {isLoading && !input.trim() ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </form>
      </div>
      </>
      )}
    </aside>
  );
}

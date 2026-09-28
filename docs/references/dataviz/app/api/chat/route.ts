/**
 * /api/chat — runtime delegado ao Mastra Agent (ADR-0014).
 *
 * Após ADR-0014, esta rota não invoca mais o orchestrator analítico
 * (`src/features/ai-agents/orchestrator.ts`) baseado em `streamText`.
 * Em vez disso, constrói uma instância Mastra por requisição e delega
 * a execução para o `Agent` descritivo. A resposta é convertida no
 * formato `UIMessageStream` consumido pelo front via `createUIMessageStream`
 * + `createUIMessageStreamResponse` do `ai` v6 e os helpers de conversão
 * de chunks expostos por `@mastra/core/stream`.
 *
 * Os demais sub-agents (diagnostic, predictive, etc.) ainda não estão
 * migrados — temporariamente o /api/chat opera como agente único
 * descritivo. Reintrodução de supervisão multi-agente fica para ADR
 * subsequente.
 */
import { NextResponse } from 'next/server';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import type { ChunkType } from '@mastra/core/stream';
import { toUiChunk } from './to-ui-chunk';
import { createPhaseTimer } from './phase-timer';
import type { Agent } from '@mastra/core/agent';
import type {
  AgentDynamicContext,
  CanvasPageContext,
  ChatRequestFilters,
  FocusedIndicator,
} from '@/shared/config/agents/types';
import { buildMastraInstance } from '@/features/ai-agents/mastra/instance';
import { verifyAuthToken, verifyDatasetAccess } from '@/shared/lib/api-auth';
import { checkRateLimit, rateLimitResponse } from '@/shared/lib/rate-limit';
import { createThread, appendMessage } from '@/shared/lib/memory/memory-service';
import { deriveThreadId, GENERAL_CONVERSATION_KEY } from './thread-id';
import { getClientSemanticContext } from '@/shared/repositories/client-semantic-context';
import { compactMessages } from '@/features/ai-agents/lib/compact-messages';
import { classifyModelError } from '@/shared/lib/chat/model-error';
import { warmKnownProjectIds } from '@/shared/lib/bigquery/warm-known-project-ids';

// Mastra Agent + memory-service são Node-only — proibido edge runtime.
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Teto de passos do turno (um passo = uma ida ao modelo).
 *
 * `agent.stream()` sem `maxSteps` nem `stopWhen` cai no default do Mastra,
 * `stepCountIs(5)`. Cinco não cobre autoria: montar uma página é
 * `create_report_page` + um `add_*_block` por bloco + a resposta final — 10 a 12
 * passos num pedido comum ("uma página com os principais indicadores"), antes de
 * qualquer delegação analítica. Ao estourar, o loop apenas parava: sem erro, sem
 * aviso, sem texto final. O usuário via a construção morrer no meio.
 *
 * 24 é ~2x o pior caso realista: cabe a construção completa, mais 2-3 delegações
 * a sub-agente no mesmo turno e algumas correções (a tool recusa alvo de tipo
 * errado e o modelo tenta de novo). É a mesma ordem de grandeza dos defaults do
 * ecossistema — `ToolLoopAgent` do Mastra e `Agent` do AI SDK usam 20 — e segue
 * sendo um teto duro, folgado dentro do `maxDuration` de 300s.
 *
 * O teto é escolha de custo, não de capacidade: quando ele corta um turno o
 * `finally` emite `chat_step_limit_reached`. Aviso repetido em produção é sinal
 * de que o número — ou o prompt que gasta os passos — precisa ser revisto.
 */
const MAX_TURN_STEPS = 24;

interface ChatBody {
  messages: UIMessage[];
  dataset: string;
  filters: ChatRequestFilters;
  dashboardState?: string;
  page: string;
  focusedIndicator?: FocusedIndicator;
  /**
   * Assunto da conversa: `general` (barra lateral) ou `indicator:<rótulo>`.
   * Substituiu o `threadId` que o cliente mandava — ver `thread-id.ts`.
   */
  conversationKey?: string;
  clientId?: string;
  /** Blocos da página aberta e seleção do usuário — habilitam a autoria. */
  pagesContext?: CanvasPageContext[];
  selectedBlockIds?: string[];
  personaId?: string;
  icpId?: string | null;
  /** Especialista escolhido no seletor do chat; ausente = supervisor. */
  agentId?: string;
  /** Relatório (`group`) aberto — destino padrão da autoria. */
  activeGroupId?: string;
  /** Mantidos no schema por compat — atualmente sem efeito após ADR-0014. */
  useImprovedSupervisor?: boolean;
  useVertexPromptCache?: boolean;
}

export async function POST(req: Request) {
  // Cronômetro do primeiro instante: sem medir cada elo, "o chat demora 20s"
  // não tem endereço. Ver `phase-timer.ts`.
  const timer = createPhaseTimer();
  const email = await timer.time('auth', () => verifyAuthToken(req));
  if (!email) {
    return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401 });
  }

  // Depois do auth, para a chave ser o usuário e não o IP — um limite por IP
  // puniria escritório inteiro atrás do mesmo NAT.
  const limit = checkRateLimit(`chat:${email}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return rateLimitResponse(limit, 'Muitas perguntas seguidas. Aguarde alguns segundos.');
  }

  // Ids de projeto dos dataSources para a redação de erro das tools
  // (`formatToolError`). Corre em paralelo com o resto da preparação e é
  // esperado antes do stream: com o cache frio, o primeiro erro de tool saía
  // antes de o id de um dataSource ser conhecido. Nunca rejeita; com cache
  // quente resolve na hora; e a espera tem teto, para um Firestore lento não
  // prender o chat (a redação por posição continua valendo sem os ids).
  const knownProjectIdsWarmUp = warmKnownProjectIds();

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
  }

  if (!body.dataset || !body.messages) {
    return new Response(
      JSON.stringify({ error: 'Campos obrigatórios: dataset, messages' }),
      { status: 400 },
    );
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !body.filters ||
    !body.filters.dateRange ||
    !dateRegex.test(body.filters.dateRange.start) ||
    !dateRegex.test(body.filters.dateRange.end)
  ) {
    return new Response(
      JSON.stringify({ error: 'filters.dateRange com start e end (YYYY-MM-DD) é obrigatório' }),
      { status: 400 },
    );
  }

  // Isolamento multi-tenant (ADR-0006): verifica acesso ao dataset que a IA
  // executará via `execute_sql`. Passa `body.clientId` (formato-novo,
  // productBindings-only) para impedir que um usuário autorizado no tenant A
  // injete `clientId`/`dataset` do tenant B no prompt/recall. Sem `clientId`
  // ⇒ undefined ⇒ ramo legado (back-compat). Deve negar ANTES de
  // `getClientSemanticContext` e de o agente rodar.
  const access = await timer.time('datasetAccess', () =>
    verifyDatasetAccess(email, body.dataset, body.clientId),
  );
  if (!access.allowed) {
    return NextResponse.json({ error: access.error ?? 'Sem permissão' }, { status: access.status ?? 403 });
  }

  // Id derivado do usuário + cliente + assunto: determinístico (reabrir o mesmo
  // indicador cai no mesmo thread) e não-forjável (ver `thread-id.ts`).
  const conversationKey = body.conversationKey || GENERAL_CONVERSATION_KEY;
  const threadId = deriveThreadId({
    email,
    clientId: body.clientId ?? body.dataset,
    conversationKey,
  });
  // `merge: true` no createThread — chamar de novo no mesmo id é no-op de dados.
  await timer.time('createThread', () =>
    createThread({
      resourceId: `${body.dataset}:${email}`,
      clientId: body.dataset,
      threadId,
      metadata: { conversationKey },
    }),
  );

  // Grava a pergunta ANTES de rodar o agente: se a geração falhar no meio, a
  // pergunta continua registrada e o histórico não fica com buraco.
  const lastUserMessage = body.messages.at(-1);
  if (lastUserMessage?.role === 'user') {
    await timer.time('gravaPergunta', () =>
      appendMessage(threadId, { role: 'user', parts: lastUserMessage.parts }),
    );
  }

  // Resolve o contexto semântico do cliente (frente C) a partir do `clientId`
  // REAL (`clients/{id}`), nunca do fallback `?? dataset` — o resolver precisa
  // do doc Firestore correto. Ausente ⇒ pula a resolução. O resolver nunca
  // lança; null degrada para o comportamento atual (prompt sem as seções).
  const semanticContext = body.clientId
    ? (await timer.time('semanticContext', () => getClientSemanticContext(body.clientId!))) ??
      undefined
    : undefined;

  // Build per-request Mastra instance — tools close over the dynamic ctx.
  const sessionId = crypto.randomUUID().substring(0, 8);
  /*
   * Onde a autoria escreve quando o pedido não diz.
   *
   * O cliente manda `activeGroupId`; a rota do relatório
   * (`/g/:groupId/r/:reportId`) serve de reserva para o caso de o campo não vir
   * — cliente antigo, ou chamada direta à API. Sem nenhum dos dois, a tool cai
   * no primeiro relatório do cliente, que é a origem do bug de criar página no
   * relatório errado.
   */
  const routeGroup = /^\/g\/([^/]+)/.exec(body.page ?? '')?.[1];
  // A página aberta sai da mesma rota: `/g/{groupId}/r/{reportId}`.
  const routeReport = /^\/g\/[^/]+\/r\/([^/]+)/.exec(body.page ?? '')?.[1];

  const ctx: AgentDynamicContext = {
    dataset: body.dataset,
    activeGroupId: body.activeGroupId || routeGroup,
    activeReportId: routeReport,
    filters: body.filters,
    dashboardState: body.dashboardState ?? '',
    page: body.page,
    sessionId,
    focusedIndicator: body.focusedIndicator,
    clientId: body.clientId ?? body.dataset,
    personaId: body.personaId,
    semanticContext,
    // Do token já verificado, nunca do corpo (ADR-0006).
    userEmail: email,
  };

  const mastra = await timer.time('buildMastra', () => buildMastraInstance({ ctx }));
  const { resolveChatAgent } = await import('./resolve-chat-agent');
  const agent = (await timer.time('resolveChatAgent', () =>
    resolveChatAgent({
      mastra,
      ctx,
      messages: body.messages,
      pagesContext: body.pagesContext,
      selectedBlockIds: body.selectedBlockIds,
      agentId: body.agentId,
    }),
  )) as Agent;

  // Mastra Agent aceita UIMessage[] convertido via convertToModelMessages.
  // `compactMessages` entra ANTES da conversão: o /api/chat mandava o histórico
  // cru, sem poda, então conversa longa — ou poucas mensagens carregando
  // resultado de execute_sql — crescia o payload sem teto. O canvas já usava
  // (canvas-orchestrator/orchestrator.ts); aqui tinha ficado de fora quando o
  // runtime AI SDK v6 saiu.
  const modelMessages = await convertToModelMessages(compactMessages(body.messages));
  await Promise.race([knownProjectIdsWarmUp, new Promise((resolve) => { setTimeout(resolve, 2_000); })]);
  const stream = await timer.time('abreStream', () =>
    agent.stream(modelMessages, {
      runId: sessionId,
      maxSteps: MAX_TURN_STEPS,
    }),
  );

  /**
   * O que o turno gastou do teto. Objeto (e não dois `let`) porque quem escreve
   * é o `recordChunk` e quem lê é o `finally` — estado compartilhado explícito.
   */
  const turn = { passos: 0, motivoFinal: '' };

  /**
   * Contabiliza no cronômetro os chunks que representam trabalho: cada
   * `tool-call` do supervisor é uma delegação a sub-agente (eles são expostos
   * como tool — ADR-0019), e o `tool-result` correspondente a fecha. De passagem
   * conta os passos, que é como se sabe depois se o teto cortou o turno.
   */
  function recordChunk(chunk: ChunkType): void {
    const c = chunk as {
      type?: string;
      payload?: { toolName?: string; stepResult?: { reason?: string } };
    };
    if (c.type === 'step-finish') turn.passos++;
    else if (c.type === 'finish') turn.motivoFinal = c.payload?.stepResult?.reason ?? '';

    const toolName = c.payload?.toolName;
    if (!toolName) return;
    if (c.type === 'tool-call') timer.delegationStart(toolName);
    else if (c.type === 'tool-result' || c.type === 'tool-error') timer.delegationEnd(toolName);
  }

  const uiMessageStream = createUIMessageStream({
    originalMessages: body.messages,
    /*
     * O que o usuário lê quando o provedor falha.
     *
     * O default do AI SDK repassa o texto do provedor, e era assim que
     * "Resource exhausted. Please refer to https://cloud.google.com/..."
     * chegava à tela do analista. Aqui é o último ponto onde o erro ainda tem
     * `statusCode`; depois do stream sobra string.
     */
    onError: (error) => {
      const classified = classifyModelError(error);
      console.error(JSON.stringify({
        level: 'error',
        msg: 'chat_upstream_error',
        code: classified.code,
        sessionId,
        clientId: body.clientId ?? null,
        err: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      }));
      return JSON.stringify(classified);
    },
    // Grava a resposta quando ela termina. Abortada não entra: meia resposta
    // salva viraria histórico truncado sem nenhuma marca de que foi cortada.
    onFinish: async ({ messages, isAborted }) => {
      if (isAborted) return;
      const response = messages.at(-1);
      if (response?.role !== 'assistant') return;
      try {
        await appendMessage(threadId, { role: 'assistant', parts: response.parts });
      } catch (err) {
        // Falha ao persistir não pode derrubar a resposta que o usuário já leu.
        console.error('[api/chat] falha ao gravar resposta no histórico:', err);
      }
    },
    execute: async ({ writer }) => {
      const reader = stream.fullStream.getReader();
      let firstText = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          recordChunk(value as ChunkType);
          const uiChunk = toUiChunk(value as ChunkType);
          if (uiChunk) {
            // Primeiro pedaço que o usuário efetivamente vê — separa "pensando"
            // de "escrevendo" no diagnóstico de latência.
            if (!firstText) {
              firstText = true;
              timer.mark('primeiroChunkUI');
            }
            writer.write(uiChunk as never);
          }
        }
      } finally {
        reader.releaseLock();
        /*
         * Bater no teto só é truncamento se o modelo ainda queria chamar
         * ferramenta — é o que `tool-calls` como motivo final diz. Terminar em
         * `stop` no último passo permitido é o turno acabando por vontade
         * própria, e avisar nesse caso seria alarme falso.
         */
        const truncadoPorTeto =
          turn.passos >= MAX_TURN_STEPS && turn.motivoFinal === 'tool-calls';
        const context = { sessionId, page: body.page, clientId: body.clientId ?? null };
        if (truncadoPorTeto) {
          // `warn`: o usuário recebeu uma resposta incompleta — degradação, não
          // falha. Linha própria para ser alertável sem depender de campo dentro
          // do `chat_timing`.
          console.warn(
            JSON.stringify({
              event: 'chat_step_limit_reached',
              ...context,
              passos: turn.passos,
              maxPassos: MAX_TURN_STEPS,
              motivoFinal: turn.motivoFinal,
            }),
          );
        }
        timer.finish({ ...context, passos: turn.passos, truncadoPorTeto });
      }
    },
  });

  const res = createUIMessageStreamResponse({ stream: uiMessageStream });
  res.headers.set('x-thread-id', threadId);
  return res;
}

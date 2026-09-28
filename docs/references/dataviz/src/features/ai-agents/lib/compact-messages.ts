import type { UIMessage } from 'ai';

/**
 * Teto por CONTAGEM de mensagens. Cobre a conversa longa e tagarela.
 * Era o único gatilho; virou o segundo.
 */
const MAX_RECENT_TURNS = 20;

/**
 * Teto por TAMANHO. É o que realmente protege aqui: as tools devolvem linha de
 * BigQuery, então 5 mensagens com resultado de `execute_sql` pesam mais que 20
 * mensagens de texto. Só a contagem deixava passar exatamente o caso pior.
 *
 * Caracteres como proxy de token: evita tokenizer e evita depender do `usage`
 * do provider, que só chega DEPOIS do request — tarde demais para podar. A
 * relação varia com o conteúdo (em JSON de resultado fica perto de 4 chars por
 * token), então o número é conservador de propósito.
 *
 * 120k chars ≈ 30k tokens de histórico. Não é limite de contexto do modelo (os
 * Gemini em uso comportam muito mais) — é teto de CUSTO por turno, para a
 * conversa não encarecer sem limite. Ajustável sem deploy via
 * CHAT_HISTORY_BUDGET_CHARS.
 */
const DEFAULT_BUDGET_CHARS = 120_000;

/**
 * Nunca compacta as últimas N mensagens, mesmo que sozinhas estourem o
 * orçamento. Sem esse piso, um único resultado gigante no turno anterior seria
 * podado e o modelo perderia o contexto imediato da pergunta em curso.
 */
const MIN_INTACT_TURNS = 4;

function budgetChars(): number {
  const raw = Number(process.env.CHAT_HISTORY_BUDGET_CHARS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_CHARS;
}

/** Tamanho serializado da mensagem — é isso que vira payload para o modelo. */
export function messageSize(msg: UIMessage): number {
  try {
    return JSON.stringify(msg.parts ?? []).length;
  } catch {
    return 0; // ciclo/inserializável: não deixa a poda explodir
  }
}

/** Texto que diz alguma coisa — vazio e só-espaço não contam. */
function hasUsefulText(part: UIMessage['parts'][number]): boolean {
  if (part.type !== 'text') return false;
  const { text } = part as { text?: string };
  return typeof text === 'string' && text.trim().length > 0;
}

/**
 * Tool que CHEGOU A TERMINAR — tem output (ou erro) registrado.
 *
 * Estado parcial (`input-streaming`, `input-available`) é chamada que não
 * completou: `repairOrphanedToolCalls` a remove logo abaixo, então contá-la como
 * conteúdo faria a mensagem sobreviver ao filtro para ficar vazia depois.
 */
function hasFinishedTool(part: UIMessage['parts'][number]): boolean {
  if (!part.type.startsWith('tool-')) return false;
  const { state } = part as { state?: string };
  return state === 'output-available' || state === 'output-error';
}

/**
 * Descarta mensagens de assistente que não carregam nada — sem partes, ou só
 * texto vazio/em branco.
 *
 * O filtro exigia parte de TEXTO, e com isso jogava fora a mensagem inteira de
 * um turno que só chamou ferramenta, levando junto as tool-calls e os
 * tool-results dela. É o formato de todo turno de autoria cortado antes da
 * resposta final: o histórico perdia os blocos recém-criados e, no turno
 * seguinte, o modelo os recriava por não saber que já existiam.
 *
 * A intenção original continua: mensagem sem conteúdo nenhum não vai ao modelo.
 * O que mudou é o que conta como conteúdo — tool-call concluída também é.
 */
function filterEmptyAssistantMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter(msg => {
    if (msg.role !== 'assistant') return true;
    if (!msg.parts || msg.parts.length === 0) return false;
    return msg.parts.some(p => hasUsefulText(p) || hasFinishedTool(p));
  });
}

/**
 * Repairs orphaned tool invocation parts that have no output.
 * This happens when streaming fails mid-tool-call.
 * Strips tool parts stuck in partial/streaming state.
 */
function repairOrphanedToolCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map(msg => {
    if (msg.role !== 'assistant' || !msg.parts) return msg;

    const repairedParts = msg.parts.filter(part => {
      if (!part.type.startsWith('tool-')) return true;
      const tp = part as { state?: string };
      if (tp.state === 'output-available' || tp.state === 'output-error') return true;
      return false;
    });

    if (repairedParts.length === 0) {
      return {
        ...msg,
        parts: [{ type: 'text' as const, text: '[Resposta interrompida]' }],
      };
    }

    return repairedParts.length !== msg.parts.length ? { ...msg, parts: repairedParts } : msg;
  });
}

/** Tira as partes de tool preservando o texto — é nelas que mora o peso. */
function stripToolParts(msg: UIMessage): UIMessage {
  if (msg.role !== 'assistant') return msg;
  const textParts = (msg.parts ?? []).filter(p => p.type === 'text');
  if (textParts.length === 0) {
    return {
      ...msg,
      parts: [{ type: 'text' as const, text: '[Resposta anterior com dados — detalhes omitidos para economia de contexto]' }],
    };
  }
  return { ...msg, parts: textParts };
}

/**
 * Índice a partir do qual as mensagens ficam INTACTAS.
 *
 * Caminha do fim para o começo somando tamanho; assim que o acumulado passa do
 * orçamento, tudo que vier antes vira candidato à poda. O piso de
 * MIN_INTACT_TURNS vence o orçamento.
 */
function findKeepFromIndex(messages: UIMessage[], budget: number): number {
  let acc = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    acc += messageSize(messages[i]);
    if (acc > budget) {
      const byBudget = i + 1;
      const byFloor = Math.max(0, messages.length - MIN_INTACT_TURNS);
      return Math.min(byBudget, byFloor);
    }
  }
  return 0; // cabe inteiro no orçamento
}

/**
 * Sanitiza e compacta a conversa antes de mandar para o modelo.
 * 1. Remove mensagens de assistente vazias
 * 2. Repara tool calls órfãos de streaming interrompido
 * 3. Compacta as antigas — por TAMANHO ou por CONTAGEM, o que disparar
 *    primeiro —, tirando as partes de tool e mantendo o texto
 */
export function compactMessages(messages: UIMessage[]): UIMessage[] {
  let sanitized = filterEmptyAssistantMessages(messages);
  sanitized = repairOrphanedToolCalls(sanitized);

  const keepFromBudget = findKeepFromIndex(sanitized, budgetChars());
  const keepFromCount = sanitized.length > MAX_RECENT_TURNS
    ? sanitized.length - MAX_RECENT_TURNS
    : 0;

  // O corte mais AGRESSIVO vence: quem disparar primeiro poda mais para trás.
  const keepFrom = Math.max(keepFromBudget, keepFromCount);
  if (keepFrom === 0) return sanitized;

  return [
    ...sanitized.slice(0, keepFrom).map(stripToolParts),
    ...sanitized.slice(keepFrom),
  ];
}

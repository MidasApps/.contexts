/**
 * O que dizer quando o provedor de LLM falha.
 *
 * ─── Por que isto existe ───
 *
 * Toda falha do chat virava a mesma frase: "Erro ao processar mensagem. Tente
 * novamente." Ela é falsa em dois sentidos quando o Vertex responde 429: o
 * problema não foi a mensagem — foi cota do provedor — e "tente novamente"
 * imediatamente é a pior orientação possível, porque tentar de novo na hora
 * gasta a mesma cota que acabou. Quem lia isso reescrevia o pedido achando que
 * tinha pedido algo errado.
 *
 * O servidor classifica (ele tem o erro real, com `statusCode`) e manda um
 * envelope estável; o cliente só escolhe entre a mensagem que veio e a
 * genérica. Nenhum dos dois lados interpreta texto de provedor.
 */

export type ModelErrorCode =
  | 'LLM_SEM_CAPACIDADE'
  | 'LLM_SEM_CREDENCIAL'
  | 'LLM_INDISPONIVEL'
  | 'LLM_FALHOU';

export interface ModelError {
  code: ModelErrorCode;
  mensagem: string;
}

const MESSAGES: Record<ModelErrorCode, string> = {
  LLM_SEM_CAPACIDADE:
    'O provedor de IA está sem capacidade neste momento (limite de uso atingido). Espere alguns segundos e envie de novo — sua conversa continua salva.',
  LLM_SEM_CREDENCIAL:
    'A credencial de acesso à IA expirou. Refaça o login no provedor (ou avise quem administra o ambiente) e tente de novo.',
  LLM_INDISPONIVEL:
    'O provedor de IA está fora do ar neste momento. Tente de novo em instantes — sua conversa continua salva.',
  LLM_FALHOU:
    'Não consegui completar a resposta. Tente de novo; se persistir, reformule a pergunta.',
};

/** Status HTTP do erro, quando o provedor o expõe. */
function statusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { statusCode?: unknown; status?: unknown };
  const raw = e.statusCode ?? e.status;
  return typeof raw === 'number' ? raw : null;
}

function textOf(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === 'object') {
    const e = error as { message?: unknown; responseBody?: unknown };
    return [e.message, e.responseBody].filter((v) => typeof v === 'string').join(' ');
  }
  return '';
}

/**
 * Classifica o erro do provedor. Roda no SERVIDOR, onde o erro ainda tem
 * `statusCode` — depois de atravessar o stream sobra só texto.
 */
export function classifyModelError(error: unknown): ModelError {
  const status = statusOf(error);
  const text = textOf(error);

  const isOutOfCapacity =
    status === 429 || /RESOURCE_EXHAUSTED|resource exhausted|quota/i.test(text);
  if (isOutOfCapacity) return { code: 'LLM_SEM_CAPACIDADE', mensagem: MESSAGES.LLM_SEM_CAPACIDADE };

  const isMissingCredential =
    status === 401 ||
    status === 403 ||
    /UNAUTHENTICATED|PERMISSION_DENIED|invalid_grant|invalid_rapt|credential/i.test(text);
  if (isMissingCredential) return { code: 'LLM_SEM_CREDENCIAL', mensagem: MESSAGES.LLM_SEM_CREDENCIAL };

  const isUnavailable = (status !== null && status >= 500) || /UNAVAILABLE|ECONNRESET|ETIMEDOUT/i.test(text);
  if (isUnavailable) return { code: 'LLM_INDISPONIVEL', mensagem: MESSAGES.LLM_INDISPONIVEL };

  return { code: 'LLM_FALHOU', mensagem: MESSAGES.LLM_FALHOU };
}

/** O envelope que viaja no stream até o cliente. */
export function serializeModelError(error: unknown): string {
  return JSON.stringify(classifyModelError(error));
}

/**
 * Do lado do CLIENTE: a mensagem para a tela.
 *
 * Erro que não veio do nosso envelope (rede caiu, servidor devolveu HTML) não
 * tem texto apresentável — nesses casos vale a genérica. Nunca mostramos
 * `error.message` cru: era assim que "Resource exhausted. Please refer to
 * https://cloud.google.com/..." chegava ao usuário final.
 */
export function chatErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  try {
    const envelope = JSON.parse(text) as Partial<ModelError>;
    if (envelope && typeof envelope.mensagem === 'string' && envelope.code) return envelope.mensagem;
  } catch {
    // não é nosso envelope
  }
  return MESSAGES.LLM_FALHOU;
}

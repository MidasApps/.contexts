import { createHash } from 'node:crypto';

export {
  GENERAL_CONVERSATION_KEY,
  indicatorConversationKey,
} from '@/shared/lib/chat/conversation-key';

/**
 * Identidade de uma conversa, derivada NO SERVIDOR.
 *
 * O cliente manda `conversationKey` — o assunto ("general", ou
 * "indicator:Índice Recebível") — e nunca o id do thread. O id sai daqui, do
 * assunto MAIS o usuário autenticado e o cliente ativo.
 *
 * Por que não aceitar o threadId do cliente (como era): a rota usava
 * `body.threadId` sem verificar dono. Enquanto nada era gravado no thread isso
 * era inofensivo; a partir do momento em que a conversa fica salva e legível,
 * mandar o id de outra pessoa leria e escreveria na conversa dela. Derivar
 * fecha isso por construção — não existe id que o cliente possa forjar para
 * alcançar conversa alheia.
 *
 * Determinístico de propósito: mesmo usuário + mesmo cliente + mesmo indicador
 * cai sempre no mesmo thread, então reabrir o card retoma a análise anterior
 * sem o navegador precisar guardar id nenhum.
 */
export function deriveThreadId(input: {
  email: string;
  clientId: string;
  conversationKey: string;
}): string {
  const material = [
    input.email.trim().toLowerCase(),
    input.clientId.trim(),
    input.conversationKey.trim(),
  ].join(' ');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

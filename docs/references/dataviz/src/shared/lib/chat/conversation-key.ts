/**
 * Assunto de uma conversa do chat — o que o cliente manda para o servidor no
 * lugar de um id de thread.
 *
 * Mora em `shared` (e não junto da rota) porque navegador e servidor precisam
 * concordar no formato: o servidor deriva o id do thread a partir daqui
 * (`app/api/chat/thread-id.ts`), e essa derivação usa `node:crypto` — que não
 * pode entrar no bundle do cliente.
 */

/**
 * Conversa geral da barra lateral. NÃO é por página: o assistente ali serve
 * para qualquer coisa — perguntar sobre indicador, criar página nova — então é
 * um fio só, contínuo, independente de onde o usuário esteja.
 */
export const GENERAL_CONVERSATION_KEY = 'general';

/**
 * Conversa de um indicador específico, identificada pelo rótulo que aparece no
 * card. Reabrir o mesmo card retoma esta conversa.
 *
 * O rótulo é a identidade porque é o que o usuário reconhece; ids de bloco
 * mudam entre templates e se repetem entre páginas.
 */
export function indicatorConversationKey(label: string): string {
  return `indicator:${label.trim()}`;
}

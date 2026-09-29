/**
 * Qual conversa livre estava aberta, por cliente.
 *
 * ─── Por que isto existe ───
 *
 * A conversa em si sempre foi gravada no Firestore (coleção `conversations`) —
 * o que não sobrevivia era saber QUAL delas estava na tela: a identidade morava
 * num `useState` do AISidebar. Um F5 no meio de uma análise devolvia o chat
 * vazio, com a conversa intacta escondida atrás do botão "Conversas". Quem
 * recarregasse achava que tinha perdido o que escreveu.
 *
 * A chave é por cliente porque a conversa é sobre a carteira DAQUELE cliente:
 * retomar no cliente errado traria uma discussão sobre outros números — pior
 * do que não retomar nada.
 *
 * Não vale para conversa de indicador: aquela é reencontrada pelo assunto
 * (`conversationKey`), que é derivado do nome do indicador e não precisa de
 * memória local nenhuma.
 */

const PREFIX = 'liquid:conversaAtiva';

function storageKey(clientId: string): string {
  return `${PREFIX}:${clientId}`;
}

/** Id guardado para este cliente, ou null (inclusive fora do navegador). */
export function readLastConversation(clientId: string): string | null {
  if (typeof window === 'undefined' || !clientId) return null;
  try {
    return localStorage.getItem(storageKey(clientId)) || null;
  } catch {
    return null;
  }
}

/** Guarda o id; `null` esquece — é o que "Nova conversa" faz. */
export function saveLastConversation(clientId: string, id: string | null): void {
  if (typeof window === 'undefined' || !clientId) return;
  try {
    if (id) localStorage.setItem(storageKey(clientId), id);
    else localStorage.removeItem(storageKey(clientId));
  } catch {
    // localStorage cheio ou bloqueado: retomar conversa é conforto, não
    // requisito — falhar aqui não pode custar a conversa em andamento.
  }
}

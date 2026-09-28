/**
 * GET /api/chat/history — mensagens já trocadas em uma conversa.
 *
 * O cliente pede pelo ASSUNTO (`conversationKey`), nunca por id de thread: o id
 * é derivado aqui do usuário autenticado (ver `../thread-id.ts`), então
 * ninguém alcança conversa alheia mudando um parâmetro.
 */
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { getMessages } from '@/shared/lib/memory/memory-service';
import { deriveThreadId, GENERAL_CONVERSATION_KEY } from '../thread-id';

export const runtime = 'nodejs';

/** Teto de mensagens devolvidas — o suficiente para retomar o assunto. */
const LIMIT = 50;

export async function GET(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId');
  const conversationKey =
    url.searchParams.get('conversationKey') || GENERAL_CONVERSATION_KEY;

  if (!clientId) {
    return NextResponse.json({ error: 'Campo obrigatório: clientId' }, { status: 400 });
  }

  const threadId = deriveThreadId({ email, clientId, conversationKey });
  const stored = await getMessages(threadId, { limit: LIMIT });

  // `getMessages` devolve as mais recentes primeiro; a tela lê de cima para
  // baixo. E só `user`/`assistant` são renderizáveis — `system`/`tool` existem
  // no armazenamento mas não são fala de ninguém na conversa.
  const messages = stored
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .reverse()
    .map((m) => ({ id: m.id, role: m.role, parts: m.parts }));

  return NextResponse.json({ messages });
}

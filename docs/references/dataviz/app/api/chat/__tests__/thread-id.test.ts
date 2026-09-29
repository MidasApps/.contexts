import { describe, it, expect } from 'vitest';
import { deriveThreadId } from '../thread-id';
import {
  GENERAL_CONVERSATION_KEY,
  indicatorConversationKey,
} from '@/shared/lib/chat/conversation-key';

const ana = 'ana@askliquid.com';
const bruno = 'bruno@askliquid.com';
const index = indicatorConversationKey('Índice Recebível');
const keyPositions = indicatorConversationKey('Pós-chaves + Estoque');

describe('deriveThreadId', () => {
  /**
   * É o que faz "reabrir o card retoma a análise" funcionar sem o navegador
   * guardar id nenhum: a mesma pessoa, no mesmo cliente, no mesmo indicador,
   * cai sempre no mesmo thread.
   */
  it('é estável entre chamadas para o mesmo assunto', () => {
    const a = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    const b = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    expect(a).toBe(b);
  });

  it('não depende de caixa nem de espaço em volta do e-mail', () => {
    const a = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    const b = deriveThreadId({ email: '  Ana@AskLiquid.com ', clientId: 'vila-rosa', conversationKey: index });
    expect(a).toBe(b);
  });

  // Cada indicador tem a conversa dele — foi o pedido.
  it('separa indicadores diferentes', () => {
    const a = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    const b = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: keyPositions });
    expect(a).not.toBe(b);
  });

  it('separa a conversa geral da conversa de indicador', () => {
    const general = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: GENERAL_CONVERSATION_KEY });
    const forIndicator = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    expect(general).not.toBe(forIndicator);
  });

  /**
   * Isolamento: a conversa é de quem perguntou. Duas pessoas olhando o MESMO
   * indicador do MESMO cliente não enxergam o histórico uma da outra — e, como
   * o id nunca vem do cliente, não há parâmetro para forjar e alcançá-lo.
   */
  it('separa usuários diferentes no mesmo indicador', () => {
    const hers = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    const his = deriveThreadId({ email: bruno, clientId: 'vila-rosa', conversationKey: index });
    expect(hers).not.toBe(his);
  });

  // Multi-tenant: o mesmo rótulo existe em clientes diferentes.
  it('separa clientes diferentes no mesmo indicador', () => {
    const a = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    const b = deriveThreadId({ email: ana, clientId: 'outro-cliente', conversationKey: index });
    expect(a).not.toBe(b);
  });

  it('produz id usável como doc id do Firestore', () => {
    const id = deriveThreadId({ email: ana, clientId: 'vila-rosa', conversationKey: index });
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});

/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AGENT_ID,
  CHAT_AGENTS,
  SPECIALISTS,
  filterAgents,
  findChatAgent,
  resolveChatAgentId,
} from '../chat-agent-catalog';

describe('catálogo de agentes do chat', () => {
  it('o supervisor é o primeiro da lista — é o padrão', () => {
    expect(CHAT_AGENTS[0]!.id).toBe(DEFAULT_AGENT_ID);
  });

  /* O catálogo é o contrato com o runtime: cada id aqui precisa ser um agente
     que `buildMastraInstance` sabe construir. */
  it('cobre o supervisor e todos os especialistas, sem sobra', () => {
    expect(CHAT_AGENTS.map((a) => a.id)).toEqual([DEFAULT_AGENT_ID, ...SPECIALISTS]);
  });

  it('toda opção tem nome e descrição — o nome sozinho não diz para que serve', () => {
    for (const a of CHAT_AGENTS) {
      expect(a.name.trim().length).toBeGreaterThan(0);
      expect(a.description.trim().length).toBeGreaterThan(10);
    }
  });
});

describe('resolveChatAgentId', () => {
  it('devolve o id quando ele existe', () => {
    expect(resolveChatAgentId('cashflow')).toBe('cashflow');
  });

  // Vem de localStorage e de body de requisição: nenhum dos dois é contrato.
  it('id desconhecido, vazio ou nulo cai no supervisor', () => {
    expect(resolveChatAgentId('inventado')).toBe(DEFAULT_AGENT_ID);
    expect(resolveChatAgentId('')).toBe(DEFAULT_AGENT_ID);
    expect(resolveChatAgentId(null)).toBe(DEFAULT_AGENT_ID);
    expect(resolveChatAgentId(undefined)).toBe(DEFAULT_AGENT_ID);
  });

  it('findChatAgent nunca devolve vazio', () => {
    expect(findChatAgent('inventado').id).toBe(DEFAULT_AGENT_ID);
    expect(findChatAgent('external').name).toBe('Macroeconomia');
  });
});

describe('busca de agentes', () => {
  it('termo vazio devolve a lista inteira', () => {
    expect(filterAgents('   ')).toHaveLength(CHAT_AGENTS.length);
  });

  it('acha pelo nome', () => {
    expect(filterAgents('diagn').map((a) => a.id)).toEqual(['diagnostic']);
  });

  /* Ninguém digita acento na caixa de busca — e "simulacao" não pode devolver
     lista vazia por causa disso. */
  it('ignora acento', () => {
    expect(filterAgents('simulacao').map((a) => a.id)).toEqual(['simulation']);
  });

  it('acha por sinônimo que não está no nome nem na descrição', () => {
    expect(filterAgents('selic').map((a) => a.id)).toEqual(['external']);
    expect(filterAgents('hhi').map((a) => a.id)).toEqual(['diagnostic']);
  });

  it('termo sem correspondência devolve lista vazia', () => {
    expect(filterAgents('zzzz')).toEqual([]);
  });
});

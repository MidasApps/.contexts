import { describe, it, expect } from 'vitest';
import type { ChunkType } from '@mastra/core/stream';
import { toUiChunk, isRawMastraChunk } from '../to-ui-chunk';

/**
 * O defeito que estes testes trancam: toda pergunta que fazia o supervisor
 * delegar a um sub-agente terminava em "Erro ao processar mensagem" no chat.
 *
 * Sub-agente é chamado como tool; os chunks do stream interno dele chegam
 * dentro de um `tool-output`, e o conversor de UI devolve esse `output`
 * verbatim — com as chaves de framing do Mastra (`runId`/`from`/`payload`),
 * que o AI SDK v6 rejeita como `unrecognized_keys`. O `useChat` não descarta
 * só a parte inválida: derruba a resposta inteira.
 *
 * Chunk copiado do console do navegador na reprodução (2026-08-11).
 */
const subAgentInternalChunk = {
  type: 'start',
  runId: 'a388533b-e5c0-4ac1-aab4-d388cee07c75',
  from: 'AGENT',
  payload: { id: 'monitoring_agent', messageId: '4b488b28' },
};

describe('isRawMastraChunk', () => {
  it('reconhece o framing cru do Mastra', () => {
    expect(isRawMastraChunk(subAgentInternalChunk)).toBe(true);
  });

  it('não confunde parte legítima do UI stream com framing', () => {
    expect(isRawMastraChunk({ type: 'text-delta', id: 't1', delta: 'oi' })).toBe(false);
    expect(isRawMastraChunk({ type: 'start', messageId: 'm1' })).toBe(false);
    expect(isRawMastraChunk(null)).toBe(false);
    expect(isRawMastraChunk('start')).toBe(false);
  });
});

describe('toUiChunk', () => {
  it('descarta o stream interno de sub-agente embrulhado em tool-output', () => {
    const chunk = {
      type: 'tool-output',
      runId: 'r1',
      from: 'AGENT',
      payload: {
        toolCallId: 'call-1',
        toolName: 'monitoring_agent',
        output: subAgentInternalChunk,
      },
    } as unknown as ChunkType;

    expect(toUiChunk(chunk)).toBeNull();
  });

  it('deixa passar o texto do agente', () => {
    const chunk = {
      type: 'text-delta',
      runId: 'r1',
      from: 'AGENT',
      payload: { id: 't1', text: 'O índice está em 8,31x' },
    } as unknown as ChunkType;

    expect(toUiChunk(chunk)).toEqual({
      type: 'text-delta',
      id: 't1',
      delta: 'O índice está em 8,31x',
    });
  });

  it('framing de início do próprio agente não vira parte de UI', () => {
    const chunk = {
      type: 'start',
      runId: 'r1',
      from: 'AGENT',
      payload: {},
    } as unknown as ChunkType;

    expect(toUiChunk(chunk)).toBeNull();
  });
});

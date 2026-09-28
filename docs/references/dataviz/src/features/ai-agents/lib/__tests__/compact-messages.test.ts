import { describe, it, expect, afterEach } from 'vitest';
import type { UIMessage } from 'ai';
import { compactMessages, messageSize } from '../compact-messages';

const textPart = (text: string) => ({ type: 'text' as const, text });

function user(text: string): UIMessage {
  return { id: `u-${text.slice(0, 8)}`, role: 'user', parts: [textPart(text)] } as UIMessage;
}

/** Assistente com parte de tool grande — é o formato que pesa de verdade. */
function assistantWithTool(text: string, payloadChars: number): UIMessage {
  return {
    id: `a-${text.slice(0, 8)}`,
    role: 'assistant',
    parts: [
      textPart(text),
      {
        type: 'tool-execute_sql',
        state: 'output-available',
        output: { rows: 'x'.repeat(payloadChars) },
      },
    ],
  } as unknown as UIMessage;
}

function hasToolPart(msg: UIMessage): boolean {
  return (msg.parts ?? []).some((p) => p.type.startsWith('tool-'));
}

/**
 * Turno de AUTORIA: o modelo só chamou ferramenta, não escreveu texto. É o
 * formato que o teto de passos produz quando corta o turno antes da resposta
 * final — e o que sumia do histórico.
 */
function assistantSoTools(id: string): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-add_kpi_block',
        toolCallId: `tc-${id}`,
        state: 'output-available',
        output: { action: 'add_block', block: { id: `b-${id}`, type: 'kpi' } },
      },
    ],
  } as unknown as UIMessage;
}

afterEach(() => {
  delete process.env.CHAT_HISTORY_BUDGET_CHARS;
});

describe('compactMessages — corte por TAMANHO', () => {
  // A razão de existir desta mudança: antes o gatilho era só contagem, então
  // poucas mensagens com resultado de SQL passavam inteiras.
  it('poda mensagem antiga pesada mesmo com a conversa bem abaixo de 20 turnos', () => {
    process.env.CHAT_HISTORY_BUDGET_CHARS = '5000';
    const msgs = [
      assistantWithTool('primeira consulta', 8000),
      user('e agora?'),
      assistantWithTool('segunda consulta', 8000),
      user('ok'),
      assistantWithTool('terceira', 8000),
      user('última pergunta'),
    ];

    const out = compactMessages(msgs);

    expect(out).toHaveLength(6); // não descarta mensagem, só alivia
    expect(hasToolPart(out[0])).toBe(false); // a mais antiga perdeu o payload
    expect(out[0].parts.some((p) => p.type === 'text')).toBe(true); // texto preservado
  });

  it('não mexe em nada quando o histórico cabe no orçamento', () => {
    process.env.CHAT_HISTORY_BUDGET_CHARS = '1000000';
    const msgs = [assistantWithTool('a', 5000), user('b'), assistantWithTool('c', 5000)];
    const out = compactMessages(msgs);
    expect(out.every(hasToolPart) || out.filter(hasToolPart).length === 2).toBe(true);
    expect(out.filter(hasToolPart)).toHaveLength(2);
  });

  it('preserva as últimas mensagens intactas mesmo estourando o orçamento sozinhas', () => {
    process.env.CHAT_HISTORY_BUDGET_CHARS = '10';
    const msgs = [
      assistantWithTool('velha', 5000),
      user('p1'),
      assistantWithTool('recente-1', 5000),
      user('p2'),
      assistantWithTool('recente-2', 5000),
      user('p3'),
    ];

    const out = compactMessages(msgs);

    // Piso de 4: as 4 últimas ficam intactas, custe o que custar.
    expect(hasToolPart(out[2])).toBe(true);
    expect(hasToolPart(out[4])).toBe(true);
    expect(hasToolPart(out[0])).toBe(false);
  });
});

describe('compactMessages — corte por CONTAGEM (comportamento anterior preservado)', () => {
  it('acima de 20 mensagens, poda as antigas mesmo sendo leves', () => {
    process.env.CHAT_HISTORY_BUDGET_CHARS = '10000000'; // orçamento não dispara
    const msgs: UIMessage[] = [];
    for (let i = 0; i < 25; i++) msgs.push(assistantWithTool(`m${i}`, 10));

    const out = compactMessages(msgs);

    expect(out).toHaveLength(25);
    expect(hasToolPart(out[0])).toBe(false);  // fora da janela de 20
    expect(hasToolPart(out[24])).toBe(true);  // dentro
  });
});

describe('compactMessages — sanitização (inalterada)', () => {
  it('remove mensagem de assistente vazia', () => {
    const empty = { id: 'x', role: 'assistant', parts: [] } as unknown as UIMessage;
    expect(compactMessages([user('oi'), empty])).toHaveLength(1);
  });

  // Comportamento REAL (não o que o código sugere): assistente só com tool part
  // órfã é DESCARTADO, não substituído. `filterEmptyAssistantMessages` roda
  // antes de `repairOrphanedToolCalls` e remove quem não tem parte de texto —
  // então o fallback '[Resposta interrompida]' é inalcançável para esse caso.
  // Pré-existente; documentado aqui para não ser "corrigido" por engano.
  it('descarta assistente cuja única parte é tool call órfã', () => {
    const orphan = {
      id: 'y',
      role: 'assistant',
      parts: [{ type: 'tool-execute_sql', state: 'input-streaming' }],
    } as unknown as UIMessage;

    expect(compactMessages([user('oi'), orphan])).toHaveLength(1);
  });

  it('tira só a tool órfã quando a mensagem também tem texto, preservando o texto', () => {
    const partial = {
      id: 'z',
      role: 'assistant',
      parts: [
        textPart('deixa eu consultar'),
        { type: 'tool-execute_sql', state: 'input-streaming' },
        { type: 'tool-execute_sql', state: 'output-available', output: { rows: [] } },
      ],
    } as unknown as UIMessage;

    const out = compactMessages([user('oi'), partial]);

    expect(out).toHaveLength(2);
    // a órfã sai, a concluída fica
    expect((out[1].parts as { state?: string }[]).filter((p) => p.state === 'input-streaming')).toHaveLength(0);
    expect(hasToolPart(out[1])).toBe(true);
    expect(out[1].parts.some((p) => p.type === 'text')).toBe(true);
  });
});

describe('compactMessages — turno que só chamou ferramenta', () => {
  /**
   * O defeito: `filterEmptyAssistantMessages` exigia parte de TEXTO e jogava
   * fora a mensagem inteira — junto com as tool-calls e os tool-results dela.
   * Um turno que só construiu blocos (e terminou sem texto final, porque o teto
   * de passos o cortou) sumia do histórico, e no turno seguinte o modelo não
   * sabia o que já tinha construído: recriava os mesmos blocos.
   */
  it('preserva a mensagem de assistente sem texto que carrega tool-call concluída', () => {
    const out = compactMessages([
      user('monte a página'),
      assistantSoTools('a1'),
      user('e agora?'),
    ]);

    expect(out).toHaveLength(3);
    expect(hasToolPart(out[1])).toBe(true);
  });

  it('preserva o tool-result junto com a tool-call — é ele que diz o que foi criado', () => {
    const out = compactMessages([user('monte a página'), assistantSoTools('a1')]);

    const part = out[1].parts[0] as { state?: string; output?: { block?: { id?: string } } };
    expect(part.state).toBe('output-available');
    expect(part.output?.block?.id).toBe('b-a1');
  });

  // A intenção ORIGINAL do filtro (commit f43ffe5) continua valendo: mensagem de
  // assistente que não carrega nada não deve ir para o modelo.
  it('continua descartando assistente sem texto e sem tool alguma', () => {
    const empty = { id: 'v', role: 'assistant', parts: [] } as unknown as UIMessage;
    expect(compactMessages([user('oi'), empty])).toHaveLength(1);
  });

  it('continua descartando assistente cujo texto é só espaço em branco', () => {
    const blank = { id: 'b', role: 'assistant', parts: [textPart('   ')] } as unknown as UIMessage;
    expect(compactMessages([user('oi'), blank])).toHaveLength(1);
  });
});

describe('messageSize', () => {
  it('mede o payload serializado, não a contagem de partes', () => {
    expect(messageSize(assistantWithTool('a', 1000))).toBeGreaterThan(1000);
    expect(messageSize(user('curta'))).toBeLessThan(100);
  });
});

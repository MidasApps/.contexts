import { describe, it, expect } from 'vitest';
import { pruneParts, PART_BYTE_CAP } from './conversation-pruning';

/**
 * A conversa era gravada com os `parts` inteiros — todo tool call e todo tool
 * RESULT: linhas de `execute_sql`, payload de bloco, resposta crua de
 * sub-agente. E o documento é reescrito por completo a cada ponto estável do
 * turno.
 *
 * Medido no banco de dev: 727 KB em 26 conversas, das quais 433 KB (69%) eram
 * parts de tool; a maior conversa tinha 252 KB e era reescrita ~2x por turno.
 * O Firestore respondeu o que era de esperar — `resource-exhausted`, "exceeded
 * their maximum bandwidth for writes" — e aquele documento estava a 25% do teto
 * DURO de 1 MiB, além do qual a conversa não salva mais nunca.
 *
 * O payload de tool result é dado DERIVADO: as linhas de SQL são o retrato de
 * uma query que se roda de novo, e o bloco já está persistido no documento do
 * relatório, que é a cópia autoritativa. Não é registro de conversa.
 */

const large = (n: number) => 'x'.repeat(n);

function bytes(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');
}

describe('pruneParts', () => {
  it('part pequeno passa intacto', () => {
    // `report_created` tem 4 campos: podá-lo perderia o groupId por nada.
    const parts = [{
      type: 'tool-create_report',
      toolCallId: 'tc1',
      state: 'output-available',
      output: { action: 'report_created', groupId: 'teste-x', name: 'Teste X' },
    }];
    expect(pruneParts(parts)).toEqual(parts);
  });

  /*
   * Texto é a conversa em si, não dado derivado — prosa longa do assistente é
   * exatamente o que se quer reler depois. A gordura medida estava nos tools.
   */
  it('part de texto não é podado, mesmo grande', () => {
    const parts = [{ type: 'text', text: large(PART_BYTE_CAP * 3) }];
    expect(pruneParts(parts)).toEqual(parts);
  });

  it('tool part acima do teto perde o output e ganha resumo', () => {
    const parts = [{
      type: 'tool-execute_sql',
      toolCallId: 'tc2',
      state: 'output-available',
      output: { rows: Array.from({ length: 800 }, (_, i) => ({ i, valor: large(40) })) },
    }];

    const [pruned] = pruneParts(parts) as Array<Record<string, unknown>>;

    // A identidade do passo sobrevive: qual tool, qual chamada, como terminou.
    expect(pruned!.type).toBe('tool-execute_sql');
    expect(pruned!.toolCallId).toBe('tc2');
    expect(pruned!.state).toBe('output-available');
    expect(bytes(pruned)).toBeLessThanOrEqual(PART_BYTE_CAP);
    expect((pruned!.output as Record<string, unknown>).podado).toBe(true);
  });

  // Sem prévia, reler o histórico de uma delegação a sub-agente (a maior fatia
  // medida: 98 KB em 12 chamadas) não diria nada do que foi analisado.
  it('o resumo carrega prévia legível do que foi descartado', () => {
    const parts = [{
      type: 'tool-agent-descriptive',
      toolCallId: 'tc3',
      state: 'output-available',
      output: { texto: `A inadimplência subiu 3,2% na safra 2024. ${large(PART_BYTE_CAP * 2)}` },
    }];

    const [pruned] = pruneParts(parts) as Array<Record<string, unknown>>;
    const output = pruned!.output as Record<string, unknown>;

    expect(String(output.previa)).toContain('inadimplência subiu 3,2%');
    expect(bytes(pruned)).toBeLessThanOrEqual(PART_BYTE_CAP);
  });

  // Em várias tools de bloco o peso está no INPUT (o payload do bloco que a IA
  // montou), não na resposta.
  it('poda também quando o peso está no input', () => {
    const parts = [{
      type: 'tool-add_chart_block',
      toolCallId: 'tc4',
      state: 'output-available',
      input: { data: Array.from({ length: 500 }, (_, i) => ({ mes: i, valor: large(30) })) },
      output: { action: 'add_block' },
    }];

    const [pruned] = pruneParts(parts) as Array<Record<string, unknown>>;

    expect(bytes(pruned)).toBeLessThanOrEqual(PART_BYTE_CAP);
    expect(pruned!.type).toBe('tool-add_chart_block');
  });

  /*
   * A poda vale para o que vai ao BANCO. As mensagens em memória seguem
   * inteiras: é delas que a tela desenha a tabela e o gráfico do turno atual.
   */
  it('não muta o que recebeu', () => {
    const output = { rows: Array.from({ length: 800 }, (_, i) => ({ i })) };
    const parts = [{ type: 'tool-execute_sql', toolCallId: 'tc5', output }];
    const before = bytes(parts);

    pruneParts(parts);

    expect(bytes(parts)).toBe(before);
    expect(output.rows).toHaveLength(800);
  });

  it('mensagem de turno realista cabe num documento que não estoura', () => {
    // Um turno de autoria de verdade: delegação + métrica + seis blocos.
    const parts = [
      { type: 'text', text: 'Montei a página com os indicadores pedidos.' },
      { type: 'tool-agent-descriptive', toolCallId: 'a', state: 'output-available', output: { texto: large(26000) } },
      { type: 'tool-create_metric', toolCallId: 'b', state: 'output-available', output: { sql: large(10000) } },
      ...Array.from({ length: 6 }, (_, i) => ({
        type: 'tool-add_kpi_block',
        toolCallId: `k${i}`,
        state: 'output-available',
        input: { data: Array.from({ length: 200 }, (_, j) => ({ j, v: large(30) })) },
        output: { action: 'add_block' },
      })),
    ];

    const before = bytes(parts);
    const after = bytes(pruneParts(parts));

    expect(before).toBeGreaterThan(80_000);
    expect(after).toBeLessThan(20_000);
  });
});

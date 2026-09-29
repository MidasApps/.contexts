/**
 * Poda os `parts` de uma mensagem antes de ela ir para o Firestore.
 *
 * A conversa era gravada com os parts INTEIROS — todo tool call e todo tool
 * result — e o documento é reescrito por completo a cada ponto estável do turno.
 * Medido no banco de dev: 727 KB em 26 conversas, 433 KB (69%) só em parts de
 * tool, e a maior conversa com 252 KB sendo reescrita ~2x por pergunta. Meio
 * megabyte no MESMO documento por turno é o hot-spot que o Firestore recusa com
 * `resource-exhausted` ("exceeded their maximum bandwidth for writes") — e
 * aquele documento já estava a 25% do teto duro de 1 MiB, além do qual a
 * conversa deixa de salvar para sempre.
 *
 * O critério da poda: payload de tool é dado DERIVADO. As linhas de
 * `execute_sql` são o retrato de uma query que se roda de novo; o bloco já está
 * persistido no documento do relatório, que é a cópia autoritativa. Duplicar
 * isso no registro da conversa é o defeito — então corta-se aqui, no limite da
 * persistência, e não se constrói infraestrutura para carregar peso que não
 * deveria existir.
 *
 * Corte por TAMANHO, não por lista de tools: são mais de 40 e nascem novas toda
 * semana. Uma allowlist por nome apodrece em silêncio; um teto de bytes vale
 * para a tool que ainda não foi escrita.
 *
 * Só afeta o que vai ao banco. As mensagens em memória seguem inteiras — é
 * delas que a tela desenha a tabela e o gráfico do turno atual. Ver
 * `toSerialized` em `AISidebar`.
 */

/**
 * Teto por part, em bytes serializados.
 *
 * Escolhido na distribuição real do banco: p50 = 402 B, p75 = 922 B, p90 = 3,8
 * KB. Em 2 KB, ~80% dos parts passam intactos e a cauda — que carregava
 * praticamente todo o peso — é cortada.
 */
export const PART_BYTE_CAP = 2048;

/** Quanto do payload descartado sobra como texto legível. */
const PREVIEW_LENGTH = 400;

/** Part de conversa, não de tool: é a conversa em si e nunca é podado. */
const NARRATIVE_TYPES = new Set(['text', 'reasoning', 'step-start']);

function bytesDe(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Prévia legível do que foi descartado.
 *
 * Serializa e corta em vez de procurar campo de texto: a resposta de sub-agente
 * (a maior fatia medida) vem em chaves diferentes conforme o agente, e adivinhar
 * nome de campo erraria justamente nos casos que mais importam reler.
 */
function previewOf(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
}

function summaryOf(value: unknown, field: string): Record<string, unknown> {
  return {
    podado: true,
    resumo: `${field} de ${(bytesDe(value) / 1024).toFixed(1)} KB descartado ao gravar a conversa`,
    previa: previewOf(value),
  };
}

/**
 * Um part, dentro do teto.
 *
 * Poda o `output` primeiro, que é o pesado no caso comum; se ainda não couber,
 * poda o `input` também (nas tools de bloco o payload que a IA montou está lá).
 * `type`, `toolCallId` e `state` sobrevivem sempre: são a identidade do passo —
 * qual ferramenta, qual chamada, como terminou.
 */
function prunePart(part: unknown): unknown {
  if (!isRecord(part)) return part;
  const partType = String(part.type ?? '');
  if (NARRATIVE_TYPES.has(partType)) return part;
  if (bytesDe(part) <= PART_BYTE_CAP) return part;

  const prunedPart: Record<string, unknown> = { ...part };
  if ('output' in prunedPart) prunedPart.output = summaryOf(prunedPart.output, 'output');
  if (bytesDe(prunedPart) > PART_BYTE_CAP && 'input' in prunedPart) {
    prunedPart.input = summaryOf(part.input, 'input');
  }
  /*
   * Ainda grande depois de podar os dois: sobrou campo gordo que não é `input`
   * nem `output` (`errorText` de stack longa, delta de streaming que ficou no
   * part). Mantém só a identidade — passar do teto aqui derrotaria o propósito.
   */
  if (bytesDe(prunedPart) > PART_BYTE_CAP) {
    return {
      type: prunedPart.type,
      ...(prunedPart.toolCallId ? { toolCallId: prunedPart.toolCallId } : {}),
      ...(prunedPart.state ? { state: prunedPart.state } : {}),
      output: { podado: true, resumo: `part de ${(bytesDe(part) / 1024).toFixed(1)} KB descartado ao gravar a conversa` },
    };
  }
  return prunedPart;
}

/** Os parts de uma mensagem, prontos para o banco. Puro: não muta a entrada. */
export function pruneParts(parts: readonly unknown[]): unknown[] {
  return parts.map(prunePart);
}

/**
 * Conversão de um chunk do stream do Mastra para uma parte do UI message
 * stream do AI SDK v6 — o passo que o `/api/chat` executa por chunk.
 *
 * Mora fora da rota porque é aqui que estava o defeito que derrubava o chat
 * inteiro, e defeito assim precisa de teste: ver `isRawMastraChunk`.
 */
import {
  convertFullStreamChunkToUIMessageStream,
  convertMastraChunkToAISDKv5,
  type ChunkType,
} from '@mastra/core/stream';

/**
 * O que saiu da conversão é framing CRU do Mastra, e não uma parte do UI
 * message stream?
 *
 * Sub-agente é chamado como tool (ADR-0019: supervisão pela chave `agents:`).
 * Os chunks do stream INTERNO dele chegam embrulhados num `tool-output`, e
 * `convertFullStreamChunkToUIMessageStream` devolve esse `output` verbatim —
 * um objeto com as chaves de framing do Mastra (`runId`, `from`, `payload`).
 *
 * O schema do AI SDK v6 rejeita essas chaves como `unrecognized_keys`, e o
 * `useChat` não descarta só a parte inválida: derruba a resposta inteira com
 * `AI_TypeValidationError`. Na prática, toda pergunta que fizesse o supervisor
 * delegar (ou seja, quase toda pergunta analítica) morria em "Erro ao
 * processar mensagem" DEPOIS de já ter rodado — custo pago, resposta perdida.
 *
 * Descartar não perde informação para o usuário: quem anuncia o sub-agente na
 * tela é a parte de tool-call (o "agent-monitoring analisando" do
 * ToolStepIndicator), e a resposta final é a do supervisor. O stream interno
 * do sub-agente nunca foi renderizado.
 */
export function isRawMastraChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== 'object') return false;
  const c = chunk as Record<string, unknown>;
  return 'from' in c && 'runId' in c && 'payload' in c;
}

/**
 * Converte um chunk do `fullStream` do Mastra na parte correspondente do UI
 * message stream. Devolve `null` quando o chunk não tem representação na UI
 * (framing de início/fim, stream interno de sub-agente) — o caller pula.
 */
export function toUiChunk(chunk: ChunkType): unknown | null {
  const v5Part = convertMastraChunkToAISDKv5({ chunk, mode: 'stream' });
  if (!v5Part) return null;

  const uiChunk = convertFullStreamChunkToUIMessageStream({
    // O cast é seguro — `convertMastraChunkToAISDKv5` devolve
    // TextStreamPart<ToolSet> | ObjectStreamPart em modo stream, e
    // `convertFullStreamChunkToUIMessageStream` aceita
    // TextStreamPart<ToolSet> | tool-output.
    part: v5Part as never,
    onError: (err) => (err instanceof Error ? err.message : 'Stream error'),
  });
  if (!uiChunk) return null;

  return isRawMastraChunk(uiChunk) ? null : uiChunk;
}

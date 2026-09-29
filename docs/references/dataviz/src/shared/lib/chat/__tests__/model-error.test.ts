/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import {
  classifyModelError,
  chatErrorMessage,
  serializeModelError,
} from '../model-error';

/** O 429 real do Vertex, como ele chega do @ai-sdk/google-vertex. */
function quotaError() {
  return Object.assign(
    new Error(
      'Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.',
    ),
    {
      name: 'AI_APICallError',
      statusCode: 429,
      isRetryable: true,
      responseBody: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}',
    },
  );
}

describe('classifyModelError', () => {
  it('429 do provedor é falta de capacidade, não erro da mensagem', () => {
    const { code, mensagem: message } = classifyModelError(quotaError());
    expect(code).toBe('LLM_SEM_CAPACIDADE');
    expect(message).toMatch(/capacidade/i);
    // Reenviar na hora gasta a mesma cota que acabou: a orientação tem que ser
    // esperar, e não "tente novamente".
    expect(message).toMatch(/segundos/i);
  });

  it('reconhece a cota mesmo sem statusCode, pelo corpo da resposta', () => {
    expect(classifyModelError(new Error('RESOURCE_EXHAUSTED')).code).toBe('LLM_SEM_CAPACIDADE');
  });

  // O mesmo invalid_rapt que derruba o Firestore derruba o Vertex.
  it('credencial expirada pede novo login, não nova tentativa', () => {
    const error = Object.assign(new Error('invalid_grant: invalid_rapt'), { statusCode: 401 });
    const { code, mensagem: message } = classifyModelError(error);
    expect(code).toBe('LLM_SEM_CREDENCIAL');
    expect(message).toMatch(/login/i);
  });

  it('5xx do provedor é indisponibilidade', () => {
    expect(classifyModelError(Object.assign(new Error('boom'), { statusCode: 503 })).code)
      .toBe('LLM_INDISPONIVEL');
  });

  it('erro desconhecido cai no genérico, sem inventar diagnóstico', () => {
    expect(classifyModelError(new Error('qualquer coisa')).code).toBe('LLM_FALHOU');
    expect(classifyModelError(undefined).code).toBe('LLM_FALHOU');
  });

  /* A URL de documentação do Google, o nome do modelo e o projeto não são
     assunto de quem está analisando uma carteira. */
  it('nenhuma mensagem vaza detalhe do provedor', () => {
    for (const error of [quotaError(), new Error('qualquer coisa')]) {
      const { mensagem: message } = classifyModelError(error);
      expect(message).not.toMatch(/http|google|vertex|gemini|429/i);
    }
  });
});

describe('chatErrorMessage', () => {
  it('mostra a mensagem do envelope que o servidor mandou', () => {
    const fromServer = new Error(serializeModelError(quotaError()));
    expect(chatErrorMessage(fromServer)).toMatch(/capacidade/i);
  });

  // Rede caiu, servidor devolveu HTML: não é nosso envelope e não tem texto
  // apresentável.
  it('erro que não é nosso envelope vira a mensagem genérica', () => {
    expect(chatErrorMessage(new Error('Failed to fetch'))).toMatch(/Não consegui completar/i);
    expect(chatErrorMessage(new Error('<html>500</html>'))).toMatch(/Não consegui completar/i);
    expect(chatErrorMessage(undefined)).toMatch(/Não consegui completar/i);
  });

  it('nunca devolve o texto cru do provedor', () => {
    expect(chatErrorMessage(new Error('Resource exhausted. Please refer to https://cloud.google.com/x')))
      .not.toMatch(/cloud\.google\.com/);
  });
});

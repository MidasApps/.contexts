/**
 * Smoke test for /api/chat after ADR-0014 (Mastra runtime).
 *
 * Verifies the route delegates to a Mastra Agent obtained via
 * `buildMastraInstance(...).getAgent('descriptive')`, calls `.stream()`
 * on it, and returns an HTTP 200 with the `x-thread-id` header set.
 *
 * TODAS as bordas externas são mockadas — o teste não abre rede.
 *
 * Achado R15 da revisão: este cabeçalho já afirmava "does not hit any IO" e a
 * afirmação era falsa. `resolveChatAgent` chama `loadWorkflows()`, que lê
 * `aiWorkflows` no Firestore, e esse módulo não estava mockado. Com credencial
 * expirada a chamada ficava em retry e estourava o timeout de 5s: 5 dos 7
 * testes falhavam de forma permanente, num arquivo que ninguém conseguia usar
 * como sinal de regressão. A rota tem fail-soft para essa falha, então o
 * problema nunca foi da rota — era o teste ser não-hermético.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const streamMock = vi.fn();
const getAgentMock = vi.fn();
const buildMastraInstanceMock = vi.fn();
const getClientSemanticContextMock = vi.fn();
const verifyDatasetAccessMock = vi.fn();
const loadWorkflowsMock = vi.fn();
const selectWorkflowMock = vi.fn();
const buildSupervisorAgentMock = vi.fn();
const appendMessageMock = vi.fn(async (..._a: unknown[]) => ({ id: 'msg-1' }));

/**
 * A rota consome o `fullStream` dentro do `execute` do `createUIMessageStream`,
 * que ninguém aguarda. Guardar a promessa deixa o teste esperar o fim do consumo
 * antes de afirmar sobre o que foi logado no `finally`.
 */
const executions = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));

vi.mock('@/features/ai-agents/mastra/instance', () => ({
  buildMastraInstance: (...args: unknown[]) => buildMastraInstanceMock(...args),
}));

vi.mock('@/shared/repositories/client-semantic-context', () => ({
  getClientSemanticContext: (...args: unknown[]) => getClientSemanticContextMock(...args),
}));

vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: vi.fn(async () => 'tester@example.com'),
  verifyDatasetAccess: (...args: unknown[]) => verifyDatasetAccessMock(...args),
}));

vi.mock('@/shared/lib/memory/memory-service', () => ({
  createThread: vi.fn(async () => ({ id: 'thread-test-123' })),
  // A rota grava a pergunta e a resposta no thread (histórico de conversa).
  appendMessage: (...a: unknown[]) => appendMessageMock(...a),
}));

// Borda que faltava: `loadWorkflows` lê a coleção `aiWorkflows` no Firestore.
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({
  loadWorkflows: (...args: unknown[]) => loadWorkflowsMock(...args),
}));

vi.mock('@/features/ai-studio/runtime/select-workflow', () => ({
  selectWorkflow: (...args: unknown[]) => selectWorkflowMock(...args),
}));

vi.mock('@/features/ai-agents/mastra/build-supervisor-agent', () => ({
  buildSupervisorAgent: (...args: unknown[]) => buildSupervisorAgentMock(...args),
}));

vi.mock('@mastra/core/stream', () => ({
  // Pass-through transforms — the route writes whatever comes out the other side.
  convertMastraChunkToAISDKv5: vi.fn(({ chunk }: { chunk: unknown }) => chunk),
  convertFullStreamChunkToUIMessageStream: vi.fn(({ part }: { part: unknown }) => part),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('ai');
  return {
    ...actual,
    convertToModelMessages: vi.fn(async (msgs: unknown[]) => msgs),
    createUIMessageStream: vi.fn(({ execute }: { execute: (args: { writer: { write: (..._: unknown[]) => void } }) => Promise<void> }) => {
      // Run execute synchronously with a no-op writer so we exercise the
      // fullStream consumption path without needing a real ReadableStream.
      const writer = { write: vi.fn() };
      executions.pending.push(Promise.resolve(execute({ writer })));
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    }),
    createUIMessageStreamResponse: vi.fn(({ stream }: { stream: ReadableStream }) => {
      const headers = new Headers();
      return new Response(stream, { status: 200, headers });
    }),
  };
});

beforeEach(() => {
  executions.pending = [];
  streamMock.mockReset();
  getAgentMock.mockReset();
  buildMastraInstanceMock.mockReset();
  getClientSemanticContextMock.mockReset();
  getClientSemanticContextMock.mockResolvedValue(null);
  verifyDatasetAccessMock.mockReset();
  verifyDatasetAccessMock.mockResolvedValue({ allowed: true });
  // O supervisor é o caminho normal, com ou sem workflow no Firestore: sem doc
  // ativo ele apenas usa a instrução baseline do código. Perder o workflow
  // custava antes o supervisor inteiro — e com ele as tools de autoria.
  loadWorkflowsMock.mockReset();
  loadWorkflowsMock.mockResolvedValue([]);
  selectWorkflowMock.mockReset();
  buildSupervisorAgentMock.mockReset();
  buildSupervisorAgentMock.mockResolvedValue({ stream: streamMock });

  streamMock.mockResolvedValue({
    fullStream: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  });
  getAgentMock.mockReturnValue({ stream: streamMock });
  buildMastraInstanceMock.mockReturnValue({ getAgent: getAgentMock });
});

const validBody = {
  messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'oi' }] }],
  dataset: 'vila-rosa',
  filters: { dateRange: { start: '2025-01-01', end: '2025-12-31' } },
  page: 'dashboard',
};

function validPost(body: Record<string, unknown> = validBody) {
  return new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body) });
}

/** `fullStream` com N passos e um motivo de encerramento — o que o teto observa. */
function stepStream(passos: number, motivoFinal: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < passos; i++) {
        controller.enqueue({ type: 'step-finish', payload: { stepResult: { reason: 'tool-calls' } } });
      }
      controller.enqueue({ type: 'finish', payload: { stepResult: { reason: motivoFinal } } });
      controller.close();
    },
  });
}

/**
 * Teto de passos do turno (F4).
 *
 * O default do Mastra é `stepCountIs(5)` — confirmado em
 * `@mastra/core/dist/chunk-DDFT2H3T.js`, no `stream({ stopWhen = stepCountIs(5) })`
 * que o `Agent` usa quando a chamada não passa `maxSteps` nem `stopWhen`. Montar
 * uma página não cabe em 5 passos, e ao estourar o loop apenas parava: sem erro,
 * sem chunk de aviso, sem texto final.
 */
describe('POST /api/chat — teto de passos do turno', () => {
  it('passa um teto explícito, bem acima do default 5 do Mastra', async () => {
    const { POST } = await import('../route');
    await POST(validPost());

    const options = streamMock.mock.calls[0][1] as { maxSteps?: number };
    expect(options.maxSteps).toBeGreaterThan(5);
    // Valor fixado de propósito: mudá-lo é decisão, não efeito colateral.
    expect(options.maxSteps).toBe(24);
  });

  it('avisa em log estruturado quando o teto corta o turno no meio', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 24 passos e o modelo ainda querendo chamar ferramenta: foi o teto que parou.
    streamMock.mockResolvedValue({ fullStream: stepStream(24, 'tool-calls') });

    const { POST } = await import('../route');
    await POST(validPost());
    await Promise.all(executions.pending);

    const line = warn.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes('chat_step_limit_reached'));
    expect(line).toBeDefined();
    const record = JSON.parse(line!);
    expect(record.passos).toBe(24);
    expect(record.maxPassos).toBe(24);
    expect(record.motivoFinal).toBe('tool-calls');
    warn.mockRestore();
  });

  it('não avisa quando o turno bate no teto mas termina por vontade do modelo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Mesmos 24 passos, mas o modelo encerrou: coincidência, não truncamento.
    streamMock.mockResolvedValue({ fullStream: stepStream(24, 'stop') });

    const { POST } = await import('../route');
    await POST(validPost());
    await Promise.all(executions.pending);

    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('chat_step_limit_reached')))
      .toHaveLength(0);
    warn.mockRestore();
  });

  it('registra a contagem de passos na linha de timing mesmo sem truncamento', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    streamMock.mockResolvedValue({ fullStream: stepStream(3, 'stop') });

    const { POST } = await import('../route');
    await POST(validPost());
    await Promise.all(executions.pending);

    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.includes('chat_timing'));
    expect(line).toBeDefined();
    const record = JSON.parse(line!);
    expect(record.passos).toBe(3);
    expect(record.truncadoPorTeto).toBe(false);
    info.mockRestore();
  });
});

describe('POST /api/chat (Mastra runtime)', () => {
  it('builds a Mastra instance and delegates to the supervisor', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // O id não vem mais do `createThread`: é derivado do usuário autenticado +
    // cliente + assunto, para o cliente não conseguir apontar para a conversa
    // de outra pessoa. Ver `../thread-id.ts` e o teste de isolamento abaixo.
    expect(res.headers.get('x-thread-id')).toMatch(/^[0-9a-f]{32}$/);
    expect(buildMastraInstanceMock).toHaveBeenCalledTimes(1);
    expect(buildSupervisorAgentMock).toHaveBeenCalledTimes(1);
    // Os 8 sub-agentes entram no supervisor pela chave `agents:` do Mastra.
    expect(getAgentMock).toHaveBeenCalledWith('descriptive');
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it('rejects requests without filters.dateRange', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, filters: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('passes body.clientId as the 3rd arg to verifyDatasetAccess (cross-tenant guard)', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, clientId: 'vila-rosa' }),
    });
    await POST(req);
    expect(verifyDatasetAccessMock).toHaveBeenCalledWith('tester@example.com', 'vila-rosa', 'vila-rosa');
  });

  it('denies (403) when access does not cover body.clientId/dataset and never reaches semantic ctx or the agent', async () => {
    verifyDatasetAccessMock.mockResolvedValue({
      allowed: false,
      status: 403,
      error: 'Sem permissão para este cliente',
    });
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      // user authorized for tenant A tries to reach tenant B's dataset/clientId
      body: JSON.stringify({ ...validBody, dataset: 'brz', clientId: 'brz' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Sem permissão para este cliente');
    // Deny must short-circuit BEFORE semantic context resolution and the agent.
    expect(getClientSemanticContextMock).not.toHaveBeenCalled();
    expect(buildMastraInstanceMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('resolves semantic context with body.clientId and threads it into ctx', async () => {
    const semantic = { clientId: 'vila-rosa', metrics: [], dataContracts: [] };
    getClientSemanticContextMock.mockResolvedValue(semantic);
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, clientId: 'vila-rosa' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getClientSemanticContextMock).toHaveBeenCalledWith('vila-rosa');
    const ctxArg = buildMastraInstanceMock.mock.calls[0][0].ctx;
    expect(ctxArg.clientId).toBe('vila-rosa');
    expect(ctxArg.semanticContext).toBe(semantic);
  });

  it('skips resolution when clientId is absent and still proceeds', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getClientSemanticContextMock).not.toHaveBeenCalled();
    const ctxArg = buildMastraInstanceMock.mock.calls[0][0].ctx;
    expect(ctxArg.semanticContext).toBeUndefined();
  });

  // Com o teste não-hermético, este caminho NUNCA era exercitado: `loadWorkflows`
  // estourava e a rota caía no fail-soft. Agora ele tem cobertura própria.
  it('havendo workflow ativo, delega ao supervisor em vez do descriptive', async () => {
    loadWorkflowsMock.mockResolvedValue([{ id: 'wf-1', instruction: 'analise a carteira' }]);
    selectWorkflowMock.mockResolvedValue({ id: 'wf-1', instruction: 'analise a carteira' });
    const supervisorStream = vi.fn().mockResolvedValue({
      fullStream: new ReadableStream({ start: (c) => c.close() }),
    });
    buildSupervisorAgentMock.mockResolvedValue({ stream: supervisorStream });

    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify(validBody),
    }));

    expect(res.status).toBe(200);
    expect(supervisorStream).toHaveBeenCalledTimes(1);
    expect(streamMock).not.toHaveBeenCalled();
    expect(buildSupervisorAgentMock.mock.calls[0][0].instruction).toBe('analise a carteira');
  });

  /*
   * Firestore fora do ar não pode custar as tools de autoria: o workflow
   * contribui com uma seção do prompt, não com capacidade. A degradação agora é
   * da instrução, não do agente.
   */
  it('falha ao carregar workflow mantém o supervisor, com instrução baseline', async () => {
    loadWorkflowsMock.mockRejectedValue(new Error('firestore indisponível'));

    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify(validBody),
    }));

    expect(res.status).toBe(200);
    expect(buildSupervisorAgentMock).toHaveBeenCalledTimes(1);
    expect(buildSupervisorAgentMock.mock.calls[0][0].instruction).toMatch(/Construir ou alterar/i);
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  // Fail-soft de verdade: só quando o próprio supervisor não constrói.
  it('supervisor que não constrói degrada para o descriptive', async () => {
    buildSupervisorAgentMock.mockRejectedValue(new Error('sem modelo'));
    const descriptiveStream = vi.fn().mockResolvedValue({
      fullStream: new ReadableStream({ start: (c) => c.close() }),
    });
    getAgentMock.mockReturnValue({ stream: descriptiveStream });

    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify(validBody),
    }));

    expect(res.status).toBe(200);
    expect(descriptiveStream).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully when resolver returns null (still 200, no semanticContext)', async () => {
    getClientSemanticContextMock.mockResolvedValue(null);
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, clientId: 'vila-rosa' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getClientSemanticContextMock).toHaveBeenCalledWith('vila-rosa');
    const ctxArg = buildMastraInstanceMock.mock.calls[0][0].ctx;
    expect(ctxArg.semanticContext).toBeUndefined();
  });
});

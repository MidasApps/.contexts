import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getMock = vi.fn();
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => ({ collection: () => ({ limit: () => ({ get: getMock }) }) }),
}));

import { GET } from '../route';

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue({ docs: [] });
});
afterEach(() => {
  delete process.env.GIT_SHA;
});

describe('GET /api/health', () => {
  it('200 com status ok quando a dependência responde', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.firestore).toBe('ok');
  });

  // O ponto do R16: a home devolvia 200 com o Firestore fora, e o container
  // quebrado seguia recebendo tráfego. 503 é o que faz o orquestrador parar.
  it('503 quando o Firestore falha — é o que tira o container do balanceador', async () => {
    getMock.mockRejectedValue(new Error('indisponível'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.firestore).toBe('fail');
  });

  it('expõe a versão do código para decidir rollback', async () => {
    const res = await GET();
    expect((await res.json()).version).toBe('desconhecido');
  });

  // A rota é não-autenticada (o healthcheck do container roda sem credencial),
  // então o corpo não pode carregar nada além disto.
  it('não vaza detalhe do erro nem configuração', async () => {
    getMock.mockRejectedValue(new Error('projeto-secreto: permissão negada em gs://bucket'));
    const body = await (await GET()).json();
    expect(JSON.stringify(body)).not.toContain('projeto-secreto');
    expect(Object.keys(body).sort()).toEqual(['checks', 'durationMs', 'env', 'status', 'version']);
  });

  it('não é cacheável — resposta velha esconderia queda', async () => {
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

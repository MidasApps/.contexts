import { describe, it, expect } from 'vitest';
import { createPhaseTimer } from '../phase-timer';

/** Relógio controlado: `avancar(ms)` move o tempo, `agora()` é o `now` injetado. */
function fakeClock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

function collector() {
  const lines: string[] = [];
  return {
    emit: (l: string) => { lines.push(l); },
    last: () => JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>,
    count: () => lines.length,
  };
}

describe('createPhaseTimer', () => {
  it('mede a duração de cada fase pelo relógio injetado', async () => {
    const c = fakeClock();
    const out = collector();
    const timer = createPhaseTimer({}, c.now, out.emit);

    await timer.time('buildMastra', async () => { c.advance(800); });
    await timer.time('resolveAgent', async () => { c.advance(150); });
    timer.finish();

    const log = out.last();
    expect(log.phases).toEqual({ buildMastra: 800, resolveAgent: 150 });
  });

  it('devolve o valor da etapa medida sem alterá-lo', async () => {
    const timer = createPhaseTimer({}, fakeClock().now, () => {});
    const value = await timer.time('x', async () => ({ ok: true }));
    expect(value).toEqual({ ok: true });
  });

  it('registra a fase mesmo quando ela lança', async () => {
    const c = fakeClock();
    const out = collector();
    const timer = createPhaseTimer({}, c.now, out.emit);

    await expect(
      timer.time('semanticContext', async () => {
        c.advance(300);
        throw new Error('firestore fora do ar');
      }),
    ).rejects.toThrow('firestore fora do ar');
    timer.finish();

    // A fase que falhou é a que mais interessa no diagnóstico — não pode sumir.
    expect(out.last().phases).toEqual({ semanticContext: 300 });
  });

  it('mede cada delegação a partir do início da requisição', () => {
    const c = fakeClock();
    const out = collector();
    const timer = createPhaseTimer({}, c.now, out.emit);

    c.advance(500);
    timer.delegationStart('descriptive');
    c.advance(4_000);
    timer.delegationEnd('descriptive');
    c.advance(200);
    timer.delegationStart('monitoring');
    c.advance(6_000);
    timer.delegationEnd('monitoring');
    timer.finish();

    const log = out.last();
    expect(log.delegacoes).toBe(2);
    expect(log.delegacoesDetalhe).toEqual([
      { agent: 'descriptive', startedAtMs: 500, durationMs: 4_000 },
      { agent: 'monitoring', startedAtMs: 4_700, durationMs: 6_000 },
    ]);
  });

  it('fecha a delegação em aberto mais recente quando o mesmo agente repete', () => {
    const c = fakeClock();
    const out = collector();
    const timer = createPhaseTimer({}, c.now, out.emit);

    timer.delegationStart('descriptive');
    c.advance(1_000);
    timer.delegationStart('descriptive');
    c.advance(2_000);
    timer.delegationEnd('descriptive');
    timer.finish();

    const detail = out.last().delegacoesDetalhe as Array<Record<string, unknown>>;
    // A segunda fecha com 2s; a primeira segue aberta (durationMs null) — o
    // contrário inflaria a duração da primeira para 3s.
    expect(detail[0]).toMatchObject({ startedAtMs: 0, durationMs: null });
    expect(detail[1]).toMatchObject({ startedAtMs: 1_000, durationMs: 2_000 });
  });

  it('emite uma única linha mesmo com finish chamado duas vezes', () => {
    const out = collector();
    const timer = createPhaseTimer({ sessionId: 'abc' }, fakeClock().now, out.emit);

    timer.finish();
    timer.finish({ erro: 'ignorado' });

    expect(out.count()).toBe(1);
    expect(out.last().sessionId).toBe('abc');
    expect(out.last().erro).toBeUndefined();
  });

  it('marca instantes relativos ao início da requisição', () => {
    const c = fakeClock();
    const out = collector();
    const timer = createPhaseTimer({}, c.now, out.emit);

    c.advance(2_500);
    timer.mark('primeiroChunk');
    timer.finish();

    expect(out.last().marks).toEqual({ primeiroChunk: 2_500 });
  });
});

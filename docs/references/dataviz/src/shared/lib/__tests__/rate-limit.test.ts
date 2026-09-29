import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  rateLimitResponse,
  acquireSlot,
  __resetRateLimit,
} from '../rate-limit';

beforeEach(() => __resetRateLimit());

const CFG = { limit: 3, windowMs: 60_000 };

describe('checkRateLimit', () => {
  it('libera até o limite e barra o excedente', () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit('u', CFG).ok).toBe(true);
    expect(checkRateLimit('u', CFG).ok).toBe(false);
  });

  // Chave por usuário, não por rota: um usuário no limite não pode derrubar os
  // outros. É o erro clássico de limitar por rota.
  it('o consumo de um usuário não afeta outro', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('alice', CFG);
    expect(checkRateLimit('alice', CFG).ok).toBe(false);
    expect(checkRateLimit('bob', CFG).ok).toBe(true);
  });

  it('a janela desliza — passado o intervalo, libera de novo', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('u', CFG, t0);
    expect(checkRateLimit('u', CFG, t0 + 59_000).ok).toBe(false);
    expect(checkRateLimit('u', CFG, t0 + 61_000).ok).toBe(true);
  });

  it('retryAfter aponta para quando a vaga mais antiga expira', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('u', CFG, t0);
    const r = checkRateLimit('u', CFG, t0 + 20_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(40); // 60s de janela - 20s decorridos
  });

  it('retryAfter nunca é 0 quando barrado — 0 mandaria o cliente repetir na hora', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('u', CFG, t0);
    const r = checkRateLimit('u', CFG, t0 + 59_999);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('a rejeição não consome vaga — senão o usuário barrado nunca sairia do bloqueio', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('u', CFG, t0);
    for (let i = 0; i < 50; i++) checkRateLimit('u', CFG, t0 + 1000);
    expect(checkRateLimit('u', CFG, t0 + 61_000).ok).toBe(true);
  });
});

describe('rateLimitResponse', () => {
  it('responde 429 com Retry-After — o header é o que o cliente respeita', async () => {
    const res = rateLimitResponse({ ok: false, retryAfter: 12, remaining: 0 }, 'Devagar.');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect((await res.json()).code).toBe('RATE_LIMITED');
  });
});

describe('acquireSlot', () => {
  it('concede até o teto e recusa depois', () => {
    expect(acquireSlot('pdf', 2)).not.toBeNull();
    expect(acquireSlot('pdf', 2)).not.toBeNull();
    expect(acquireSlot('pdf', 2)).toBeNull();
  });

  it('liberar devolve a vaga', () => {
    const a = acquireSlot('pdf', 1)!;
    expect(acquireSlot('pdf', 1)).toBeNull();
    a();
    expect(acquireSlot('pdf', 1)).not.toBeNull();
  });

  // Um `finally` que roda duas vezes (retry, cleanup duplicado) zeraria o
  // contador e furaria o teto para sempre.
  it('liberar duas vezes não cria vaga extra', () => {
    const a = acquireSlot('pdf', 1)!;
    a();
    a();
    expect(acquireSlot('pdf', 1)).not.toBeNull();
    expect(acquireSlot('pdf', 1)).toBeNull();
  });

  it('buckets diferentes não competem', () => {
    acquireSlot('pdf', 1);
    expect(acquireSlot('pdf', 1)).toBeNull();
    expect(acquireSlot('outro', 1)).not.toBeNull();
  });
});

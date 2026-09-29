import { describe, expect, it } from 'vitest';
import { allowedOrigins, checkLoopbackRequest, playgroundPort } from './loopback-guard';

const PORT = 4111;

describe('playgroundPort', () => {
  it('uses PORT from the CLI and falls back to 4111', () => {
    expect(playgroundPort({ PORT: '4115' })).toBe(4115);
    expect(playgroundPort({})).toBe(4111);
    expect(playgroundPort({ PORT: 'abc' })).toBe(4111);
  });
});

describe('allowedOrigins', () => {
  it('lists the three loopback authorities on the playground port, http and https', () => {
    expect(allowedOrigins(PORT)).toEqual([
      'http://localhost:4111',
      'http://127.0.0.1:4111',
      'http://[::1]:4111',
      'https://localhost:4111',
      'https://127.0.0.1:4111',
      'https://[::1]:4111',
    ]);
  });
});

describe('checkLoopbackRequest', () => {
  it.each(['localhost:4111', '127.0.0.1:4111', '[::1]:4111', 'LOCALHOST:4111'])(
    'accepts Host %s without Origin (same-origin GET, CLI refresh)',
    (host) => {
      expect(checkLoopbackRequest({ host, origin: undefined }, PORT)).toEqual({ ok: true });
    },
  );

  it('accepts the Studio origin', () => {
    expect(checkLoopbackRequest({ host: 'localhost:4111', origin: 'http://localhost:4111' }, PORT)).toEqual({ ok: true });
  });

  it.each([
    ['a foreign host (DNS rebinding)', 'evil.example:4111'],
    ['a foreign host without port', 'evil.example'],
    ['loopback on another port', 'localhost:3005'],
    ['loopback without port', 'localhost'],
    ['a missing Host', undefined],
    ['an empty Host', ''],
  ])('refuses %s', (_label, host) => {
    const result = checkLoopbackRequest({ host, origin: undefined }, PORT);
    expect(result.ok).toBe(false);
  });

  it.each([
    ['a foreign origin', 'https://evil.example'],
    ['a foreign origin on the same port', 'http://evil.example:4111'],
    ['the app dev server', 'http://localhost:3005'],
    ['an opaque origin (sandboxed iframe, file://)', 'null'],
    ['a loopback origin with a path trick', 'http://localhost:4111.evil.example'],
  ])('refuses %s even with a loopback Host', (_label, origin) => {
    const result = checkLoopbackRequest({ host: 'localhost:4111', origin }, PORT);
    expect(result.ok).toBe(false);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { getAllowedEmbedOrigins } from '../embed-origin';

/**
 * O `frame-ancestors` do next.config deriva desta mesma allowlist — a intenção é
 * não existirem duas listas de origem que possam divergir. O teste prende a
 * derivação: sem env, fail-closed.
 */
function frameAncestors(): string {
  const origins = getAllowedEmbedOrigins();
  return origins.length > 0 ? `'self' ${origins.join(' ')}` : "'none'";
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS;
});

describe('frame-ancestors derivado da allowlist de embed', () => {
  it("sem env configurada, nega enquadramento ('none') — mesma postura fail-closed de isAllowedEmbedOrigin", () => {
    expect(frameAncestors()).toBe("'none'");
  });

  it('com origens configuradas, permite exatamente elas mais a própria', () => {
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = 'https://shell.example.com, https://app.parceiro.com';
    expect(frameAncestors()).toBe("'self' https://shell.example.com https://app.parceiro.com");
  });

  it('env só com vírgulas/espaço não vira allowlist vazia permissiva', () => {
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = ' , , ';
    expect(frameAncestors()).toBe("'none'");
  });
});

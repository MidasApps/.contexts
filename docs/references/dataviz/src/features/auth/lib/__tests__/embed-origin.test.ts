import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowedEmbedOrigin } from '../embed-origin';

const OLD = process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS;
beforeEach(() => { process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = 'https://shell.example.com,https://app.parceiro.com'; });
afterEach(() => { process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = OLD; });

describe('isAllowedEmbedOrigin', () => {
  it('aceita origem na allowlist', () => {
    expect(isAllowedEmbedOrigin('https://shell.example.com')).toBe(true);
  });
  it('rejeita origem fora da allowlist', () => {
    expect(isAllowedEmbedOrigin('https://evil.com')).toBe(false);
  });
  it('rejeita quando a allowlist está vazia (fail-closed)', () => {
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = '';
    expect(isAllowedEmbedOrigin('https://shell.example.com')).toBe(false);
  });
});

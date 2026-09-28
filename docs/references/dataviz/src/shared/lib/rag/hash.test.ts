import { describe, it, expect } from 'vitest';
import { contentHash } from './hash';

describe('contentHash', () => {
  it('produces stable sha256 hex of length 64', () => {
    const h = contentHash('hello');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(contentHash('hello')).toBe(h);
  });

  it('differs for different inputs', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });
});

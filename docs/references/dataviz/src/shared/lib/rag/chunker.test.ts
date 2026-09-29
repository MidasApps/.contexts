import { describe, it, expect } from 'vitest';
import { chunkMarkdown, chunkJson } from './chunker';

describe('chunkMarkdown', () => {
  it('splits by H1/H2 headers', () => {
    const md = '# Title\n\npara1\n\n## Section A\n\npara A\n\n## Section B\n\npara B';
    const chunks = chunkMarkdown(md, { maxChars: 1000 });
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.metadata.headingPath).toEqual(['Title']);
    expect(chunks[1]!.metadata.headingPath).toEqual(['Title', 'Section A']);
    expect(chunks[2]!.metadata.headingPath).toEqual(['Title', 'Section B']);
  });

  it('respects maxChars by splitting big sections', () => {
    const big = '# T\n\n' + 'x'.repeat(2500);
    const chunks = chunkMarkdown(big, { maxChars: 1000 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1000);
  });

  it('is deterministic for same input', () => {
    const md = '# A\n\nbody\n\n## B\n\nbody2';
    const a = chunkMarkdown(md, { maxChars: 500 });
    const b = chunkMarkdown(md, { maxChars: 500 });
    expect(a).toEqual(b);
  });

  it('extracts frontmatter when present', () => {
    const md = '---\ntitle: X\n---\n# Title\n\nbody';
    const [c] = chunkMarkdown(md, { maxChars: 500 });
    expect(c!.metadata.frontmatter).toEqual({ title: 'X' });
  });
});

describe('chunkJson', () => {
  it('produces 1 chunk per top-level key', () => {
    const obj = { LTV: 'Loan-to-value...', DSCR: 'Debt service...' };
    const chunks = chunkJson(obj, { keyField: 'term', valueField: 'definition' });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.text).toContain('LTV');
    expect(chunks[1]!.text).toContain('DSCR');
  });
});

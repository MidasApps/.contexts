import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const upsertDocMock = vi.fn();
const getExistingHashesMock = vi.fn();
const embedTextsMock = vi.fn();
const extractChunkMetadataMock = vi.fn();

const kbExistsMock = vi.fn();
vi.mock('@/shared/lib/rag/rag-service', () => ({
  upsertDoc: (...a: unknown[]) => upsertDocMock(...a),
  getExistingHashes: (...a: unknown[]) => getExistingHashesMock(...a),
  knowledgeBaseExists: (...a: unknown[]) => kbExistsMock(...a),
}));
vi.mock('@/shared/lib/rag/embeddings', () => ({
  embedTexts: (...a: unknown[]) => embedTextsMock(...a),
}));
vi.mock('@/shared/lib/rag/metadata-extractor', () => ({
  extractChunkMetadata: (...a: unknown[]) => extractChunkMetadataMock(...a),
}));

describe('ingestDocs (script)', () => {
  let dir: string;
  beforeEach(() => {
    upsertDocMock.mockReset();
    kbExistsMock.mockReset().mockResolvedValue(true);
    getExistingHashesMock.mockReset().mockResolvedValue(new Map());
    embedTextsMock.mockReset();
    extractChunkMetadataMock.mockReset().mockResolvedValue({
      docType: null,
      product: null,
      persona: null,
      regulatoryArea: null,
    });
    vi.resetModules();
    dir = mkdtempSync(join(tmpdir(), 'rag-'));
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'a.md'), '# A\n\nbody A');
    writeFileSync(join(dir, 'b.md'), '# B\n\nbody B');
  });

  it('chunks, embeds and upserts each file', async () => {
    embedTextsMock.mockResolvedValue([[0.1]]);
    const { ingestDocs } = await import('./ingest-rag');
    await ingestDocs({ docsDir: dir, clientId: 'OM', knowledgeBaseId: 'default' });
    expect(upsertDocMock).toHaveBeenCalledTimes(2);
  });

  it('skips chunks whose hash matches existing', async () => {
    const { contentHash } = await import('@/shared/lib/rag/hash');
    const { chunkMarkdown } = await import('@/shared/lib/rag/chunker');
    const { scrubPii } = await import('@/shared/lib/rag/pii-scrubber');
    const text = '# A\n\nbody A';
    const [c] = chunkMarkdown(text, { maxChars: 1500 });
    const scrubbed = scrubPii(c!.text);
    getExistingHashesMock.mockImplementation(async (sp: string) =>
      sp.endsWith('a.md') ? new Map([[0, contentHash(scrubbed)]]) : new Map(),
    );
    embedTextsMock.mockResolvedValue([[0.9]]);
    const { ingestDocs } = await import('./ingest-rag');
    await ingestDocs({ docsDir: dir, clientId: 'OM', knowledgeBaseId: 'default' });
    // a.md skipped, b.md inserted
    expect(upsertDocMock).toHaveBeenCalledTimes(1);
    expect(upsertDocMock.mock.calls[0]![0].sourcePath).toContain('b.md');
  });

  it('tags every chunk with the knowledge base it was given', async () => {
    embedTextsMock.mockResolvedValue([[0.1], [0.2]]);
    const { ingestDocs } = await import('./ingest-rag');
    await ingestDocs({ docsDir: dir, clientId: 'OM', knowledgeBaseId: 'manuais' });
    expect(upsertDocMock.mock.calls.map((c) => (c[0] as { knowledgeBaseId: string }).knowledgeBaseId)).toEqual(['manuais', 'manuais']);
  });

  it('refuses a knowledge base that does not exist, before embedding anything', async () => {
    kbExistsMock.mockResolvedValue(false);
    const { ingestDocs } = await import('./ingest-rag');
    await expect(ingestDocs({ docsDir: dir, clientId: 'OM', knowledgeBaseId: 'nao-existe' })).rejects.toThrow(/nao-existe/);
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(upsertDocMock).not.toHaveBeenCalled();
  });

  it('reads --kb from the command line, defaulting to the default base', async () => {
    const { knowledgeBaseIdFromArgs } = await import('./ingest-rag');
    expect(knowledgeBaseIdFromArgs(['node', 'x', 'docs', '--kb=manuais'])).toBe('manuais');
    expect(knowledgeBaseIdFromArgs(['node', 'x', 'docs'])).toBe('default');
    expect(knowledgeBaseIdFromArgs(['node', 'x', '--kb='])).toBe('default');
  });
});

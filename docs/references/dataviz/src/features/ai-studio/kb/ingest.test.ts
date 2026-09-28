import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

const h = vi.hoisted(() => ({
  extractTextMock: vi.fn(),
  chunkMarkdownMock: vi.fn(),
  scrubPiiMock: vi.fn((s: string) => s),
  embedTextsMock: vi.fn(),
  upsertKbChunksMock: vi.fn(),
  pruneKbChunksMock: vi.fn(),
}));

vi.mock('./extract', () => ({ extractText: h.extractTextMock, extFromFilename: (f: string) => (f.endsWith('.md') ? 'md' : f.endsWith('.pdf') ? 'pdf' : null) }));
vi.mock('@/shared/lib/rag/chunker', () => ({ chunkMarkdown: h.chunkMarkdownMock }));
vi.mock('@/shared/lib/rag/pii-scrubber', () => ({ scrubPii: h.scrubPiiMock, hashId: (s: string) => `h(${s})` }));
vi.mock('@/shared/lib/rag/embeddings', () => ({ embedTexts: h.embedTextsMock }));
vi.mock('./kb-upsert', () => ({ upsertKbChunks: h.upsertKbChunksMock, pruneKbChunks: h.pruneKbChunksMock, deleteKbDocChunks: vi.fn() }));

// in-memory sources via a fake db reused by sources-repo (real module)
type DocData = Record<string, unknown>;
type FakeStore = Record<string, Record<string, DocData>>;
type Filter = [field: string, op: string, val: unknown];

interface FakeDb {
  store: FakeStore;
  collection(name: string): unknown;
}

function makeFakeDb(): FakeDb & FirebaseFirestore.Firestore {
  const store: FakeStore = {};
  return { store, collection(name: string) { store[name] ??= {}; const col = { _f: [] as Filter[], doc(id: string) { return { async get() { const d = store[name][id]; return { exists: d !== undefined, id, data: () => d }; }, async set(v: DocData, o?: { merge?: boolean }) { store[name][id] = o?.merge ? { ...(store[name][id] ?? {}), ...v } : v; }, async delete() { delete store[name][id]; } }; }, where(f: string, op: string, val: unknown) { const c = Object.create(col); c._f = [...col._f, [f, op, val]]; return c; }, async get(this: { _f?: Filter[] }) { const e = Object.entries(store[name]).filter(([, d]) => (this._f ?? []).every(([f, , val]) => d[f] === val)); return { docs: e.map(([id, d]) => ({ id, data: () => d })) }; } }; return col; } } as unknown as FakeDb & FirebaseFirestore.Firestore;
}

import { ingestKbFile } from './ingest';

describe('ingestKbFile', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    db = makeFakeDb();
    Object.values(h).forEach((m: Mock) => m.mockReset?.());
    h.scrubPiiMock.mockImplementation((s: string) => s);
  });

  it('happy path: md → chunks → ready com chunkCount', async () => {
    h.extractTextMock.mockResolvedValueOnce('# Doc\ntexto');
    h.chunkMarkdownMock.mockReturnValueOnce([{ text: 'a', metadata: {} }, { text: 'b', metadata: {} }]);
    h.embedTextsMock.mockResolvedValueOnce([[1, 0], [0, 1]]);
    const out = await ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.md', mimeType: 'text/markdown', bytes: Buffer.from('x'), uploadedBy: 'admin' }, db);
    expect(out.status).toBe('ready');
    expect(out.chunkCount).toBe(2);
    expect(h.upsertKbChunksMock).toHaveBeenCalledOnce();
    expect(h.pruneKbChunksMock).toHaveBeenCalledWith('kb1', expect.any(String), 2, db);
  });

  it('ext inválida → erro lançado ANTES de gravar (rota trata 400)', async () => {
    await expect(ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.docx', mimeType: 'x', bytes: Buffer.from('x') }, db)).rejects.toThrow(/formato/i);
  });

  it('falha de extração → source status=error (não relança)', async () => {
    h.extractTextMock.mockRejectedValueOnce(new Error('PDF sem texto extraível'));
    const out = await ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.pdf', mimeType: 'application/pdf', bytes: Buffer.from('x') }, db);
    expect(out.status).toBe('error');
    expect(out.error).toMatch(/sem texto/i);
    expect(h.upsertKbChunksMock).not.toHaveBeenCalled();
  });

  it('scrubPii aplicado a cada chunk antes de embed', async () => {
    h.extractTextMock.mockResolvedValueOnce('texto');
    h.chunkMarkdownMock.mockReturnValueOnce([{ text: 'cpf 123', metadata: {} }]);
    h.embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    await ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.md', mimeType: 'text/markdown', bytes: Buffer.from('x') }, db);
    expect(h.scrubPiiMock).toHaveBeenCalledWith('cpf 123');
  });
});

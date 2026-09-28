import { describe, it, expect, vi } from 'vitest';

// pdf-parse v2: named export PDFParse (class), no default export.
const { getTextMock, destroyMock } = vi.hoisted(() => ({
  getTextMock: vi.fn(),
  destroyMock: vi.fn(),
}));
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getText() { return getTextMock(); }
    destroy() { return destroyMock(); }
  },
}));

import { extFromFilename, extractText } from './extract';

describe('extFromFilename', () => {
  it('reconhece md/txt/pdf (case-insensitive) e rejeita o resto', () => {
    expect(extFromFilename('a.md')).toBe('md');
    expect(extFromFilename('a.TXT')).toBe('txt');
    expect(extFromFilename('relatorio.pdf')).toBe('pdf');
    expect(extFromFilename('a.docx')).toBeNull();
    expect(extFromFilename('semext')).toBeNull();
  });
});

describe('extractText', () => {
  it('md/txt: decodifica UTF-8', async () => {
    const txt = await extractText(Buffer.from('# Olá\nmercado', 'utf8'), 'md');
    expect(txt).toContain('mercado');
  });

  it('pdf com texto: usa pdf-parse', async () => {
    getTextMock.mockResolvedValueOnce({ text: 'conteúdo do pdf' });
    destroyMock.mockResolvedValueOnce(undefined);
    const txt = await extractText(Buffer.from('%PDF-1.4 fake'), 'pdf');
    expect(txt).toBe('conteúdo do pdf');
  });

  it('pdf sem texto extraível: lança erro claro', async () => {
    getTextMock.mockResolvedValueOnce({ text: '   \n  ' });
    destroyMock.mockResolvedValueOnce(undefined);
    await expect(extractText(Buffer.from('%PDF fake'), 'pdf')).rejects.toThrow(/sem texto extra/i);
  });
});

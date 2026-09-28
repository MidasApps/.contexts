export type KbExt = 'md' | 'txt' | 'pdf';

const ALLOWED: Record<string, KbExt> = { md: 'md', markdown: 'md', txt: 'txt', text: 'txt', pdf: 'pdf' };

export function extFromFilename(filename: string): KbExt | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  const raw = filename.slice(dot + 1).toLowerCase();
  return ALLOWED[raw] ?? null;
}

export async function extractText(bytes: Buffer, ext: KbExt): Promise<string> {
  if (ext === 'md' || ext === 'txt') {
    return bytes.toString('utf8');
  }
  // pdf
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const text = (result?.text ?? '').trim();
    if (!text) {
      throw new Error('PDF sem texto extraível (escaneado/imagem não suportado)');
    }
    return text;
  } finally {
    await parser.destroy();
  }
}

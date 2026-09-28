import { NextRequest, NextResponse } from 'next/server';
import { readAndConsumeExportFile } from '@/shared/lib/export/temp-files';

// Only allow filenames like: word-chars, hyphens, followed by .pdf or .csv
const SAFE_FILENAME_RE = /^[\w-]+\.(pdf|csv)$/;

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
};

// Auth note: Browser anchor clicks cannot send auth headers, so this route is
// unauthenticated. A justificativa é o nome ser um UUID imprevisível E o arquivo
// ser efêmero — o que só passou a ser verdade quando `readAndConsumeExportFile`
// passou a apagar o arquivo após servi-lo (link de uso único). Antes disso o
// arquivo ficava indefinidamente, e a segunda metade da justificativa era falsa.
// Ver `shared/lib/export/temp-files.ts`.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // Sanitize: reject anything that doesn't match the safe pattern
  if (!SAFE_FILENAME_RE.test(filename)) {
    return NextResponse.json(
      { error: 'Invalid filename. Only alphanumeric filenames with .pdf or .csv extension are allowed.' },
      { status: 400 },
    );
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readAndConsumeExportFile(filename);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to read file.' }, { status: 500 });
  }

  const extension = filename.split('.').pop()!;
  const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';

  // Convert to ArrayBuffer for BodyInit compatibility
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(fileBuffer.byteLength),
      // Prevent caching of potentially sensitive reports
      'Cache-Control': 'no-store',
    },
  });
}

import 'server-only';
import { readFile, writeFile, unlink, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Arquivos temporários de export (PDF/CSV).
 *
 * Fonte ÚNICA do diretório e da política de vida do arquivo — a rota que grava
 * e a que serve precisam concordar, e antes cada uma tinha seu próprio literal
 * `'/tmp'`.
 *
 * Por que existe (achado R11 da revisão de 2026-08-04): o `/api/download/[filename]`
 * é NÃO-autenticado de propósito — o clique num `<a download>` não manda header de
 * Authorization. A justificativa registrada na rota é que o arquivo é efêmero e o
 * nome é um UUID imprevisível. Só que nada no repositório apagava esses arquivos:
 * na prática um relatório com dado de cliente ficava acessível sem autenticação
 * por tempo indeterminado, e o disco do container só crescia.
 *
 * Política: o link vale UMA vez (o arquivo é apagado depois de servido) e uma
 * varredura remove o que nunca foi baixado. Assim a justificativa da rota passa a
 * ser verdadeira em vez de aspiracional.
 */

/** Janela para arquivo gerado e nunca baixado (usuário cancelou o download). */
const TTL_MS = 15 * 60 * 1000;

/**
 * Só varremos arquivos que ESTA aplicação cria: `<uuid v4>.pdf|csv`. O diretório
 * temporário é compartilhado com o resto do sistema — apagar por extensão
 * apagaria arquivo de terceiro.
 */
const OWNED_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|csv)$/;

/**
 * `tmpdir()` em vez de `'/tmp'` literal: em Linux (produção) devolve `/tmp`, então
 * nada muda lá; em Windows devolve o temp real, onde `'/tmp'` virava `C:\tmp`.
 */
export function exportDir(): string {
  return tmpdir();
}

export function isOwnedExportFile(filename: string): boolean {
  return OWNED_FILE_RE.test(filename);
}

export async function writeExportFile(filename: string, data: Buffer): Promise<void> {
  await writeFile(join(exportDir(), filename), data);
}

/**
 * Lê e apaga: o link de download vale uma vez só.
 *
 * O unlink é best-effort e acontece DEPOIS da leitura — se falhar, o usuário
 * ainda recebe o arquivo e a varredura por TTL pega o resíduo depois. Falhar o
 * download por causa da limpeza seria trocar um problema de higiene por um bug
 * visível ao usuário.
 */
export async function readAndConsumeExportFile(filename: string): Promise<Buffer> {
  const filePath = join(exportDir(), filename);
  const buffer = await readFile(filePath);
  await unlink(filePath).catch(() => {});
  return buffer;
}

/**
 * Remove os arquivos desta aplicação que passaram do TTL — cobre o caso do
 * arquivo gerado e nunca baixado, que o consume acima jamais alcança.
 *
 * Roda no caminho de gravação (barato: um readdir) em vez de num timer, porque
 * timer não sobrevive a container que escala para zero.
 */
export async function sweepStaleExportFiles(now = Date.now()): Promise<number> {
  const dir = exportDir();
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (!isOwnedExportFile(name)) continue;
    const filePath = join(dir, name);
    try {
      const info = await stat(filePath);
      if (now - info.mtimeMs > TTL_MS) {
        await unlink(filePath);
        removed++;
      }
    } catch {
      // Arquivo sumiu no meio (outro request consumiu) — nada a fazer.
    }
  }
  return removed;
}

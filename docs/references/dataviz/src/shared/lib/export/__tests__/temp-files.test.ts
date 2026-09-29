import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, utimes, access, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  exportDir,
  isOwnedExportFile,
  writeExportFile,
  readAndConsumeExportFile,
  sweepStaleExportFiles,
} from '../temp-files';

const created: string[] = [];

function newExportName(ext = 'pdf') {
  const name = `${randomUUID()}.${ext}`;
  created.push(name);
  return name;
}

async function exists(name: string): Promise<boolean> {
  try {
    await access(join(exportDir(), name));
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((n) => unlink(join(exportDir(), n)).catch(() => {})));
});

describe('isOwnedExportFile', () => {
  it('reconhece os arquivos que esta aplicação cria', () => {
    expect(isOwnedExportFile('7c9e6679-7425-40de-944b-e07fc1f90ae7.pdf')).toBe(true);
    expect(isOwnedExportFile('7c9e6679-7425-40de-944b-e07fc1f90ae7.csv')).toBe(true);
  });

  // O diretório temporário é compartilhado com o resto do sistema: varrer por
  // extensão apagaria arquivo de terceiro.
  it.each([
    'relatorio.pdf',
    'notas.csv',
    '7c9e6679-7425-40de-944b-e07fc1f90ae7.txt',
    '7c9e6679.pdf',
    '../../etc/passwd.pdf',
  ])('não reivindica %s', (name) => {
    expect(isOwnedExportFile(name)).toBe(false);
  });
});

describe('readAndConsumeExportFile', () => {
  it('devolve o conteúdo e apaga o arquivo — o link vale uma vez só', async () => {
    const name = newExportName();
    await writeExportFile(name, Buffer.from('conteudo-do-pdf'));

    const buf = await readAndConsumeExportFile(name);
    expect(buf.toString()).toBe('conteudo-do-pdf');
    expect(await exists(name)).toBe(false);
  });

  it('a segunda tentativa falha com ENOENT — que a rota traduz em 404', async () => {
    const name = newExportName();
    await writeExportFile(name, Buffer.from('x'));
    await readAndConsumeExportFile(name);

    await expect(readAndConsumeExportFile(name)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('sweepStaleExportFiles', () => {
  it('remove export vencido e preserva o recém-criado', async () => {
    const stale = newExportName();
    const recent = newExportName();
    await writeExportFile(stale, Buffer.from('velho'));
    await writeExportFile(recent, Buffer.from('novo'));

    // Envelhece o mtime em 1h — além do TTL de 15 min.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(join(exportDir(), stale), oneHourAgo, oneHourAgo);

    await sweepStaleExportFiles();

    expect(await exists(stale)).toBe(false);
    expect(await exists(recent)).toBe(true);
  });

  it('não toca em arquivo alheio, mesmo vencido e com a mesma extensão', async () => {
    const foreign = `relatorio-de-outro-sistema-${randomUUID()}.pdf`;
    created.push(foreign);
    await writeFile(join(exportDir(), foreign), Buffer.from('nao-e-nosso'));
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(join(exportDir(), foreign), old, old);

    await sweepStaleExportFiles();

    expect(await exists(foreign)).toBe(true);
  });

  it('não explode quando o diretório não pode ser lido', async () => {
    await expect(sweepStaleExportFiles()).resolves.toBeTypeOf('number');
  });
});

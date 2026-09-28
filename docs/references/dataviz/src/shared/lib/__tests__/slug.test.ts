import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugify, uniqueSlug } from '../slug';
import { FirestoreDocId } from '@/shared/schemas/identifier';

/**
 * Guarda de legibilidade, não de comportamento.
 *
 * A faixa de diacríticos funciona igual escrita com as marcas combinantes
 * cruas (`U+0300`–`U+036F`) ou com escapes. A diferença é que, crua, ela é
 * INVISÍVEL: no editor o colchete parece vazio, e uma ferramenta que reescreva
 * o arquivo pode comê-la sem deixar rastro no diff — caso em que `slugify`
 * para de tirar acento e nenhum teste de comportamento aponta a linha culpada.
 *
 * Este teste olha os bytes do fonte porque é a única forma de exigir a versão
 * legível. Ele NÃO protege contra um bug de runtime; protege contra um trecho
 * de código que ninguém consegue revisar.
 */
describe('fonte de slug.ts', () => {
  it('não contém marca combinante solta — a faixa vai por escape', () => {
    // `process.cwd()` e não `import.meta.url`: o vitest transforma o módulo e
    // `import.meta.url` deixa de ser uma URL `file:` aqui.
    const source = readFileSync(join(process.cwd(), 'src/shared/lib/slug.ts'), 'utf8');
    const combining = [...source].filter((c) => {
      const cp = c.codePointAt(0)!;
      return cp >= 0x0300 && cp <= 0x036f;
    });
    expect(combining).toEqual([]);
  });
});

describe('slugify', () => {
  // O bug que motivou a unificação: quatro cópias normalizavam sem remover o
  // diacrítico separado, e todo nome em português saía quebrado.
  it('remove acento em vez de virar hífen', () => {
    expect(slugify('Evolução de Obra')).toBe('evolucao-de-obra');
    expect(slugify('Situação de Certidões')).toBe('situacao-de-certidoes');
    expect(slugify('Plano Empresário')).toBe('plano-empresario');
    expect(slugify('Ação & Inadimplência')).toBe('acao-inadimplencia');
  });

  it('minúsculas e espaços viram kebab-case', () => {
    expect(slugify('Fluxo de Caixa')).toBe('fluxo-de-caixa');
  });

  it('colapsa pontuação repetida num hífen só', () => {
    expect(slugify('A  --  B')).toBe('a-b');
    expect(slugify('Entradas & Saídas')).toBe('entradas-saidas');
  });

  it('não sobra hífen nas pontas', () => {
    expect(slugify('  Recebíveis  ')).toBe('recebiveis');
    expect(slugify('...PDD...')).toBe('pdd');
  });

  // Vira id de documento; id vazio é erro do Firestore, e id começando por
  // hífen ou com 200 caracteres é recusado por `FirestoreDocId`.
  it('produz sempre um id válido, ou nada', () => {
    const cases = [
      'Evolução de Obra',
      'Fluxo de Caixa 2026',
      'A'.repeat(300),
      '...PDD...',
      'Ação & Inadimplência',
    ];
    for (const c of cases) {
      const s = slugify(c);
      expect(FirestoreDocId.safeParse(s).success, `${c} → ${s}`).toBe(true);
    }
  });

  it('respeita o teto de tamanho sem deixar hífen no corte', () => {
    const s = slugify('palavra '.repeat(40));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });

  // Nome só com emoji não produz slug. Devolver '' é deliberado — quem grava
  // decide o fallback — mas '' NÃO pode virar id, e é o que o teste trava.
  it('devolve vazio quando não sobra caractere aproveitável', () => {
    expect(slugify('🎉🎉')).toBe('');
    expect(slugify('...')).toBe('');
    expect(FirestoreDocId.safeParse('').success).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('sem colisão, usa o slug direto', () => {
    expect(uniqueSlug('Fluxo de Caixa', [])).toBe('fluxo-de-caixa');
  });

  // `.doc(id).set()` sobre id existente SUBSTITUI o documento. Sem sufixo,
  // criar "Recebíveis" de novo apagaria a página que já estava lá.
  it('colisão ganha sufixo em vez de sobrescrever', () => {
    expect(uniqueSlug('Recebíveis', ['recebiveis'])).toBe('recebiveis-2');
    expect(uniqueSlug('Recebíveis', ['recebiveis', 'recebiveis-2'])).toBe('recebiveis-3');
  });

  it('pula buracos na sequência', () => {
    expect(uniqueSlug('X', ['x', 'x-3'])).toBe('x-2');
  });

  it('nome sem slug possível cai no fallback, e o fallback também desempata', () => {
    expect(uniqueSlug('🎉', [])).toBe('pagina');
    expect(uniqueSlug('🎉', ['pagina'])).toBe('pagina-2');
    expect(uniqueSlug('🎉', [], 'relatorio')).toBe('relatorio');
  });

  it('o resultado é sempre id válido, inclusive com sufixo', () => {
    const taken = ['recebiveis'];
    expect(FirestoreDocId.safeParse(uniqueSlug('Recebíveis', taken)).success).toBe(true);
    expect(FirestoreDocId.safeParse(uniqueSlug('🎉', [])).success).toBe(true);
  });
});

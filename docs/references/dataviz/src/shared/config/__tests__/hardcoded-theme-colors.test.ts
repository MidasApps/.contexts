import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nenhuma superfície de UI pinta com branco fixo.
 *
 * `text-white/50` não é uma cor clara: é branco literal, e o tema claro tem
 * fundo branco puro (`--color-background: oklch(100% 0 0)`). O texto some.
 * A landing inteira nasceu assim — medido no navegador em tema claro, 241 dos
 * 259 elementos com texto ficavam abaixo de 3:1, e dezenas exatamente em 1,0:
 * branco sobre branco.
 *
 * `foreground` é a troca certa, e não uma cor cinza escolhida à mão: em tema
 * escuro ele vale `oklch(100% 0 0)` — branco puro, o MESMO valor que
 * `text-white` produzia. A substituição é visualmente nula no escuro e é o
 * conserto inteiro no claro.
 *
 * O guard é estático porque o defeito é estático: happy-dom não resolve classe
 * do Tailwind em cor, então um teste de render não veria nada. O que se vigia
 * aqui é o texto-fonte.
 */

/** Onde a UI vive. Fora daqui não há classe de Tailwind para vigiar. */
const ROOTS = ['src/pages', 'src/widgets', 'src/features', 'src/shared/ui', 'app'];

/**
 * Branco translúcido em utilitária de cor.
 *
 * O critério é SUMIR, não ser fixo. Branco a 4% desenha uma superfície sobre o
 * fundo quase-preto do tema escuro e nada sobre o branco do claro; `text-white/50`
 * é o mesmo defeito em texto. Já `bg-black/50` escurece o que está atrás nos DOIS
 * temas — é o overlay de diálogo, e continua certo onde está.
 *
 * Só as formas com barra: `text-white` sólido sobre um fundo colorido fixo é
 * legítimo (o botão de marca), e julgar isso exige o contexto que um regex
 * não tem.
 */
const HARDCODED_COLOR = /\b(?:text|bg|border|ring|fill|stroke|from|via|to|shadow|divide|outline)-white\/(?:\[[\d.]+\]|\d+)/g;

/**
 * As duas formas que escaparam da primeira versão deste guard, e o que cada
 * uma custou:
 *
 * - `from-white` SÓLIDO num gradiente de `bg-clip-text`. Sem barra, passava
 *   pelo regex acima — e era o valor de cada cartão do mock ("R$ 108,04 mi"),
 *   branco sobre card branco no tema claro.
 * - `rgba(255,255,255,…)` em `style` inline, que nem é classe. Era o selo
 *   neutro de variação: um "— 0%" que ninguém via.
 */
const SOLID_WHITE_IN_GRADIENT = /\b(?:from|via|to)-white\b(?!\/)/g;
const INLINE_WHITE = /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g;

/**
 * Exceções, cada uma com o motivo.
 *
 * O polegar do interruptor é branco sobre o trilho COLORIDO (primário quando
 * ligado, `muted` quando desligado) — nos dois temas ele contrasta com o
 * trilho, não com o fundo da página. Trocá-lo por `foreground` o pintaria de
 * quase-preto no tema claro, sumindo dentro do trilho laranja.
 */
const ALLOWED = new Set(['src/shared/ui/switch.tsx']);

function uiFiles(): string[] {
  return ROOTS.flatMap((root) =>
    globSync('**/*.tsx', { cwd: join(process.cwd(), root) })
      .map((relativePath) => `${root}/${relativePath.replaceAll('\\', '/')}`),
  ).filter((filePath) => !filePath.includes('__tests__') && !filePath.endsWith('.test.tsx'));
}

describe('cores fixas de tema', () => {
  it('nenhuma utilitária translúcida de branco ou preto sobrevive na UI', () => {
    const offenders: string[] = [];

    for (const filePath of uiFiles()) {
      if (ALLOWED.has(filePath)) continue;
      const source = readFileSync(join(process.cwd(), filePath), 'utf8');
      const findings = [
        ...(source.match(HARDCODED_COLOR) ?? []),
        ...(source.match(SOLID_WHITE_IN_GRADIENT) ?? []),
        ...(source.match(INLINE_WHITE) ?? []),
      ];
      if (findings.length > 0) offenders.push(`${filePath}: ${[...new Set(findings)].join(', ')}`);
    }

    expect(
      offenders,
      'Use `foreground`/`background` no lugar de `white`/`black`: em tema escuro '
        + '`foreground` JÁ é branco puro, então nada muda ali — e no claro o texto '
        + 'deixa de sumir. Exceção real vai em PERMITIDOS, com o motivo.',
    ).toEqual([]);
  });

  /* A lista de exceções não pode envelhecer em silêncio: arquivo removido ou
     renomeado deixaria uma permissão pendurada, e a próxima cor fixa entraria
     por ela sem ninguém ver. */
  it('toda exceção aponta para um arquivo que existe e ainda precisa dela', () => {
    for (const filePath of ALLOWED) {
      const source = readFileSync(join(process.cwd(), filePath), 'utf8');
      expect(source.match(HARDCODED_COLOR), `${filePath} não usa mais cor fixa — tire da lista`)
        .not.toBeNull();
    }
  });
});

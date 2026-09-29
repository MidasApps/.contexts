'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextBlock as TextBlockType } from '@/shared/config/agents/types';

/**
 * Estilo do markdown renderizado.
 *
 * Aqui estava `prose prose-invert prose-sm`, que não fazia nada: o plugin
 * `@tailwindcss/typography` não está instalado (nem em `package.json` nem via
 * `@plugin` no `globals.css`), então nenhuma das três classes gera CSS. O
 * `prose-invert` era pior que inerte — anunciava "texto claro sobre fundo
 * escuro" num app que tem tema claro também.
 *
 * O que vale é utilitário de verdade sobre token semântico: `text-foreground`,
 * `border-border`, `bg-muted` e `text-primary` trocam com o `data-theme`
 * sozinhos, então a mesma string serve aos dois temas. O reset do Tailwind
 * zera marcador de lista e tamanho de heading, por isso eles são declarados
 * explicitamente — sem isso, um `##` do assistente saía igual a um parágrafo.
 */
const MARKDOWN_CLASSES = [
  'text-sm leading-relaxed text-foreground/90',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-foreground',
  '[&_p]:mb-2 [&_p:last-child]:mb-0',
  '[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1',
  '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-3 [&_hr]:border-border',
  '[&_table]:mb-2 [&_table]:w-full [&_table]:text-left',
  '[&_th]:border-b [&_th]:border-border [&_th]:py-1 [&_th]:pr-3 [&_th]:font-medium [&_th]:text-foreground',
  '[&_td]:border-b [&_td]:border-border [&_td]:py-1 [&_td]:pr-3',
].join(' ');

export function TextBlock({ block }: { block: TextBlockType }) {
  if (!block.content?.trim()) {
    return (
      <div className="px-1 text-[11px] text-muted-foreground/40 italic">
        Sem conteúdo
      </div>
    );
  }

  return (
    <div className={`max-w-none px-1 ${MARKDOWN_CLASSES}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
    </div>
  );
}

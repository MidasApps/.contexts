'use client';

import { FileText, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type ColumnTab = 'relatorio' | 'assistente';

const TABS = [
  { id: 'relatorio' as const, label: 'Relatório', Icon: FileText },
  { id: 'assistente' as const, label: 'Assistente', Icon: Sparkles },
];

/**
 * Troca entre o relatório e o assistente, dentro da mesma coluna.
 *
 * O chat flutuava sobre o conteúdo e cobria os gráficos justamente na hora de
 * editar a página. Agora as duas coisas dividem a coluna da esquerda, que é
 * cromo: o relatório nunca é coberto, e a largura dele nunca muda — a coluna
 * é a mesma nas duas abas.
 *
 * A aba se chama "Relatório", e não "Páginas", porque é o relatório inteiro
 * que ela mostra: qual é, no dropdown, e as páginas dele logo abaixo. Com o
 * dropdown ACIMA deste controle, a coluna afirmava que o relatório governava
 * as duas abas — e a lista que ele governava tinha outro nome.
 *
 * `aria-pressed` em dois botões, e não `role="tablist"`: tab exige gestão de
 * foco por setas e `aria-controls` apontando para painéis irmãos, e aqui o
 * que muda é o conteúdo da coluna inteira. Dois botões de estado dizem a
 * mesma coisa com menos maquinaria.
 */
export function TabSelector({
  tab,
  onSwitch,
  className,
}: {
  tab: ColumnTab;
  onSwitch: (activeTab: ColumnTab) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Mostrar relatório ou assistente"
      /* Mesma forma do seletor de período na `PageToolbar`: pílula com borda,
         fundo `muted/40` e o ativo em `bg-primary/15`. O projeto já tinha um
         controle de dois segmentos — inventar um segundo, com sombra e canto
         diferentes, era dar duas aparências à mesma ideia.

         `w-full` com os segmentos em `flex-1`: o controle ocupa a coluna e a
         divide em metades iguais. Encolhido ao texto, "Relatório" e
         "Assistente" têm larguras diferentes, e o alvo de clique de uma aba
         ficava menor que o da outra sem nada na tela que explicasse. */
      className={cn(
        'flex w-full items-center rounded-full border border-border bg-muted/40 p-0.5',
        className,
      )}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = tab === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            /* Clicar na aba corrente não é troca: re-renderizar o chat
               apagaria o que estivesse digitado no campo. */
            onClick={() => { if (!isActive) onSwitch(id); }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground/60 hover:text-muted-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

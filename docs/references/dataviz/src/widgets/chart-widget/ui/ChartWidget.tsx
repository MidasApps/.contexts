'use client';

import { useState, cloneElement, isValidElement } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { AISidebar } from '@/widgets/ai-sidebar';
import { useIsMounted } from '@/shared/hooks/useIsMounted';

interface ChartWidgetProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  className?: string;
  height?: number;
  ariaLabel?: string;
  expandable?: boolean;
  /**
   * Marcador ao lado do título — hoje, o período comparativo quando ele não
   * cabe na legenda. Fica no cabeçalho, e não dentro da plotagem, porque
   * responde "o que estou vendo", não "quanto vale este ponto".
   */
  badge?: React.ReactNode;
  /** When true, show an empty state instead of the chart (field not available for this client) */
  unavailable?: boolean;
  children: React.ReactNode;
}

export function ChartWidget({
  title,
  subtitle,
  loading,
  className,
  height = 280,
  ariaLabel,
  expandable = true,
  badge,
  unavailable,
  children,
}: ChartWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const isMounted = useIsMounted();

  if (unavailable) {
    return (
      <div className={cn('animate-scale-in', className)}>
        <div data-casca="" className="rounded-2xl bg-popover border border-border p-5 h-full flex flex-col items-center justify-center text-center" style={{ minHeight: height }}>
          <h3 className="text-sm font-semibold text-muted-foreground/80 mb-1">{title}</h3>
          <p className="text-[10px] text-muted-foreground/40">Dado não disponível para este cliente</p>
        </div>
      </div>
    );
  }

  const aiPrompt = `Analise o gráfico "${title}"${subtitle ? ` (${subtitle})` : ''}. Cruze com os demais indicadores do dashboard e dê uma interpretação concisa: padrões, correlações, pontos de atenção e o que significa para a carteira.`;

  return (
    <>
      <div
        onClick={expandable && !loading ? (e: React.MouseEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, a, input, select, [role="button"], [data-no-expand]')) return;
          setExpanded(true);
        } : undefined}
        // A supressão de foco que existia aqui (`[&_*]:outline-none`,
        // `[&_*:focus]:ring-0`) era para os SVG do Recharts, mas valia para TODO
        // descendente — inclusive o botão "Ver detalhes" abaixo, que ficava
        // focável e invisível. O Recharts já é tratado por regra própria em
        // globals.css (`.recharts-*`, `[role="img"]`), então não precisa disto.
        /*
          `h-full` AQUI, na raiz, e não só na casca de dentro.

          Sem isto a cadeia de altura quebra no primeiro elo: a célula do grid
          estica, mas esta div é um bloco comum com `height: auto`, e o
          `h-full` do card lá dentro passa a resolver contra "altura do
          conteúdo" em vez da altura da célula. O resultado é um card que ignora
          o espaço que recebeu — que foi exatamente o que fez a distribuição
          vertical parecer não acontecer.
        */
        className={cn(
          'group relative h-full rounded-2xl animate-scale-in',
          expandable && !loading && 'cursor-pointer',
          className,
        )}
      >
        {/*
          `flex flex-col` na casca e `flex-1` no conteúdo: é o que dá
          RESPONSIVIDADE VERTICAL ao gráfico.

          A linha do relatório é um grid que estica todos os itens até a altura
          do mais alto — então um gráfico ao lado de uma tabela de 20 linhas
          recebe um card alto. Com a área de plotagem em 340px fixos, ele
          desenhava os mesmos 340 e deixava o resto do card em branco. Agora a
          plotagem cresce com a linha, e a `height` vira o PISO do conteúdo, não
          o teto.
        */}
        {/* Hover em cinza, igual ao card de bloco (`block-shell`): a borda
            ganha contraste, não a cor da marca. */}
        <div data-casca="" className="flex h-full flex-col rounded-2xl bg-popover p-5 border border-border transition-colors group-hover:border-muted-foreground/40">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {badge}
              </div>
              {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            {expandable && !loading && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={`Ver detalhes de ${title}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Ver detalhes
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
          {loading || !isMounted ? (
            <Skeleton className="w-full flex-1 rounded-lg bg-muted/40" style={{ minHeight: height }} />
          ) : (
            // `minHeight`, não `height`: a altura é o espaço RESERVADO para o
            // conteúdo, não um teto. Como `height` fixo, o donut estourava a
            // caixa — a rosca ocupa 160px e cada card lateral ~76px empilhado,
            // então a partir de 4 fatias o conteúdo passava dos 240px
            // reservados e vazava por cima do card seguinte.
            //
            // `min-h-0` junto do `flex-1` não é redundante: item de flex tem
            // `min-height: auto` por padrão e se recusa a encolher abaixo do
            // conteúdo, o que faz o SVG do Recharts empurrar o card em vez de
            // caber nele.
            <div
              role="img"
              aria-label={ariaLabel || title}
              className="min-h-0 flex-1"
              style={{ minHeight: height }}
            >
              {children}
            </div>
          )}
        </div>
      </div>

      {expandable && (
        <Dialog open={expanded} onOpenChange={() => setExpanded(false)}>
          {/* Lado a lado a partir de `lg`: gráfico à esquerda, conversa à
              direita. Empilhado, o gráfico comia a metade de cima da tela e a
              conversa ficava espremida embaixo — e é a conversa que cresce
              enquanto se pergunta. Abaixo de `lg` não cabem duas colunas
              legíveis, então volta a empilhar. */}
          <DialogContent className="w-[94vw] max-w-[1440px] lg:w-[88vw] bg-popover p-0 gap-0 h-[90vh] max-h-[860px]">
            <div className="flex h-full flex-col overflow-hidden lg:flex-row">
              {/* Gráfico */}
              <div className="flex h-[42%] min-h-0 min-w-0 shrink-0 flex-col border-b border-border p-5 pb-3 lg:h-full lg:flex-1 lg:shrink lg:border-b-0 lg:border-r">
                <DialogHeader className="shrink-0 pb-3">
                  <DialogTitle className="text-foreground">{title}</DialogTitle>
                  {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
                </DialogHeader>
                {/* `flex-1 min-h-0` em vez de altura fixa: em coluna o gráfico
                    ocupa a faixa de cima, lado a lado ele ocupa a coluna
                    inteira. O `height: '100%'` no filho já existia.
                    Centralizado porque nem todo conteúdo estica — o donut tem
                    tamanho próprio e ficava encostado no topo, com metade da
                    coluna vazia embaixo. Quem estica (`h-full w-full`) ignora
                    a centralização e preenche. */}
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  {isValidElement(children)
                    ? cloneElement(children as React.ReactElement<{ height?: string }>, { height: '100%' })
                    : children}
                </div>
              </div>

              {/* Conversa. `pt-6` no topo da coluna: o botão de fechar do
                  diálogo é absoluto no canto superior direito, e a primeira
                  mensagem passava por baixo dele. */}
              <div className="flex min-h-0 flex-1 flex-col pt-6 lg:h-full lg:w-[420px] lg:flex-none xl:w-[460px]">
                {/* `focusedIndicator` chega ao /api/chat e entra no contexto do
                    agente: sem ele a pergunta de acompanhamento ("e por quê?")
                    perde de qual gráfico se está falando. */}
                {expanded && (
                  <AISidebar
                    open={expanded}
                    onClose={() => {}}
                    embedded
                    initialPrompt={aiPrompt}
                    focusedIndicator={{ name: title }}
                  />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

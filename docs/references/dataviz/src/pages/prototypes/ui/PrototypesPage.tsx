'use client';

import { useMemo, useState } from 'react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { CanvasBlockRenderer } from '@/pages/explore/ui/CanvasBlockRenderer';
import { useReportData } from '@/shared/hooks/useReportData';
import { useAppStore } from '@/shared/stores/app-store';
import { useActiveDataset } from '@/shared/hooks/useActiveClient';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { HEIGHT, blockFamilyOf } from '@/pages/explore/ui/blocks/block-shell';
import { widthOf, blockSpec } from '@/features/report-authoring/schema/block-specs';
import { withComparison } from './sample-comparison';
import { supportsComparison } from '@/shared/config/agents/comparison';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { cn } from '@/shared/lib/utils';
import {
  LAYOUT_SCENARIOS, PROPORTION_ROWS, WITHOUT_METRIC_YET, ALL_EXAMPLES,
  type BlockExample,
} from './sample-blocks';
import { BlockExplorer } from './BlockExplorer';
import { LayoutScenarios } from './LayoutScenarios';
import { BlockStates } from './BlockStates';

/**
 * Galeria de componentes — a página de validação de UX/UI.
 *
 * **Por que uma rota e não um HTML em `docs/`.** Um protótipo escrito à mão em
 * HTML é um REDESENHO: ele reproduz o que o autor acha que o componente faz, e
 * é exatamente por isso que o anterior não podia ser usado para julgar
 * fidelidade. Aqui os blocos passam pelo mesmo `CanvasBlockRenderer`, o mesmo
 * grid de 6 colunas, os mesmos tokens e o mesmo `useReportData` do relatório.
 * Se um bloco desenhar errado nesta página, desenha errado em produção.
 *
 * A largura do container replica a do relatório com a barra lateral aberta
 * (~880px úteis), que é a medida da qual saem todas as larguras mínimas do
 * `block-specs.ts`. Sem isso a galeria mostraria tudo mais folgado do que é.
 */

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3',
  4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
};

function Tag({ children, tone = 'neutro' }: {
  children: React.ReactNode;
  tone?: 'neutro' | 'alerta' | 'ok';
}) {
  return (
    <span className={cn(
      'inline-block rounded-full border px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide',
      tone === 'neutro' && 'border-border bg-muted text-muted-foreground',
      tone === 'ok' && 'border-success/40 bg-success/10 text-success',
      tone === 'alerta' && 'border-warning/40 bg-warning/10 text-warning',
    )}>
      {children}
    </span>
  );
}

/** A ficha técnica do bloco — lida do contrato, não escrita à mão. */
function BlockCardEntry({ example, comparison }: { example: BlockExample; comparison: boolean }) {
  const { block } = example;
  const spec = blockSpec(block.type);
  const range = widthOf(block.type, {});
  const family = blockFamilyOf(block as { type: string; display?: string });

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">{block.type}</code>
      <span className="text-xs text-muted-foreground">{spec.label}</span>
      <Tag>{block.colSpan ?? range.recommended}/6</Tag>
      <Tag>{family ? `piso ${HEIGHT[family]}px` : 'sem piso'}</Tag>
      {example.realData
        ? <Tag tone="ok">dado real</Tag>
        : <Tag tone="alerta">ilustrativo — {example.whyIllustrative}</Tag>}
      {/* Só com o modo ligado: fora dele a etiqueta seria ruído em 15 fichas
          sobre um recurso que ninguém pediu para ver naquele momento. */}
      {comparison && (
        supportsComparison(block.type)
          ? <Tag tone="ok">com comparativo</Tag>
          : <Tag>sem comparativo</Tag>
      )}
    </div>
  );
}

export function PrototypesPage() {
  const [reportWidth, setReportWidth] = useState(true);
  const [comparison, setComparison] = useState(false);

  // Um `blockMap` igual ao de um relatório de verdade — é o que o hook espera.
  const blockMap = useMemo(() => {
    const blockMapById: Record<string, CanvasBlock> = {};
    for (const e of ALL_EXAMPLES) blockMapById[e.block.id] = e.block;
    return blockMapById;
  }, []);

  const { populatedBlockMap, loading, errorsByMetric, awaitingFirstData } = useReportData(blockMap);
  /*
   * Enquanto a primeira resposta não chega, os blocos ficam com o que veio do
   * template — que num gauge é `value: 0` e num covenant de mínimo 1,20x seria
   * pintado de rompimento. `awaitingFirstData` é o mesmo sinal que o relatório
   * usa para segurar isso.
   */
  /*
   * ─── Por que a galeria travava em esqueleto ───
   *
   * `awaitingFirstData` significa "há métrica declarada e ainda não há resposta
   * PARA ESTES blocos". Ele fica `true` para sempre quando a busca não chega
   * nem a disparar — e o `useReportData` tem duas guardas silenciosas
   * (`!activeClientId` e `!dateRange.end`) que voltam sem log nenhum.
   *
   * A cadeia é: cliente carregado → dataset do cliente → opções de filtro →
   * `dateRange.end`. Dentro do DashboardLayout tudo isso acontece de passagem;
   * aqui, não. Se um elo falta, o certo é DIZER qual — e desenhar os blocos
   * vazios, que é o suficiente para julgar desenho e proporção, em vez de
   * esqueleto infinito que não deixa ver nada.
   */
  const clientsStatus = useAppStore((s) => s.clientsStatus);
  const activeClientId = useAppStore((s) => s.activeClientId);
  const dataset = useActiveDataset();
  const { dateRange } = useDataFilters();

  const blocker =
    clientsStatus === 'loading' ? null
      : !activeClientId ? 'Nenhum cliente ativo — a galeria roda fora do DashboardLayout, que é quem normalmente seleciona um.'
      : !dataset ? `O cliente "${activeClientId}" não resolve um dataset (sem \`dataset\` nem \`productBindings\`).`
      : !dateRange.end ? 'As opções de filtro não voltaram, então não há período — e a busca de métricas exige um.'
      : null;

  const rawResolved = populatedBlockMap ?? blockMap;
  /*
   * O modo comparativo passa o dado pelas MESMAS funções do relatório. Um
   * bloco que não muda aqui é um bloco que não muda lá — que é a resposta que
   * esta página deve dar, sem precisar de texto explicando.
   */
  const resolved = useMemo(() => {
    if (!comparison) return rawResolved;
    const output: Record<string, CanvasBlock> = {};
    for (const [id, b] of Object.entries(rawResolved)) output[id] = withComparison(b);
    return output;
  }, [rawResolved, comparison]);
  // Com a cadeia quebrada, esqueleto seria mentira: não está carregando, está
  // parado. Blocos vazios mostram o desenho; esqueleto não mostra nada.
  const isLoading = blocker ? false : (loading || awaitingFirstData);

  const withoutMetric = new Set(WITHOUT_METRIC_YET.map((e) => e.block.id));
  const metricErrors = Object.entries(errorsByMetric ?? {});

  const block = (id: string) => resolved[id];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 px-6 py-3.5">
          <div>
            <h1 className="text-sm font-semibold">Galeria de componentes</h1>
            <p className="text-xs text-muted-foreground">
              Componentes reais, pelo mesmo renderizador e pelo mesmo pipeline de dados do relatório
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={reportWidth}
                onChange={(e) => setReportWidth(e.target.checked)}
              />
              Largura real do relatório (880px)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={comparison}
                onChange={(e) => setComparison(e.target.checked)}
              />
              Modo comparativo
            </label>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 pb-24">
        <section className="pt-8">
          <p className="max-w-[74ch] text-sm text-muted-foreground">
            Cada bloco abaixo é o componente de produção, montado num{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">blockMap</code> e entregue ao{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">CanvasBlockRenderer</code>, o
            mesmo do relatório. Os números vêm de{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/api/metrics/batch</code> —
            exceto os marcados em âmbar, cujas formas de métrica ainda não existem no catálogo.
          </p>

          {isLoading && (
            <p className="mt-3 text-xs text-muted-foreground">Carregando as métricas…</p>
          )}

          {blocker && (
            <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-xs font-semibold text-warning">
                Os blocos estão desenhando VAZIOS — a busca de métricas não chegou a disparar.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{blocker}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                Cadeia:{' '}
                <code>clientes {clientsStatus}</code> →{' '}
                <code>cliente {activeClientId || '—'}</code> →{' '}
                <code>dataset {dataset ?? '—'}</code> →{' '}
                <code>período {dateRange.end || '—'}</code>
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                O desenho e a proporção continuam avaliáveis; só os números não vêm. Abrir um
                relatório em outra aba costuma resolver — é lá que a seleção acontece.
              </p>
            </div>
          )}
          {metricErrors.length > 0 && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-semibold text-destructive">
                {metricErrors.length} métrica(s) falharam — o bloco correspondente aparece vazio:
              </p>
              <ul className="mt-1 space-y-0.5">
                {metricErrors.map(([id, error]) => (
                  <li key={id} className="text-[11px] text-muted-foreground">
                    <code>{id}</code> — {error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── Proporção: o que só se vê com os blocos lado a lado ── */}
        <section className="pt-10">
          <h2 className="text-lg font-semibold tracking-tight">Proporção na linha</h2>
          <p className="mt-1 max-w-[74ch] text-sm text-muted-foreground">
            A linha é <code className="rounded bg-muted px-1 py-0.5 text-[11px]">grid-cols-6 gap-4</code>{' '}
            e estica todos os itens até a altura do mais alto. Bloco isolado não revela nada disso:
            um gauge mais alto que o KPI ao lado não fica mais alto — ele abre um vazio embaixo do
            número do vizinho. É aqui que isso se julga.
          </p>

          <div
            className={cn('mt-5 space-y-8', reportWidth && 'max-w-[880px]')}
          >
            {PROPORTION_ROWS.map((row) => (
              <div key={row.title}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{row.title}</p>
                <div className="grid grid-cols-6 gap-4">
                  {row.ids.map((id) => {
                    const b = block(id);
                    if (!b) return null;
                    return (
                      <div key={id} className={COL_SPAN_CLASS[b.colSpan ?? 1]}>
                        <CanvasBlockRenderer
                          block={b}
                          loading={isLoading && !withoutMetric.has(id)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Cenários: colunas que empilham, altura ditada pelo vizinho ── */}
        <section className="pt-14">
          <h2 className="text-lg font-semibold tracking-tight">Colunas e altura imposta</h2>
          <p className="mt-1 max-w-[74ch] text-sm text-muted-foreground">
            Uma coluna é um contêiner: pode ter um bloco só ou vários empilhados. Como o grid
            estica todos os itens da linha até a altura do mais alto, uma tabela de 4/6 com 20
            linhas — ou uma coluna de 2/6 com três blocos — <strong>impõe a sua altura ao resto</strong>.
            É o arranjo real do produto, e o único lugar onde se vê se a área de plotagem cresce
            junto ou se o card ganha uma faixa branca embaixo.
          </p>
          <div className={cn('mt-5', reportWidth && 'max-w-[880px]')}>
            <LayoutScenarios
              scenarios={LAYOUT_SCENARIOS}
              resolved={resolved}
              loading={isLoading}
              withoutMetric={withoutMetric}
            />
          </div>
        </section>

        {/* ── Explorador: um bloco, todas as larguras e alturas ── */}
        <section className="pt-14">
          <h2 className="text-lg font-semibold tracking-tight">Largura e altura</h2>
          <p className="mt-1 max-w-[74ch] text-sm text-muted-foreground">
            Um bloco por vez, uma largura por linha, de 1/6 a 6/6 — inclusive as que o contrato
            recusa. Ver o bloco quebrado abaixo do mínimo é o único jeito de julgar se a recusa
            está certa: se ele ainda se lê em 2/6, o mínimo de 3 está errado e deve cair.
            A altura imposta força os degraus da escala sobre qualquer bloco, para comparar qual
            deles o favorece.
          </p>
          <div className={cn('mt-5', reportWidth && 'max-w-[880px]')}>
            <BlockExplorer
              examples={ALL_EXAMPLES}
              resolved={resolved}
              loading={isLoading}
              withoutMetric={withoutMetric}
            />
          </div>
        </section>

        {/* ── Estados: carregando, vazio e erro ── */}
        <section className="pt-14">
          <h2 className="text-lg font-semibold tracking-tight">Carregando, vazio e erro</h2>
          <p className="mt-1 max-w-[74ch] text-sm text-muted-foreground">
            Os três estados que não são &quot;deu certo&quot; — os que o usuário mais vê quando algo sai do
            lugar, e os que menos foram olhados. Cada bloco escolheu o seu por conta própria
            durante anos: o KPI vazio era um travessão, o donut uma caixa de 180px, o gráfico uma
            de 340px, e o gauge não tinha nenhum. O <strong>vazio não é simulado</strong>: passa
            pelo <code className="rounded bg-muted px-1 py-0.5 text-[11px]">withoutMaterializedData</code>,
            a mesma função que limpa o bloco antes de gravar no Firestore.
          </p>
          <div className="mt-5">
            <BlockStates reportWidth={reportWidth} />
          </div>
        </section>

        {/* ── Catálogo: um de cada, com a ficha do contrato ── */}
        <section className="pt-14">
          <h2 className="text-lg font-semibold tracking-tight">Catálogo</h2>
          <p className="mt-1 max-w-[74ch] text-sm text-muted-foreground">
            Um bloco de cada tipo, na largura recomendada pelo contrato. A ficha acima de cada um é
            lida do <code className="rounded bg-muted px-1 py-0.5 text-[11px]">block-specs.ts</code>,
            não escrita aqui — se a régua mudar, a ficha muda junto.
          </p>

          <div className={cn('mt-5 space-y-10', reportWidth && 'max-w-[880px]')}>
            {ALL_EXAMPLES.map((example) => {
              const b = block(example.block.id);
              if (!b) return null;
              return (
                <div key={example.block.id}>
                  <BlockCardEntry example={example} comparison={comparison} />
                  <p className="mb-2.5 text-xs italic text-muted-foreground/80">
                    {example.question}
                  </p>
                  <div className="grid grid-cols-6 gap-4">
                    <div className={COL_SPAN_CLASS[b.colSpan ?? 1]}>
                      <CanvasBlockRenderer
                        block={b}
                        expandable
                        loading={isLoading && !withoutMetric.has(example.block.id)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

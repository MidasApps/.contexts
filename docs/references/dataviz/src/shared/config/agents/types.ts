import type { ReadOnlyMemoryService } from '@/shared/lib/memory/readonly-guard';
import type { OrchestratorPhase } from '@/features/ai-agents/phases/types';
import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';

/**
 * Id de cliente. Era a união literal dos tenants escritos no código, o que
 * fazia o compilador recusar qualquer cliente cadastrado depois do último
 * deploy — e obrigava um `as ClientId` para contornar, que é o cast que apaga
 * a checagem em vez de fazê-la. Cliente é cadastro da administração; a
 * checagem de formato acontece em runtime, com `Slug`.
 */
export type ClientId = string;

export interface RequestContext {
  clientId: ClientId;
  sessionId: string;
  userId?: string;
  locale?: string;
}

export type AgentId =
  | 'descriptive_agent'
  | 'diagnostic_agent'
  | 'predictive_agent'
  | 'simulation_agent'
  | 'prescriptive_agent'
  | 'monitoring_agent'
  | 'cashflow_agent'
  | 'external_agent';

export type ModelTier = 'router' | 'fast' | 'flash' | 'reasoning';

// AgentConfig descrevia o formato de agente do runtime AI SDK v6 (id, model,
// maxSteps, inputSchema, buildSystemPrompt, tools). Saiu com ele: no Mastra a
// configuração de agente vem do Firestore, validada por AiAgentDoc.

export interface FocusedIndicator {
  name: string;
  value?: string;
  history?: string;
}

export interface AgentDynamicContext {
  dataset: string;
  filters: ChatRequestFilters;
  dashboardState: string;
  page: string;
  sessionId: string;
  focusedIndicator?: FocusedIndicator;
  /** Tenant identifier for multi-tenancy/recall scoping (ADR-0006). */
  clientId?: string;
  /**
   * Relatório (`group`) que o usuário tem aberto. É o destino padrão do que as
   * tools de autoria criam: "crie uma página" sem endereço significa "aqui".
   */
  activeGroupId?: string;
  /**
   * Página aberta dentro do relatório. Com ela dá para responder "só esta
   * página usa esta métrica?" — a pergunta que decide se alterar uma métrica
   * pode ser feita no lugar ou precisa virar variante.
   */
  activeReportId?: string;
  /**
   * Quem está na conversa. Server-bound como o `clientId` (ADR-0006): vem do
   * token verificado na rota, nunca do corpo da requisição. As ferramentas que
   * tocam BigQuery em nome da pessoa (validação de métrica por dry-run) passam
   * por `verifyDatasetAccess`, que é por e-mail.
   */
  userEmail?: string;
  /** Persona identifier for multi-tenancy/recall scoping (ADR-0006). */
  personaId?: string;
  /**
   * Read-only working-memory service injected by the orchestrator when a
   * `threadId` is present. Sub-agents can read working memory and message
   * history; mutating operations reject with `ReadOnlyMemoryError`
   * (Sprint 3.A / ADR-0006).
   */
  memory?: ReadOnlyMemoryService;
  /**
   * Current orchestrator phase, mutated by `prepareStep` between steps so
   * sub-agent telemetry (`recordSubAgentSpan`) reflects the live phase
   * instead of a hardcoded default (Sprint 3.B / ADR-0008).
   */
  currentPhase?: OrchestratorPhase;
  /**
   * Contexto semântico do cliente (frente C — ADR-0014/0015): métricas já
   * contratadas (para reuso) + data contract (entidades/atributos, para gerar
   * SQL novo). Opcional — quando ausente/vazio, o prompt omite as seções e a
   * IA opera como hoje. Injetado pelos route handlers (task 3).
   */
  semanticContext?: ClientSemanticContext;
}

/**
 * Os filtros que o cliente manda junto da pergunta.
 *
 * Tinha também `projetos` e seis `advancedFilters`. Eles saíram da interface —
 * as opções eram literais no código e nenhuma métrica do catálogo os aplicava
 * — e com eles saiu a seção de prompt que mandava o sub-agente juntar
 * `AND projeto IN (…)` ao SQL. Recorte de verdade hoje é filtro de PÁGINA, que
 * o assistente cria a pedido e que já entra na consulta pelo resolver.
 */
export interface ChatRequestFilters {
  dateRange: { start: string; end: string };
  compareEnabled: boolean;
  comparePeriod?: { start: string; end: string };
  viewMode?: 'snapshot' | 'accumulated';
}

export type PreliminaryStatus =
  | 'routing' | 'analyzing' | 'generating_sql' | 'executing_sql'
  | 'query_complete' | 'searching' | 'simulating'
  | 'exporting' | 'done' | 'error' | 'awaiting_input'
  | 'describing' | 'diagnosing' | 'predicting' | 'prescribing'
  | 'monitoring' | 'analyzing_cashflow' | 'forecasting' | 'checking_compliance';

export interface ClarificationOption {
  label: string;
  value: string;
  description?: string;
}

export interface ClarificationRequest {
  question: string;
  options: ClarificationOption[];
  agentId: AgentId;
  originalQuery: string;
}

// PreliminaryResult era o envelope de resultado parcial que o orchestrator AI
// SDK v6 emitia entre steps. O streaming do Mastra não passa por ele.

// ── Canvas Orchestrator Types ──

interface BaseBlock {
  id: string;
  /** Grid column span (6-column grid): 1 = 1/6, 2 = 2/6, 3 = 3/6, 4 = 4/6, 5 = 5/6, 6 = full width. Default: 1 */
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6;
  // `dataset?: string` ("BigQuery dataset name for this block") saiu: nada
  // escrevia e nada lia. O dataset de um bloco é resolvido no servidor a
  // partir de `metricId` → recipe → contract → binding do cliente; guardar o
  // nome do dataset no bloco seria escopo de tenant vindo do cliente.
  /**
   * Metric ID que alimenta este bloco (`domain.slug`, ex: `dashboard.evolucao_saldo_devedor`).
   * Quando presente, o renderer busca dados via `/api/metrics/[id]/data` resolvendo
   * recipe → contract → binding → BigQuery.
   */
  metricId?: string;
  /**
   * O bloco ignora o filtro global de período e mostra a série inteira.
   *
   * Existe para PROJEÇÃO. O filtro de período recorta a consulta ao intervalo
   * escolhido, e para dado histórico isso é o comportamento certo; para uma
   * curva que vai até 2027 é o oposto — a linha do futuro é justamente o que
   * cai fora do recorte, e o gráfico chega truncado no último mês do filtro
   * sem nada na tela explicando por quê.
   *
   * Só a métrica sabe até onde os dados vão; só o bloco sabe se aquela leitura
   * é uma projeção. Por isso a decisão mora aqui, e não no catálogo: a mesma
   * métrica pode aparecer recortada num bloco e inteira em outro.
   */
  ignorePeriodFilter?: boolean;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
}

export interface KpiBlockItem {
  label: string;
  value: string;
  description?: string;
  trend?: string;
  trendDirection?: 'up' | 'down';
  trendIsPositive?: boolean;
  sparklineData?: number[];
  sparklineMonths?: string[];
  // `previousValue?: string` saiu: era declarado nos dois tipos de KPI e nunca
  // lido. Quem renderiza comparação de período é `deltaPercent` (KpiBlock.tsx
  // / SingleKpiBlock.tsx → `KpiCard.periodComparison`). O `previousValue` do
  // `KpiCard` é outro campo, da prop `comparison`, que nenhum bloco usa.
  deltaPercent?: string;
  /**
   * Direção da variação COMPARATIVA — campo próprio, e não `trendDirection`.
   *
   * `trendDirection` pertence à sparkline (último mês contra o anterior da
   * própria série) e é escrito depois, no mesmo bloco. Compartilhar o campo
   * fazia o card exibir a porcentagem de um período com a seta do outro.
   */
  deltaDirection?: 'up' | 'down';
}

export interface KpiBlock extends BaseBlock {
  type: 'kpis';
  items: KpiBlockItem[];
}

/**
 * Ícones que o card de KPI sabe desenhar.
 *
 * Lista fechada de propósito: como `string`, qualquer nome errado (`'Wallet2'`,
 * `'wallet'`) caía em silêncio no `TrendingUp` e só se descobria olhando a
 * tela. O mapa nome→componente em `SingleKpiBlock.tsx` é
 * `Record<KpiIconName, LucideIcon>`, então nome novo aqui sem ícone lá — ou
 * ícone lá sem nome aqui — não compila.
 */
export const KPI_ICON_NAMES = [
  'TrendingUp',
  'Layers',
  'Wallet',
  'CreditCard',
  'AlertTriangle',
  'TrendingDown',
  'Clock',
  'ShieldAlert',
  'DollarSign',
  'Calculator',
  'CheckCircle',
  'ArrowRightLeft',
] as const;

export type KpiIconName = (typeof KPI_ICON_NAMES)[number];

/** Single KPI as an independent block (for FlexLayout page builder) */
export interface SingleKpiBlock extends BaseBlock {
  type: 'kpi';
  label: string;
  /**
   * Valor formatado. **Opcional**: com `metricId`, quem preenche é o pipeline
   * (`useReportData` → `/api/metrics/batch`), então entre a criação do bloco e a
   * chegada do dado — ou quando a métrica falha — ele não existe. Era `string`
   * obrigatório da era em que a IA colava o número no bloco.
   */
  value?: string;
  description?: string;
  trend?: string;
  trendDirection?: 'up' | 'down';
  trendIsPositive?: boolean;
  sparklineData?: number[];
  sparklineMonths?: string[];
  // Ver KpiBlockItem: `previousValue` também era morto aqui.
  deltaPercent?: string;
  /**
   * Direção da variação COMPARATIVA — campo próprio, e não `trendDirection`.
   *
   * `trendDirection` pertence à sparkline (último mês contra o anterior da
   * própria série) e é escrito depois, no mesmo bloco. Compartilhar o campo
   * fazia o card exibir a porcentagem de um período com a seta do outro.
   */
  deltaDirection?: 'up' | 'down';

  /** Ícone do card de KPI. Default: `TrendingUp`. Ver `KPI_ICON_NAMES`. */
  iconName?: KpiIconName;
  /** Whether an upward trend is good news (drives badge color). Default: true. */
  positiveIsGood?: boolean;
  /** Visual alert when raw value > threshold (e.g., inadimplência > 5%). */
  alertThreshold?: number;
  /** Glossary term key (overrides description if both set). */
  glossaryTerm?: string;
  /**
   * How to render `value` when it comes back as a raw number from the metric
   * pipeline. Ignored when value is already a formatted string.
   */
  format?: 'currency' | 'percent' | 'number';
  /**
   * Casas decimais aplicadas em `format: 'number' | 'percent'` (espelha
   * `GaugeBlock.decimals`). Default: preserva o comportamento atual de cada
   * formatador (`formatNumber` = 0, `formatPercent` = 2). Ignorado em
   * `format: 'currency'`, que tem regra própria de casas.
   */
  decimals?: number;
  /** Sufixo do valor (ex: '%', 'x'). Display only — espelha `GaugeBlock.suffix`. */
  suffix?: string;
  /**
   * Optional metric id retornando série temporal `{ month, value }` para
   * alimentar a sparkline. Avaliado em paralelo ao `metricId` principal.
   */
  sparklineMetricId?: string;
}

export interface ChartReferenceLine {
  y: number;
  label?: string;
  color?: string;
  dashed?: boolean;
}

export interface ChartBlock extends BaseBlock {
  type: 'chart';
  chartType: 'bar' | 'line' | 'area' | 'composed' | 'stacked-bar' | 'waterfall' | 'histogram' | 'pareto';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline a partir de `metricId` — ausente até o dado chegar. */
  data?: Array<Record<string, string | number>>;
  /**
   * Pontos do FUTURO, calculados pelo assistente e desenhados depois do
   * histórico.
   *
   * Existem porque projeção não é consulta: nenhum SQL sobre `contratos`
   * devolve um contrato que ainda não foi assinado. O assistente projeta
   * (ritmo de vendas, esgotamento de estoque) e precisava de um lugar para
   * colocar o resultado — sem isto ele só conseguia escrever os números num
   * texto ao lado do gráfico que parava no último mês real.
   *
   * ⚠️ Estes valores NÃO vêm do banco. Devem viver numa série própria
   * (`dataKeys` + `dashedKeys`), nunca misturados na série real: um ponto
   * projetado indistinguível de um ponto medido é o defeito, não a feature.
   */
  projectedData?: Array<Record<string, string | number>>;
  dataKeys: string[];
  xAxisKey: string;
  colors?: string[];
  // `stacked?: boolean` saiu: declarado e sem nenhum leitor. Empilhamento é
  // decidido por `chartType: 'stacked-bar'`, e o modo por `stackOffset`.
  /**
   * Modo de empilhamento do `stacked-bar`: `'expand'` = 100% (proporção por
   * categoria; eixo Y em %). Default `'none'` (valores absolutos). Fase R/B4.
   */
  stackOffset?: 'none' | 'expand';
  /** Subset de dataKeys renderizados com linha tracejada (line/composed/area). */
  dashedKeys?: string[];
  /** Linhas de referência horizontais (threshold, zero, etc.). */
  referenceLines?: ChartReferenceLine[];
  /**
   * Orientação das barras (`bar`/`stacked-bar` apenas; sem efeito em
   * line/area/composed). `'horizontal'` = categoria no eixo Y — atenção:
   * corresponde a `layout="vertical"` no `<BarChart>` do Recharts, que usa
   * nomenclatura invertida. Default `'vertical'` = comportamento atual
   * (categoria no eixo X).
   */
  layout?: 'vertical' | 'horizontal';
  /**
   * Séries que vão para um SEGUNDO eixo Y, à direita.
   *
   * Subconjunto de `dataKeys`. Sem isto o gráfico tem um eixo só, e é o
   * defeito que mais dói no `composed`: barras em reais e linha em percentual
   * dividem a mesma escala, então a linha vira um risco colado no chão. É
   * justamente a combinação que o produto mais pede (saldo × taxa).
   *
   * Só faz sentido quando as séries têm ordens de grandeza ou unidades
   * diferentes — dois eixos para dados comparáveis distorcem a leitura.
   */
  rightAxisKeys?: string[];
  /** Rótulo do eixo direito (ex: "%"). Exibido no topo do eixo. */
  rightAxisLabel?: string;
  /** Rótulo do eixo esquerdo (ex: "R$"). */
  leftAxisLabel?: string;
  /**
   * A unidade das séries — a do eixo esquerdo, quando há dois.
   *
   * Todo bloco de indicador declara o seu formato; o gráfico era o único que
   * não, e por isso ADIVINHAVA pela grandeza do número: acima de mil, moeda.
   * Uma barra de 1.200 contratos era rotulada "R$ 1.200,00" no tooltip — a
   * tela inventava a unidade, que é pior que não formatar. Sem esta
   * declaração, número puro.
   */
  format?: 'currency' | 'percent' | 'number';
  /** Casas decimais das séries. Default 0 — contagem não tem centavos. */
  decimals?: number;
  /**
   * A unidade das séries do eixo DIREITO. O eixo duplo existe justamente
   * porque as unidades diferem; formatá-las com a mesma régua desfaz o motivo
   * de ele existir. Sem isto, o direito segue o `format`.
   */
  rightFormat?: 'currency' | 'percent' | 'number';
  /** Casas decimais das séries do eixo direito. */
  rightDecimals?: number;
  /**
   * Clicar num item da legenda esconde a série.
   *
   * Com cinco ou mais séries num empilhado, é a diferença entre legível e
   * ilegível. Esconde SÉRIE, não período — o filtro de período é global e
   * continua sendo o único dono do recorte no tempo.
   */
  legendaInterativa?: boolean;
}

/**
 * Donut/pie com total centralizado e cards laterais opcionais por fatia.
 *
 * Dados: o resolver deve retornar rows `{ name|bucket|<groupBy>: string, value: number }`.
 * `useReportData` mapeia para `slices[]` automaticamente quando `metricId` está presente.
 */
export interface DonutBlock extends BaseBlock {
  type: 'donut';
  title?: string;
  subtitle?: string;
  /** Fatias renderizadas. Cada slice tem nome, valor e cor. */
  slices: Array<{ name: string; value: number; fill?: string }>;
  /** Label superior do centro (default: 'Total'). */
  centerLabel?: string;
  /** Format aplicado ao valor central (default: 'number'). */
  format?: 'currency' | 'percent' | 'number';
  /** Mostra cards laterais com dot/label/valor/% por slice. Default: true. */
  showLegendCards?: boolean;
  /** Paleta override (uma cor por slice, na ordem). Default usa CHART_COLORS. */
  colors?: string[];
  /**
   * Como desenhar a composição. `'donut'` (default) é a rosca com centro;
   * `'bar'` é uma barra 100% de linha única com legenda embaixo.
   *
   * Mesma métrica, mesmo contrato — muda só o desenho. A barra diz a mesma
   * coisa em cerca de um terço da altura, o que a torna a escolha certa quando
   * a composição é contexto de outro bloco e não o assunto principal da linha.
   */
  display?: 'donut' | 'bar';
}

/**
 * Gauge: valor único vs limite mínimo, com cor condicional (verde se ≥ min,
 * âmbar se intermediário, vermelho se < min). Útil para Índice de Cobertura,
 * % obra, etc.
 *
 * Dados: o resolver deve retornar 1 linha com `value: number`.
 */
export interface GaugeBlock extends BaseBlock {
  type: 'gauge';
  label: string;
  description?: string;
  value: number;
  /** Limite mínimo aceitável. Acima disso = verde. */
  /**
   * Variação contra o período comparativo, preenchida pelo pipeline quando o
   * modo comparativo está ligado. É DADO, não configuração: sai do documento
   * antes de gravar (ver `DATA_FIELDS`).
   */
  deltaPercent?: string;
  /**
   * Direção da variação COMPARATIVA — campo próprio, e não `trendDirection`.
   *
   * `trendDirection` pertence à sparkline (último mês contra o anterior da
   * própria série) e é escrito depois, no mesmo bloco. Compartilhar o campo
   * fazia o card exibir a porcentagem de um período com a seta do outro.
   */
  deltaDirection?: 'up' | 'down';
  /** Direção da série, quando houver. Sem valor = não houve variação. */
  trendDirection?: 'up' | 'down';
  threshold: number;
  /** Limite de "atenção" (entre threshold e este = âmbar). Opcional. */
  warnThreshold?: number;
  /** Sufixo do valor (ex: 'x', '%'). Display only. */
  suffix?: string;
  /** Casas decimais (default: 2). */
  decimals?: number;
  /** Inverte a lógica: TRUE = quanto MAIOR pior (default: false). */
  reverseScale?: boolean;
  format?: 'currency' | 'percent' | 'number';
  /**
   * Início da escala do arco. Default 0.
   *
   * O arco precisa de um domínio para desenhar; sem `scaleMax` declarado ele
   * vai de `scaleMin` a 2× o limite, o que põe a marca do mínimo contratado
   * exatamente no meio. Declare os dois quando a faixa real for conhecida
   * (ex.: um percentual de obra vai de 0 a 100, não a 2× a meta).
   */
  scaleMin?: number;
  /** Fim da escala do arco. Default: 2× `threshold`. */
  scaleMax?: number;
  /**
   * Como desenhar a comparação com o limite.
   *
   * `'meter'` (default) é uma faixa horizontal de 14px sob o número: cabe em
   * 2/6 e o bloco pesa como um KPI, com quem divide linha.
   *
   * `'arc'` é o semicírculo com o número dentro. Diz a mesma coisa e diz melhor
   * — a posição angular se lê de relance —, mas precisa de ~216px de largura e
   * ~110px de altura para o número caber no vão. Por isso o contrato o coloca
   * em 3/6 e no degrau de altura das composições. Use quando o covenant é o
   * assunto da linha, não quando é um número entre outros.
   */
  display?: 'meter' | 'arc';
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  title?: string;
  columns: Array<{
    header: string;
    accessorKey: string;
    format?: 'currency' | 'percent' | 'number' | 'date' | 'status-badge';
    /** Override por valor da variante do badge quando format === 'status-badge'. */
    statusMap?: Record<string, 'success' | 'danger' | 'warning' | 'neutral'>;
  }>;
  /** Preenchido pelo pipeline a partir de `metricId` — ausente até o dado chegar. */
  rows?: Record<string, unknown>[];
  /** Total row count before truncation (set when rows were truncated) */
  totalRows?: number;
  /**
   * Footer row config for aggregations (e.g., "Total geral").
   * `aggregations` maps accessorKey to the agg fn applied across `rows`.
   * Use 'sum'|'avg'|'count', or a literal string for static cells.
   * Example: { faixa_atraso: 'Total geral', id_contrato: 'sum', valor_atraso: 'sum' }
   */
  footerAggregations?: Record<string, 'sum' | 'avg' | 'count' | string>;
}

/**
 * Um indicador comparado à SUA PRÓPRIA meta. Uma linha da métrica `targets`.
 *
 * `target` por item é o que torna o bloco comparável: três covenants com
 * mínimos diferentes (1,20x, 1,50x, 15%) não se comparam em valor absoluto,
 * mas comparam-se em distância da meta.
 */
export interface TargetItem {
  label: string;
  value: number;
  target: number;
  /** Limite de atenção deste item. Entre `target` e ele, pinta âmbar. */
  warn?: number;
  /** Sobrescreve o `reverseScale` do bloco para este item. */
  reverseScale?: boolean;
}

/**
 * Vários indicadores, cada um contra a sua meta.
 *
 * Existe porque o gauge não escala: cada covenant ocupa 2/6, três já consomem
 * a linha inteira, e ainda assim não se comparam entre si. Aqui N itens
 * dividem um bloco e são lidos na mesma régua — a distância até a meta.
 *
 * Dados: o resolver deve devolver `{ label, value, target, [warn] }` por linha.
 */
export interface TargetsBlock extends BaseBlock {
  type: 'targets';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline a partir de `metricId`. */
  items?: TargetItem[];
  /**
   * `'bullet'` desenha barras com faixas qualitativas e a marca da meta —
   * mostra a distância. `'list'` é uma lista compacta com semáforo — cabe mais
   * itens na mesma altura, ao custo de não mostrar o quanto falta.
   */
  display?: 'bullet' | 'list';
  format?: 'currency' | 'percent' | 'number';
  decimals?: number;
  suffix?: string;
  /** `true` quando MAIOR é pior para todos os itens (o item pode sobrescrever). */
  reverseScale?: boolean;
}

/**
 * Realizado contra o previsto, com barra de progresso.
 *
 * O KPI responde "quanto tem"; este responde "quanto falta", que é outra
 * pergunta e não tinha bloco.
 *
 * Dados: forma `scalar` — o resolver devolve 1 linha com `value`. A meta é
 * configuração (vem do contrato, do orçamento), não da consulta.
 */
export interface ProgressBlock extends BaseBlock {
  type: 'progress';
  label: string;
  /** Preenchido pelo pipeline — ausente até o dado chegar. */
  value?: number;
  /** A meta. Configuração do bloco, não dado da métrica. */
  /**
   * Variação contra o período comparativo, preenchida pelo pipeline quando o
   * modo comparativo está ligado. É DADO, não configuração: sai do documento
   * antes de gravar (ver `DATA_FIELDS`).
   */
  deltaPercent?: string;
  /**
   * Direção da variação COMPARATIVA — campo próprio, e não `trendDirection`.
   *
   * `trendDirection` pertence à sparkline (último mês contra o anterior da
   * própria série) e é escrito depois, no mesmo bloco. Compartilhar o campo
   * fazia o card exibir a porcentagem de um período com a seta do outro.
   */
  deltaDirection?: 'up' | 'down';
  /** Direção da série, quando houver. Sem valor = não houve variação. */
  trendDirection?: 'up' | 'down';
  target: number;
  /** Rótulo da meta na linha de apoio (ex: "previstos"). Default: "previstos". */
  targetLabel?: string;
  description?: string;
  format?: 'currency' | 'percent' | 'number';
  decimals?: number;
  suffix?: string;
}

/**
 * O número de agora ao lado do número de antes.
 *
 * A comparação existia só como tooltip da sparkline do KPI — invisível para
 * quem lê a página, e inexistente na exportação em PDF.
 *
 * Dados: forma `timeseries`. O pipeline usa os DOIS ÚLTIMOS pontos da série,
 * então "anterior" é o período imediatamente anterior no grão da métrica.
 */
export interface ComparisonBlock extends BaseBlock {
  type: 'comparison';
  label: string;
  /** Preenchidos pelo pipeline a partir dos dois últimos pontos da série. */
  current?: number;
  previous?: number;
  /** Rótulos das duas colunas. Default: "Atual" e "Anterior". */
  currentLabel?: string;
  previousLabel?: string;
  format?: 'currency' | 'percent' | 'number';
  decimals?: number;
  suffix?: string;
  /** `false` quando subir é ruim (inadimplência, PDD). Default: true. */
  positiveIsGood?: boolean;
  /**
   * Exibe a diferença em pontos percentuais em vez de variação relativa.
   *
   * Para métrica que JÁ é percentual: de 5,24% para 4,81% a variação relativa
   * é −8,2%, número correto e ilegível. Em p.p. é −0,43, que é como o mercado
   * fala.
   */
  deltaAsPoints?: boolean;
}

/**
 * Várias métricas com histórico, uma por linha — *small multiples*.
 *
 * Quatro KPIs com sparkline ocupam a linha inteira; aqui as mesmas quatro
 * séries cabem em metade dela, ao custo de o número perder destaque. É o
 * formato certo para acompanhamento, não para o indicador principal da página.
 *
 * Dados: forma `timeseries_multi` — `{ bucket, serie1, serie2, … }`. Cada
 * coluna que não é o bucket vira uma linha do bloco.
 */
export interface SparkRowsBlock extends BaseBlock {
  type: 'sparkrows';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline. `points` na ordem cronológica. */
  series?: Array<{ name: string; points: number[] }>;
  format?: 'currency' | 'percent' | 'number';
  decimals?: number;
  /** `false` quando subir é ruim — pinta a tendência ao contrário. Default: true. */
  positiveIsGood?: boolean;
}

/**
 * Dispersão: uma observação por ponto.
 *
 * A concentração de risco (LTV × atraso, ticket × prazo) só existia como
 * tabela de mil linhas, que ninguém lê. O gráfico mostra o agrupamento e os
 * outliers de uma vez.
 *
 * Dados: forma `points` — `{ x, y, [size], [group] }` por linha.
 */
export interface ScatterBlock extends BaseBlock {
  type: 'scatter';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline. */
  points?: Array<{ x: number; y: number; size?: number; group?: string }>;
  xLabel?: string;
  yLabel?: string;
  xFormat?: 'currency' | 'percent' | 'number';
  yFormat?: 'currency' | 'percent' | 'number';
  /** Linha vertical de corte (ex.: LTV de 80%). */
  xReference?: { value: number; label?: string };
  /** Linha horizontal de corte. */
  yReference?: { value: number; label?: string };
}

/**
 * Matriz de intensidade: linha × coluna → valor.
 *
 * A análise de safra (originação × meses decorridos) é a leitura clássica de
 * carteira de crédito e não tinha como sair de uma tabela.
 *
 * Dados: forma `matrix` — `{ row, col, value }` por célula. Célula ausente é
 * desenhada vazia, não como zero: numa matriz de safra a diferença entre
 * "ainda não aconteceu" e "aconteceu e deu zero" é o ponto todo.
 */
export interface HeatmapBlock extends BaseBlock {
  type: 'heatmap';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline. */
  cells?: Array<{ row: string; col: string; value: number }>;
  rowLabel?: string;
  colLabel?: string;
  format?: 'currency' | 'percent' | 'number';
  decimals?: number;
  /** `true` quando valor alto é ruim — pinta em vermelho. Default: true. */
  highIsBad?: boolean;
}

/**
 * Funil: um fluxo com perda em cada etapa.
 *
 * A esteira de repasse é o caso do produto — elegíveis → aprovados pelo banco
 * → repassados → liquidados. Hoje isso vira quatro KPIs soltos, com o leitor
 * fazendo a subtração de cabeça e sem enxergar ONDE a perda é maior.
 *
 * Dados: forma `funnel` — `{ etapa, value }` NA ORDEM do fluxo. A ordem é do
 * SQL, não do bloco: um funil reordenado por valor deixa de ser um funil.
 */
export interface FunnelBlock extends BaseBlock {
  type: 'funnel';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline, na ordem em que a métrica devolveu. */
  etapas?: Array<{ etapa: string; value: number }>;
  format?: 'currency' | 'percent' | 'number';
  decimals?: number;
  /** Mostra a conversão de cada etapa contra a anterior. Default: true. */
  mostrarConversao?: boolean;
}

/**
 * Sankey: migração entre estados, entre dois momentos.
 *
 * Quem estava em 1–30 dias de atraso e foi para 31–60. É a leitura que
 * ANTECIPA a inadimplência — o estoque só mostra o resultado depois de
 * consumado.
 *
 * Dados: forma `flow` — `{ origem, destino, value }`. A cor comunica a
 * DIREÇÃO (piorou, melhorou, manteve), não a faixa: é o que o bloco existe
 * para responder.
 */
export interface SankeyBlock extends BaseBlock {
  type: 'sankey';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline. */
  fluxos?: Array<{ origem: string; destino: string; value: number }>;
  /**
   * Os estados na ordem de gravidade, do melhor ao pior. É o que permite
   * dizer se uma migração foi piora ou melhora — sem isso o bloco só sabe
   * desenhar fitas.
   */
  ordem?: string[];
  format?: 'currency' | 'percent' | 'number';
}

/**
 * Boxplot: a dispersão dentro de cada grupo, não a média dele.
 *
 * Uma carteira com LTV médio de 68% pode ser homogênea ou ter metade acima de
 * 85% — a média não distingue, e o histograma mostra um grupo por vez.
 *
 * Dados: forma `distribution` — `{ grupo, min, q1, mediana, q3, max }`, com
 * os quartis JÁ calculados pelo SQL.
 */
export interface BoxplotBlock extends BaseBlock {
  type: 'boxplot';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline. */
  grupos?: Array<{
    grupo: string; min: number; q1: number; mediana: number; q3: number; max: number;
  }>;
  format?: 'currency' | 'percent' | 'number';
  decimals?: number;
}

/**
 * Treemap: peso por área.
 *
 * Alternativa à rosca quando há MUITAS categorias de tamanhos muito desiguais
 * — acima de ~8 as fatias da rosca ficam indistinguíveis e a área continua
 * legível. Abaixo disso a rosca diz o mesmo com menos aparato.
 *
 * Dados: forma `breakdown`, a mesma da rosca.
 */
export interface TreemapBlock extends BaseBlock {
  type: 'treemap';
  title?: string;
  subtitle?: string;
  /** Preenchido pelo pipeline. */
  fatias?: Array<{ name: string; value: number }>;
  format?: 'currency' | 'percent' | 'number';
}

export type CanvasBlock =
  | TextBlock
  | KpiBlock
  | SingleKpiBlock
  | ChartBlock
  | TableBlock
  | DonutBlock
  | GaugeBlock
  | TargetsBlock
  | ProgressBlock
  | ComparisonBlock
  | SparkRowsBlock
  | ScatterBlock
  | HeatmapBlock
  | FunnelBlock
  | SankeyBlock
  | BoxplotBlock
  | TreemapBlock;

export interface CanvasPageFilters {
  dateRange?: { start: string; end: string };
  projetos?: string[];
  /**
   * Mapa de filtros expostos pela página para as métricas — chave é o nome
   * usado em `{filter.X}` ou em `MetricFilter.value: 'filter.X'`.
   *
   * Permite que cada template declare quais atributos default cada filtro
   * mapeia (ex: pagamentos.data_base_report) sem hardcoded no hook.
   * Quando omitido, `useReportData` cai no default `contratos.data_base_report`.
   */
  metricPageFilters?: Record<
    string,
    {
      kind: 'date_range' | 'snapshot' | 'in';
      /**
       * Coluna da entidade comparada por este filtro.
       *
       * Obrigatório para os filtros de tempo. Nos `in` declarados sobre o campo
       * do indicador (ADR-0026) ele não existe: quem diz o que comparar é a
       * métrica, em `filterFields`.
       */
      attribute?: string;
      /**
       * Quando `'dropdown'` (G3), a página renderiza um seletor local acima
       * do grid — valores vêm de `POST /api/metrics/filter-values` — e o
       * usuário escolhe os valores que populam este filtro `kind: 'in'`.
       * Sem `control`, o filtro segue o comportamento pré-existente (ex:
       * `projetos`, alimentado pelo filtro global de empreendimentos).
       */
      control?: 'dropdown';
      /** Rótulo exibido no dropdown (ex: "Banco"). Default: a própria `key`. */
      label?: string;
      /**
       * Atributo opcional de rótulo amigável (ex: `transacoes.banco_nome`)
       * para exibir no dropdown mantendo `attribute` como a chave real do
       * filtro. Quando ausente ou sem mapping no cliente, o dropdown exibe
       * o próprio `value`.
       */
      labelAttribute?: string;
      /**
       * De onde o seletor lê as opções (ADR-0026): um campo do resultado de uma
       * métrica da página.
       *
       * É o que faz o dropdown mostrar o mesmo texto da tela. Lendo a coluna
       * crua da entidade, a tabela exibia "BANCO INTER" (vindo de um JOIN da
       * métrica) e o seletor oferecia `77`.
       */
      source?: { metricId: string; field: string };
    }
  >;
}

/**
 * Uma linha do layout — que é ORDEM, não quebra obrigatória.
 *
 * O store agrupa aqui os blocos que couberam juntos quando foram criados
 * (`fitsInRow`), e é isso que o assistente recebe descrito. Mas quem decide
 * onde a linha quebra na tela é o encaixe na grade de 6 colunas, no momento de
 * desenhar: um bloco que encolheu deixa o vizinho subir, e a linha gravada não
 * segura ninguém embaixo.
 *
 * Tratar `blockIds` como corte rígido é o defeito que a leitura tinha — ver
 * `src/pages/explore/ui/block-grid.ts`.
 */
export interface CanvasRow {
  id: string;
  blockIds: string[];
}

export interface CanvasPage {
  id: string;
  title: string;
  description?: string;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
}

export interface LegacyCanvasPage {
  id: string;
  title: string;
  description?: string;
  blocks: CanvasBlock[];
  filters?: CanvasPageFilters;
}

export interface CanvasPageContext {
  id: string;
  title: string;
  blocks: Array<{
    id: string;
    type: string;
    title?: string;
    /** KPI label or value summary */
    label?: string;
    /** Chart dataKeys or KPI items labels */
    metrics?: string[];
    /** Table column names */
    columns?: string[];
  }>;
  layout: Array<{ rowIndex: number; blockIds: string[] }>;
}

/**
 * Os blocos da página na ordem em que se encaixam na grade.
 *
 * Recebe só as duas partes de que precisa, e não a `CanvasPage` inteira, porque
 * a leitura do relatório monta o `blockMap` na hora (resolve tokens de
 * drill-through) e não tem uma página do canvas em mãos — sem isso ela
 * reimplementaria este `flatMap`, que é exatamente como edição e leitura
 * chegaram a listar a mesma página de dois jeitos.
 */
export function serializeBlocks(page: Pick<CanvasPage, 'blockMap' | 'layout'>): CanvasBlock[] {
  return page.layout.flatMap(row =>
    row.blockIds.map(id => page.blockMap[id]).filter(Boolean)
  );
}

/** Explode a KpiBlock (multiple items) into individual SingleKpiBlock entries */
function explodeKpiBlock(block: KpiBlock): SingleKpiBlock[] {
  return block.items.map((item) => ({
    id: crypto.randomUUID(),
    type: 'kpi' as const,
    ...item,
  }));
}

/** Migrate KpiBlocks with multiple items into individual SingleKpiBlocks */
export function flattenKpiBlocks(page: CanvasPage): CanvasPage {
  const blockMap: Record<string, CanvasBlock> = {};
  const layout: CanvasRow[] = [];

  for (const row of page.layout) {
    const newBlockIds: string[] = [];
    for (const blockId of row.blockIds) {
      const block = page.blockMap[blockId];
      if (!block) continue;

      if (block.type === 'kpis') {
        // Explode multi-item KPI block into individual blocks
        const singles = explodeKpiBlock(block);
        for (const single of singles) {
          blockMap[single.id] = single;
          newBlockIds.push(single.id);
        }
      } else {
        blockMap[block.id] = block;
        newBlockIds.push(block.id);
      }
    }
    if (newBlockIds.length > 0) {
      // Split into rows of max 3 blocks
      for (let i = 0; i < newBlockIds.length; i += 3) {
        layout.push({ id: crypto.randomUUID(), blockIds: newBlockIds.slice(i, i + 3) });
      }
    }
  }

  return { ...page, blockMap, layout };
}

export function migratePage(page: LegacyCanvasPage | CanvasPage): CanvasPage {
  let migrated: CanvasPage;

  if ('blockMap' in page && page.blockMap && 'layout' in page && page.layout) {
    migrated = page as CanvasPage;
  } else {
    const legacy = page as LegacyCanvasPage;
    const blockMap: Record<string, CanvasBlock> = {};
    const layout: CanvasRow[] = [];
    for (const block of legacy.blocks ?? []) {
      blockMap[block.id] = block;
      layout.push({ id: crypto.randomUUID(), blockIds: [block.id] });
    }
    migrated = {
      id: legacy.id,
      title: legacy.title,
      description: legacy.description,
      blockMap,
      layout,
      filters: legacy.filters,
    };
  }

  // Flatten multi-item KPI blocks into individual KPI blocks
  return flattenKpiBlocks(migrated);
}

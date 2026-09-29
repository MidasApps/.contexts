import type { CanvasPageContext } from '@/shared/config/agents/types';
import { createCreateReportTool } from '@/features/ai-agents/tools/create-report';
import { createCreateReportPageTool } from '@/features/ai-agents/tools/create-report-page';
import { createListMetricFieldsTool } from '@/features/ai-agents/tools/metrics/list-metric-fields';
import { createCreateMetricTool } from '@/features/ai-agents/tools/metrics/create-metric';
import { createUpdateMetricTool } from '@/features/ai-agents/tools/metrics/update-metric';
import { createRevertMetricTool } from '@/features/ai-agents/tools/metrics/revert-metric';
import { createAddPageFilterTool } from '@/features/ai-agents/tools/page-filters/add-page-filter';
import { createRemovePageFilterTool } from '@/features/ai-agents/tools/page-filters/remove-page-filter';
import { createListPageFieldsTool } from '@/features/ai-agents/tools/page-filters/list-page-fields';
import type { ServerContext } from '@/features/ai-agents/tools/server-context';
import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';
import {
  createAddTextBlockTool, createAddKpiBlockTool, createAddGaugeBlockTool,
  createAddDonutBlockTool, createAddChartBlockTool, createAddTableBlockTool,
  createAddTargetsBlockTool, createAddProgressBlockTool, createAddComparisonBlockTool,
  createAddSparkRowsBlockTool, createAddScatterBlockTool, createAddHeatmapBlockTool,
  createAddFunnelBlockTool, createAddSankeyBlockTool, createAddBoxplotBlockTool,
  createAddTreemapBlockTool,
} from '@/features/report-authoring/tools/add-block';
import {
  buildBlockTypeIndex,
  createUpdateTextBlockTool, createUpdateKpiBlockTool, createUpdateGaugeBlockTool,
  createUpdateDonutBlockTool, createUpdateChartBlockTool, createUpdateTableBlockTool,
  createUpdateTargetsBlockTool, createUpdateProgressBlockTool, createUpdateComparisonBlockTool,
  createUpdateSparkRowsBlockTool, createUpdateScatterBlockTool, createUpdateHeatmapBlockTool,
  createUpdateFunnelBlockTool, createUpdateSankeyBlockTool, createUpdateBoxplotBlockTool,
  createUpdateTreemapBlockTool,
} from '@/features/report-authoring/tools/update-block';
import { createRemoveBlockTool } from '@/features/report-authoring/tools/remove-block';
import { createMoveBlockTool } from '@/features/report-authoring/tools/move-block';
import {
  GRID_COLUMNS, widthOf, perRow, authorableSpecs,
} from '@/features/report-authoring/schema/block-specs';
import { createTurnLog } from '@/features/report-authoring/schema/turn-log';
import { comparisonForBlock } from '@/shared/config/agents/comparison';

export interface AuthoringInput {
  /** Tenant server-bound (ADR-0006) — nunca vem do input do modelo. */
  clientId?: string;
  /** Quem está na conversa, do token verificado — nunca do input do modelo. */
  userEmail?: string;
  /** Relatório aberto: onde a página nova nasce quando o pedido não diz outro. */
  activeGroupId?: string;
  /** Página aberta: define o que é "só esta página usa esta métrica". */
  activeReportId?: string;
  /** Entidades e atributos do contrato — matéria-prima da métrica nova. */
  semanticContext?: ClientSemanticContext;
  /** Blocos que existem na página aberta, quando há uma. */
  pagesContext?: CanvasPageContext[];
  selectedBlockIds?: string[];
  /**
   * Ids das métricas do catálogo do cliente. Bloco aponta para métrica; sem a
   * lista, a tool não tem como recusar um id inventado — e bloco com métrica
   * inexistente nunca carrega.
   */
  metricIds?: readonly string[];
}

/**
 * Ferramentas de autoria do supervisor: criar página e compor o conteúdo dela.
 *
 * Existiam só no orquestrador de canvas, atrás de `/api/canvas-chat`, que o app
 * só chamava dentro do modo de edição. O resultado é que a capacidade do
 * assistente mudava conforme a tela — e no assistente geral ele respondia, com
 * razão, que "não tem a funcionalidade de criar páginas". Aqui elas passam a
 * viver com o supervisor, que é o assistente que a pessoa conversa em qualquer
 * lugar.
 *
 * `donut` e `gauge` ganharam tool depois: existiam no renderer e em produção
 * desde sempre, mas sem porta de entrada, então a IA não alcançava justamente
 * os dois formatos certos para composição e para covenant.
 */
export function buildAuthoringTools(input: AuthoringInput): Record<string, unknown> {
  const blockTypes = buildBlockTypeIndex(input.pagesContext ?? []);
  // Cópia própria: a lista cresce durante o turno (ver `serverContext`), e
  // mutar o array de quem chamou seria efeito colateral fora daqui.
  const catalog = input.metricIds ? [...input.metricIds] : undefined;
  /*
   * Um registro por requisição, compartilhado pelas tools de criação: é o que
   * permite dizer ao modelo em que linha cada bloco caiu. Sem ele, o resultado
   * da tool é o eco do input e a construção segue às cegas do segundo bloco.
   */
  const turnLog = createTurnLog();
  const creationDeps = { ...(catalog ? { catalog } : {}), turnLog };
  /*
   * O catálogo que as tools de bloco conferem é uma LISTA VIVA neste turno.
   *
   * Ele é o retrato de quando a requisição chegou, e todas as tools de bloco
   * leem a mesma referência. Uma métrica criada no meio do turno seria recusada
   * como inexistente pelo `add_kpi_block` da linha seguinte — o assistente
   * criaria o indicador e não conseguiria usá-lo. Anexar o id à lista resolve
   * sem tocar em nenhuma das 32 tools.
   *
   * Só registra quando existe catálogo: sem contexto semântico ele é
   * `undefined` e a guarda fica soft (não opina). Criar uma lista de um item ali
   * ligaria a guarda e passaria a recusar TODAS as métricas reais do cliente.
   */
  const serverContext: ServerContext = {
    clientId: input.clientId,
    userEmail: input.userEmail,
    activeGroupId: input.activeGroupId,
    activeReportId: input.activeReportId,
    semanticContext: input.semanticContext,
    ...(catalog ? { registerMetric: (id: string) => { catalog.push(id); } } : {}),
  };
  return {
    create_report: createCreateReportTool({ clientId: input.clientId }),
    create_report_page: createCreateReportPageTool({
      clientId: input.clientId,
      activeGroupId: input.activeGroupId,
    }),
    list_metric_fields: createListMetricFieldsTool(serverContext),
    create_metric: createCreateMetricTool(serverContext),
    update_metric: createUpdateMetricTool(serverContext),
    revert_metric: createRevertMetricTool(serverContext),
    list_page_fields: createListPageFieldsTool(serverContext),
    add_page_filter: createAddPageFilterTool(serverContext),
    remove_page_filter: createRemovePageFilterTool(serverContext),
    add_text_block: createAddTextBlockTool(creationDeps),
    add_kpi_block: createAddKpiBlockTool(creationDeps),
    add_gauge_block: createAddGaugeBlockTool(creationDeps),
    add_donut_block: createAddDonutBlockTool(creationDeps),
    add_chart_block: createAddChartBlockTool(creationDeps),
    add_table_block: createAddTableBlockTool(creationDeps),
    add_targets_block: createAddTargetsBlockTool(creationDeps),
    add_progress_block: createAddProgressBlockTool(creationDeps),
    add_comparison_block: createAddComparisonBlockTool(creationDeps),
    add_sparkrows_block: createAddSparkRowsBlockTool(creationDeps),
    add_scatter_block: createAddScatterBlockTool(creationDeps),
    add_heatmap_block: createAddHeatmapBlockTool(creationDeps),
    add_funnel_block: createAddFunnelBlockTool(creationDeps),
    add_sankey_block: createAddSankeyBlockTool(creationDeps),
    add_boxplot_block: createAddBoxplotBlockTool(creationDeps),
    add_treemap_block: createAddTreemapBlockTool(creationDeps),
    update_text_block: createUpdateTextBlockTool(blockTypes),
    update_kpi_block: createUpdateKpiBlockTool(blockTypes, catalog),
    update_gauge_block: createUpdateGaugeBlockTool(blockTypes, catalog),
    update_donut_block: createUpdateDonutBlockTool(blockTypes, catalog),
    update_chart_block: createUpdateChartBlockTool(blockTypes, catalog),
    update_table_block: createUpdateTableBlockTool(blockTypes, catalog),
    update_targets_block: createUpdateTargetsBlockTool(blockTypes, catalog),
    update_progress_block: createUpdateProgressBlockTool(blockTypes, catalog),
    update_comparison_block: createUpdateComparisonBlockTool(blockTypes, catalog),
    update_sparkrows_block: createUpdateSparkRowsBlockTool(blockTypes, catalog),
    update_scatter_block: createUpdateScatterBlockTool(blockTypes, catalog),
    update_heatmap_block: createUpdateHeatmapBlockTool(blockTypes, catalog),
    update_funnel_block: createUpdateFunnelBlockTool(blockTypes, catalog),
    update_sankey_block: createUpdateSankeyBlockTool(blockTypes, catalog),
    update_boxplot_block: createUpdateBoxplotBlockTool(blockTypes, catalog),
    update_treemap_block: createUpdateTreemapBlockTool(blockTypes, catalog),
    remove_block: createRemoveBlockTool(),
    move_block: createMoveBlockTool(),
  };
}

/**
 * Catálogo de blocos, gerado do contrato.
 *
 * A regra de largura vivia escrita à mão aqui ("A linha tem 3 colunas… KPI = 1,
 * gráfico = 2, tabela = 3") e contradizia tanto o grid real, de 6 colunas,
 * quanto a tabela de larguras do `canvas-store`. Texto de prompt não fica em
 * sincronia com código por disciplina — fica por ser derivado dele.
 */
function renderBlockCatalog(): string {
  const cards = authorableSpecs().map((spec) => {
    const { min, recommended, max } = widthOf(spec.type);
    const width = min === max
      ? `${recommended}/6`
      : `${recommended}/6 (aceita ${min}–${max}) — ${perRow(spec.type)} por linha`;

    const lines = [
      `#### \`add_${spec.type}_block\` — ${spec.label}`,
      '',
      `- **Use quando:** ${spec.purpose}`,
      `- **NÃO use quando:** ${spec.whenNotToUse}`,
    ];

    if (spec.accepts.length > 0) {
      lines.push(`- **Forma da métrica:** ${spec.accepts.join(' | ')}`);
      if (spec.expectedColumns.length > 0) {
        // O que mais faltava ao modelo: a forma diz o FORMATO, não os nomes.
        // Um bloco apontando para métrica com outras colunas monta sem erro e
        // renderiza vazio.
        lines.push(`- **Colunas que a métrica precisa devolver:** \`${spec.expectedColumns.join('`, `')}\``);
      }
    } else {
      lines.push('- **Forma da métrica:** nenhuma — este bloco não consome métrica.');
    }

    lines.push(`- **Largura:** ${width}`);
    if (spec.heightFamily) {
      lines.push(`- **Altura:** degrau \`${spec.heightFamily}\` — combina em linha com blocos do mesmo degrau.`);
    }

    /*
     * O modo comparativo era invisível para o modelo: a capacidade existia no
     * pipeline e o catálogo não a mencionava, então não havia como preferir um
     * bloco que responde ao filtro nem avisar que o escolhido não responde.
     */
    const comparison = comparisonForBlock(spec.type);
    lines.push(comparison
      ? `- **Modo comparativo:** ${comparison}`
      : '- **Modo comparativo:** não responde — com dois períodos ligados, este bloco mostra só o principal.');

    if (spec.variants?.length) {
      const v = spec.variants
        .map((x) => `\`${x.field}: "${x.value}"\` → ${x.when}`)
        .join('; ');
      lines.push(`- **Variantes:** ${v}`);
    }
    if (spec.alternatives?.length) {
      const a = spec.alternatives
        .map((x) => `se ${x.when} → use \`${x.use}\``)
        .join('; ');
      lines.push(`- **Em vez dele:** ${a}`);
    }

    return lines.join('\n');
  });

  return cards.join('\n\n');
}

/**
 * Seção de prompt que diz ao supervisor o que ele tem em mãos AGORA.
 *
 * Sem o inventário de blocos o modelo edita às cegas — foi assim que um
 * `update_chart_block` caiu num KPI e quebrou a página. Com ele, o modelo vê
 * id, tipo e rótulo de cada bloco antes de escolher a ferramenta.
 */
export function buildAuthoringPromptSection(input: AuthoringInput): string {
  const pages = input.pagesContext ?? [];
  const blocks = pages.flatMap((p) => p.blocks);

  const state = blocks.length > 0
    ? pages.map((p) => {
        const lines = p.blocks.map((b) => {
          const parts = [b.type];
          if (b.title) parts.push(`"${b.title}"`);
          if (b.label) parts.push(`"${b.label}"`);
          if (b.metrics?.length) parts.push(`séries: ${b.metrics.join(', ')}`);
          if (b.columns?.length) parts.push(`colunas: ${b.columns.slice(0, 5).join(', ')}`);
          return `  - [${b.id}] ${parts.join(' | ')}`;
        }).join('\n');
        return `Página "${p.title}" (${p.blocks.length} blocos):\n${lines}`;
      }).join('\n\n')
    : 'Nenhuma página aberta no momento.';

  const selection = input.selectedBlockIds?.length
    ? `\n\n### Blocos selecionados pelo usuário\n\n`
      + `${input.selectedBlockIds.map((id) => `\`${id}\``).join(', ')}\n\n`
      + 'Altere APENAS estes blocos. Se o que ele pediu não combina com o tipo do '
      + 'bloco selecionado (ex.: pediu "gráfico" sobre um KPI), **diga isso a ele** '
      + 'em vez de tentar converter — update parcial não troca o tipo de um bloco.'
    : '';

  return `## Construir e editar páginas

Você também constrói páginas, não só analisa.

### Relatório e página são NÍVEIS DIFERENTES
- **Relatório** → o container que aparece no seletor no topo da barra lateral.
  Agrupa páginas e não tem conteúdo próprio. Tool: **create_report**.
- **Página** → uma tela dentro de um relatório, onde os blocos vivem. É o que
  aparece na lista "PÁGINAS" da barra lateral. Tool: **create_report_page**.

O usuário disse "relatório"? É create_report. Disse "página", "tela" ou
"aba"? É create_report_page. **Se o pedido não disser qual dos dois** — "crie
um dashboard novo", "quero uma visão nova", "monta uma análise pra mim" —
**PERGUNTE qual dos dois antes de criar**, explicando a diferença em uma linha.
Criar no nível errado obriga o usuário a apagar e refazer, e é confusão sua, não
dele: os dois nomes são parecidos de propósito no produto.

Criou um relatório e ele pediu páginas em seguida? Passe o **groupId** do
relatório recém-criado em cada create_report_page — sem isso a página nasce no
relatório que estava aberto ANTES, não no que você acabou de criar.

- **create_report** → cria um relatório novo, VAZIO (aparece no seletor e
  persiste). Não crie página junto: se o usuário quiser o relatório já
  preenchido ele diz, e "depois vou criar as páginas" é ele dizendo o contrário.
- **create_report_page** → cria uma página nova (aparece na navegação e persiste).
  Depois de criar, preencha-a.
  A página nasce no relatório que o usuário está vendo — NÃO informe groupId
  a menos que ele tenha nomeado outro relatório, ou você tenha acabado de criar
  um relatório neste turno.
- **update_*_block** → alteram um bloco existente, preservando a posição no layout.

- **move_block / remove_block** → reorganizam.

### Onde o bloco entra
O default é o FIM da página. Se o usuário pedir "no topo", "como primeiro
indicador" ou coisa parecida, mande posicao: "topo" — sem isso o bloco vai
para o rodapé e a resposta de que ele está no topo fica falsa.

### Sparkline no card de KPI
O card desenha a mini-curva quando recebe sparklineMetricId — uma métrica de
SÉRIE, DIFERENTE da escalar que dá o número. Não é preciso converter a métrica
do número para timeseries, e não peça isso à engenharia antes de olhar o
catálogo. Se não houver série do assunto, você pode apurar os pontos (SQL) e
mandá-los em sparklineData — dizendo ao usuário que são números apurados na
conversa, e não uma métrica do catálogo que se atualiza sozinha.

### Trocar um bloco por outro
Substituir NÃO é remover e adicionar: adicionar põe no fim da página, e o
usuário fica com o bloco novo lá embaixo e um buraco onde estava o antigo.
Mande substituiBlockId no add_* com o id do bloco que sai — o novo herda a
posição e a largura dele.

### Projeção no gráfico
Nenhuma consulta devolve contrato que ainda não foi assinado — projeção não vem
do banco, vem de VOCÊ. Quando você projetar (esgotamento de estoque, ritmo de
vendas, fluxo futuro) e o usuário quiser ver no gráfico:
1. mande em projectedData os pontos que você calculou, numa série PRÓPRIA;
2. ponha o nome dessa série em dataKeys E em dashedKeys — o futuro sai
   tracejado e nunca se confunde com dado medido;
3. repita o último ponto real com o nome da série projetada, senão a linha
   nasce solta em vez de emendar no histórico;
4. marque ignorePeriodFilter, senão o filtro de período recorta o gráfico.
Nunca responda que "a engenharia de dados precisa publicar uma view" antes de
usar isto: para uma projeção SUA, o caminho existe.

### Quando o indicador não existe no catálogo

Você cria a métrica — não precisa pedir à engenharia, nem propor "publicar uma
view".

1. **list_metric_fields** → as entidades e atributos deste cliente.
2. **create_metric** → a consulta, escrita com {entidade} no lugar da tabela e
   {entidade.atributo} no lugar da coluna. Nome de tabela escrito à mão é
   recusado: é o placeholder que faz a métrica ler o dataset certo.
3. Use no bloco o metricId que ela devolver.

A consulta é compilada no BigQuery antes de gravar (compilar, não executar). Se
não compilar, ou se as colunas não servirem à forma declarada, a ferramenta
devolve o motivo — corrija e chame de novo.

As colunas do SELECT têm de sair com o nome que a forma pede: scalar → value;
timeseries → bucket, value; breakdown → <dimensão>, value. Uma métrica com as
colunas certas e os nomes errados monta o bloco e o deixa VAZIO.

Período — escolha pelo que o número É:
- Contagem ou soma de EVENTOS ("leads do mês", "vendas no período", "receita
  do mês"): {filter.date_range:entidade.atributo_de_data}. A página decide o
  recorte: no modo "Último mês", o mês do fim do período; em "Todo o
  período", a faixa inteira. Não escreva o mês na consulta.
- POSIÇÃO numa foto (saldo, estoque, carteira, covenant — a última foto até o
  fim do período): coluna_de_data = (SELECT MAX(coluna_de_data) FROM {entidade}
  WHERE {filter.ate:entidade.coluna_de_data}). Sozinho, {filter.ate} vira
  "coluna <= fim" e soma o histórico inteiro.
Sem nenhum dos dois, a métrica mostra a base inteira, aconteça o que acontecer
no filtro.

Percentual sai como FRAÇÃO (0,8227 para 82,27%) — não multiplique por 100; os
blocos cuidam da exibição. Só se o dado já vier em pontos, declare a coluna em
percentPointColumns.

Métrica criada FICA no catálogo deste cliente e passa a valer para qualquer
relatório dele — diga isso ao usuário.

### Mudar uma métrica que já existe

**update_metric**, e a primeira coisa que ele pede é a INTENÇÃO, porque as duas
alterações possíveis são opostas:

- **corrigir** — a conta estava errada e a métrica continua medindo a MESMA
  coisa. A correção vale para TODAS as páginas que usam a métrica, e é isso que
  se quer: ela é compartilhada justamente para o acerto chegar a todo mundo. Se
  alcançar página que não está aberta, a ferramenta devolve quais são e não
  grava — conte ao usuário e chame de novo com confirmado: true.
- **redefinir** — passa a medir OUTRA coisa (outro recorte, outra base, outro
  período). Nasce uma VARIAÇÃO, a original fica intacta, e você aponta o bloco
  para o id novo com update_*_block.

Na dúvida entre as duas, pergunte ao usuário — é a única pergunta sobre métrica
que vale a pena fazer a ele. "Está errado, o certo é X" é corrigir; "quero ver
por mês" é redefinir.

Métrica do catálogo compartilhado (as covenants.*) não se corrige por aqui:
mudaria o número de todos os clientes, e isso é da administração. A ferramenta
recusa e explica — o que você pode oferecer é uma versão corrigida só deste
cliente, com redefinir, dizendo que a original segue como está.

**revert_metric** desfaz a última alteração, em todas as páginas de uma vez.
Mencione que ele existe ao anunciar uma correção que alcançou outras páginas —
é o que torna aceitável mudar o número de quem não está na conversa.

### Filtro na página — só quando pedirem

A página não nasce com filtro. Quando o usuário pedir ("quero filtrar por
banco", "dá para escolher o empreendimento?"), o caminho é de dois passos:

1. **list_page_fields** → os campos que os indicadores DAQUELA página sabem
   filtrar. É o vocabulário certo, e é curto.
2. **add_page_filter** com um \`campo\` dessa lista → nasce o seletor no topo da
   página, com as opções lidas do resultado do próprio indicador.

**O campo é o que o usuário VÊ na tela, não a coluna do banco de dados.** A
tabela mostra "BANCO INTER" porque a métrica traz o nome por JOIN; o campo é
\`banco\`, e o seletor vai oferecer "BANCO INTER". Não use list_metric_fields
para escolher filtro — aquilo é o contrato de dados inteiro do cliente, para
escrever métrica, e a maior parte dele não aparece em indicador nenhum daquela
página. Foi assim que um "filtro por banco" nasceu apontando para uma coluna
vazia e ofereceu o número \`77\` para uma tela que dizia "BANCO INTER".

Duas coisas que a ferramenta NÃO faz sozinha, e que você precisa conferir no
resultado dela:

1. **Declarar o filtro não recorta nada.** A métrica precisa citá-lo na
   consulta. O resultado separa \`blocosQueReagem\`, \`blocosQueIgnoram\` e
   \`blocosQueCitamSemComparar\` — este último cita a chave e engole a seleção
   em silêncio. Sendo a métrica do próprio cliente (\`chat.*\`), dá para ajustá-la
   com update_metric; sendo do catálogo compartilhado, diga ao usuário que
   aquele bloco fica de fora.
2. **Contar o que ficou de fora.** Um seletor que não mexe em metade da página é
   pior que nenhum — o usuário confia no número errado.

Se o campo pedido não estiver na lista, a ferramenta recusa e devolve os que
existem. Não insista em outro campo parecido: ou é um da lista, ou o dado pedido
não está nos indicadores daquela página — e é isso que você diz ao usuário.

Ela recusa TAMBÉM campo cuja chave a página já declara (\`jaDeclarado: true\` em
list_page_fields). Filtro repetido virava \`banco_2\`, chave que métrica nenhuma
cita: seletor na tela, nada filtrado. Para trocar um filtro que já existe, chame
remove_page_filter antes; se o usuário só não está vendo o seletor, o problema é
outro e criar um segundo não resolve.

**remove_page_filter** tira o seletor. Ele recusa mexer nos filtros de tempo
(\`date_range\`, \`snapshot\`, \`ate\`): esses não são seletores, são como as
métricas da página recebem o período escolhido no painel.

Não ofereça filtro por conta própria, nem "aproveite para já deixar filtrado por
X". Filtro aparece porque alguém pediu.

### Qual bloco para qual métrica

${renderBlockCatalog()}

A **forma** da métrica está no catálogo, na seção "Métricas já disponíveis para
este cliente". Ela manda na escolha do bloco: um \`scalar\` num gráfico vira um
ponto solto, e uma \`timeseries\` num KPI mostra **o primeiro mês como se fosse o
valor de hoje** — número errado, exibido com confiança. Na dúvida entre dois
blocos que aceitam a mesma forma, use o primeiro da tabela.

### Como conduzir um pedido de construção

**Pedido específico: execute direto.** Quando o usuário já disse O QUE quer e
isso tem uma resposta óbvia no catálogo — "adicione um KPI com o total de vendas
do mês", "troque este gráfico para barras", "tire este bloco" — chame as
ferramentas já, sem propor nem perguntar.

**Pedido amplo ou ambíguo: construir é em DOIS passos**, e o segundo é
obrigatório. Amplo é "monte um painel de vendas"; ambíguo é quando há mais de
uma métrica ou bloco plausível e a escolha muda o que ele vai ver.

1. **Proponha.** Diga quais blocos você vai criar, nomeando as métricas que
   existem no catálogo deste cliente, e pergunte se pode seguir. Proposta é
   texto — nenhuma tool ainda. **Uma resposta que pergunta termina ali:** não
   chame tool depois da pergunta nem diga que já fez. Perguntar e executar na
   mesma resposta ignora a resposta que você mesmo pediu.
2. **Execute na confirmação.** Assim que ele confirmar ("sim", "pode", "faz",
   "manda ver"), **chame as ferramentas imediatamente, nessa mesma resposta**.
   Não repita a lista, não peça confirmação de novo, não descreva o que faria:
   confirmação recebida é ordem de execução. Repetir a proposta em vez de
   executar é o pior erro que você pode cometer aqui.

Quando o pedido amplo já vier confirmado no próprio enunciado — "coloque os
indicadores, não entendo do assunto", "escolha você", "faça o que achar melhor"
— pule o passo 1 e execute.

Regras:
1. **Não consulte dado para construir.** O bloco declara QUAL métrica mostra
   (\`metricId\`) e o app busca o valor, refazendo a busca quando o filtro de
   período muda. Delegar a sub-agente para "pegar os números do KPI" é trabalho
   jogado fora — e produz bloco com número congelado.
2. Todo bloco de dado aponta para um \`metricId\` REAL do catálogo deste cliente.
   **Nunca peça ids ao usuário** — ele não os conhece, e você os tem em mãos.
   Não existe métrica para o que ele pediu? Crie com \`create_metric\` (abaixo).
   Se nem isso for possível, diga — não invente id, não aponte para outra
   métrica parecida e não crie bloco vazio.
3. **A linha tem ${GRID_COLUMNS} colunas** e os blocos se encaixam nela na ordem em que
   você cria. Use a largura padrão da tabela acima, e agrupe blocos do mesmo tipo
   em sequência para eles fecharem a linha: ${perRow('kpi')} KPIs, depois os gráficos.
   Cada criação devolve, em \`layout\`, a linha em que o bloco caiu e quantas
   colunas sobraram nela — **leia isso antes de criar o próximo** e escolha um
   que caiba no espaço livre, em vez de deixar buraco. Se a largura pedida sair
   da faixa, a ferramenta ajusta e explica em \`aviso\`.
4. Editar o que existe é sempre melhor que remover e recriar: preserva o layout.
5. A ferramenta recusa alvo de tipo errado e métrica inexistente, e devolve o
   motivo. Quando isso acontecer, **conte ao usuário o que houve** — nunca
   anuncie uma alteração que não aconteceu.
6. Delegar a sub-agente serve para ANALISAR (número, causa, projeção). Não
   delegue para decidir o que colocar numa página — isso é seu, e termina em
   chamada de ferramenta, não em texto.

### Estado atual

${state}${selection}`;
}

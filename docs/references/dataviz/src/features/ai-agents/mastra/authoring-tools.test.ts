import { describe, it, expect, vi } from 'vitest';
import type { ServerContext } from '@/features/ai-agents/tools/server-context';

const h = vi.hoisted(() => ({ metricCtx: null as ServerContext | null }));

// Só para alcançar o contexto que a tool de criação recebe — é por ele que a
// métrica criada no turno entra no catálogo que as tools de bloco conferem.
vi.mock('@/features/ai-agents/tools/metrics/create-metric', () => ({
  createCreateMetricTool: (ctx: ServerContext) => {
    h.metricCtx = ctx;
    return { execute: async () => ({}) };
  },
}));

import { buildAuthoringTools, buildAuthoringPromptSection } from './authoring-tools';
import { authorableSpecs } from '@/features/report-authoring/schema/block-specs';
import type { CanvasPageContext } from '@/shared/config/agents/types';

const pageContexts: CanvasPageContext[] = [{
  id: 'empreendimento',
  title: 'Empreendimento',
  blocks: [
    { id: 'kpi-emp-vgv', type: 'kpi', label: 'Projeto VGV' },
    { id: 'chart-evolucao', type: 'chart', title: 'Evolução' },
  ],
  layout: [{ rowIndex: 0, blockIds: ['kpi-emp-vgv', 'chart-evolucao'] }],
}];

/**
 * O supervisor só analisava; quem construía era o orquestrador de canvas, atrás
 * de outra rota, alcançável apenas no modo de edição. Por isso o assistente
 * geral respondia — corretamente sobre si mesmo — que não sabia criar páginas.
 */
describe('buildAuthoringTools', () => {
  /*
   * `donut` e `gauge` renderizam e estão em produção desde sempre, mas não
   * tinham tool: a IA não alcançava o bloco certo para composição nem para
   * covenant, que é o assunto do produto.
   *
   * A lista esperada é DERIVADA do contrato, não escrita à mão. Escrita à mão,
   * ela só provava que alguém tinha atualizado duas listas ao mesmo tempo — e
   * falhava por desatualização em vez de por defeito. Derivada, ela verifica o
   * que o nome do teste diz: todo bloco autorável tem porta de entrada.
   */
  it('entrega criar página e uma ferramenta para cada bloco autorável', () => {
    const tools = buildAuthoringTools({ clientId: 'vila-rosa' });
    const authorable = authorableSpecs().map((s) => s.type);

    const expected = [
      // Os DOIS níveis da hierarquia têm porta de entrada. Com só
      // `create_report_page`, "crie um novo relatório chamado Teste" virava uma
      // página chamada Teste — o modelo usou a única tool que havia.
      'create_report', 'create_report_page', 'move_block', 'remove_block',
      // Métrica: o bloco aponta para uma, e quando ela não existe o assistente
      // passa a poder criá-la em vez de recusar o pedido.
      'list_metric_fields', 'create_metric', 'update_metric', 'revert_metric',
      // Filtro é em dois passos desde a ADR-0026: ver os campos que os
      // indicadores DA PÁGINA oferecem, e só então declarar o seletor.
      'list_page_fields', 'add_page_filter', 'remove_page_filter',
      ...authorable.map((t) => `add_${t}_block`),
      ...authorable.map((t) => `update_${t}_block`),
    ].sort();

    expect(Object.keys(tools).sort()).toEqual(expected);
  });

  /**
   * O prompt classifica "crie um dashboard novo" como pedido AMBÍGUO e manda
   * perguntar. A descrição da tool de página dizia "use quando pedirem
   * página/dashboard novo": duas instruções contraditórias no mesmo contexto, e
   * entre perguntar e executar o modelo escolhe a mais fácil — foi assim que a
   * regra de "não existe métrica? recuse" ganhou da de criar.
   */
  it('a descrição da tool de página não reivindica a palavra que o prompt manda perguntar', () => {
    const tools = buildAuthoringTools({ clientId: 'vila-rosa' });
    const pageTool = tools.create_report_page as { description: string };
    expect(pageTool.description).not.toMatch(/dashboard/i);
    // E ela aponta para a irmã, para o modelo saber que existe outro nível.
    expect(pageTool.description).toMatch(/create_report\b/);
  });

  /*
   * Bloco autorável sem tool é invisível para a IA; tool sem bloco autorável é
   * uma ferramenta que produz algo que o renderer não desenha. O teste acima já
   * cobre os dois sentidos — este fixa o piso, para que "derivar de uma lista
   * vazia" não passe por acaso.
   */
  it('todo bloco de indicador do renderer é autorável', () => {
    const authorable = authorableSpecs().map((s) => s.type);
    for (const blockType of ['kpi', 'gauge', 'donut', 'chart', 'table', 'text',
      'targets', 'progress', 'comparison', 'sparkrows', 'scatter', 'heatmap']) {
      expect(authorable, `${blockType} não é autorável`).toContain(blockType);
    }
  });

  // A validação de métrica existia só nos `add_*`: trocar a métrica de um bloco
  // por um id inventado passava batido e só aparecia como 404 do batch.
  it('update também recusa metricId fora do catálogo', async () => {
    const tools = buildAuthoringTools({ clientId: 'vila-rosa', metricIds: ['covenants.saldo_devedor'] });
    const updateKpi = tools.update_kpi_block as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> };
    const r = await updateKpi.execute({ blockId: 'b1', metricId: 'covenants.inventada' });
    expect(r.error).toBe('METRIC_NOT_FOUND');
    expect(r.action).toBeUndefined();
  });

  // A recusa de alvo de tipo errado depende do índice montado do pagesContext.
  it('as tools de update sabem o tipo dos blocos da página aberta', async () => {
    const tools = buildAuthoringTools({ clientId: 'vila-rosa', pagesContext: pageContexts });
    const updateChart = tools.update_chart_block as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> };

    const recusa = await updateChart.execute({ blockId: 'kpi-emp-vgv', chartType: 'bar' });
    expect(recusa.error).toBe('BLOCK_TYPE_MISMATCH');

    const ok = await updateChart.execute({ blockId: 'chart-evolucao', chartType: 'bar' });
    expect(ok.action).toBe('update_block');
  });

  /**
   * As tools nasceram na era do canvas: pediam `value` formatado e dez pontos de
   * sparkline no payload. Valor literal não acompanha o filtro de período — é
   * número congelado no documento. Bloco declara métrica; o app busca o dado.
   */
  it('bloco de dado exige metricId e não aceita valor literal', async () => {
    const tools = buildAuthoringTools({ clientId: 'vila-rosa', metricIds: ['covenants.saldo_devedor'] });
    const addKpi = tools.add_kpi_block as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> };

    const r = await addKpi.execute({ metricId: 'covenants.saldo_devedor', label: 'Saldo Devedor', format: 'currency' });
    const block = r.block as Record<string, unknown>;
    expect(block.metricId).toBe('covenants.saldo_devedor');
    expect(block).not.toHaveProperty('value');
    expect(block).not.toHaveProperty('sparklineData');
  });

  it('recusa metricId fora do catálogo do cliente', async () => {
    const tools = buildAuthoringTools({ clientId: 'vila-rosa', metricIds: ['covenants.saldo_devedor'] });
    const addKpi = tools.add_kpi_block as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> };
    const r = await addKpi.execute({ metricId: 'covenants.inventada', label: 'X' });
    expect(r.error).toBe('METRIC_NOT_FOUND');
    expect(r.action).toBeUndefined();
  });

  /**
   * O catálogo que as tools de bloco conferem é o retrato de quando a
   * requisição chegou. Sem uma lista viva, a métrica criada no meio do turno
   * seria recusada como inexistente pelo `add_*_block` da linha seguinte — o
   * assistente criaria o indicador e não conseguiria usá-lo.
   */
  it('métrica criada no turno passa a ser aceita pelos blocos', async () => {
    const metricIds = ['covenants.saldo_devedor'];
    const tools = buildAuthoringTools({ clientId: 'vila-rosa', metricIds });
    const addKpi = tools.add_kpi_block as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> };

    const before = await addKpi.execute({ metricId: 'chat.nova', label: 'X' });
    expect(before.error).toBe('METRIC_NOT_FOUND');

    h.metricCtx!.registerMetric!('chat.nova');

    const after = await addKpi.execute({ metricId: 'chat.nova', label: 'X' });
    expect(after.error).toBeUndefined();
    expect((after.block as Record<string, unknown>).metricId).toBe('chat.nova');
    // A lista de quem chamou não é mutada — a cópia é do turno.
    expect(metricIds).toEqual(['covenants.saldo_devedor']);
  });

  /**
   * Sem contexto semântico não há catálogo, e a guarda de bloco fica soft. Criar
   * uma lista de um item ali ligaria a guarda e passaria a recusar TODAS as
   * métricas reais do cliente.
   */
  it('sem catálogo não há onde registrar — a guarda continua soft', async () => {
    buildAuthoringTools({ clientId: 'vila-rosa' });
    expect(h.metricCtx!.registerMetric).toBeUndefined();
  });

  it('sem página aberta as tools continuam disponíveis e permissivas', async () => {
    const tools = buildAuthoringTools({ clientId: 'vila-rosa' });
    const updateChart = tools.update_chart_block as { execute: (a: Record<string, unknown>) => Promise<Record<string, unknown>> };
    const r = await updateChart.execute({ blockId: 'qualquer', chartType: 'bar' });
    expect(r.action).toBe('update_block');
  });
});

describe('buildAuthoringPromptSection', () => {
  /**
   * O modelo delegava ao sub-agente descritivo, devolvia uma lista de
   * indicadores e perguntava "gostaria que eu adicionasse?" — e na confirmação
   * repetia a proposta. O contrato de dois passos precisa estar escrito.
   */
  it('manda executar as tools na confirmação, sem repropor', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/DOIS passos/i);
    expect(text).toMatch(/chame as ferramentas imediatamente/i);
    expect(text).toMatch(/n[ãa]o pe[çc]a confirma[çc][ãa]o de novo/i);
  });

  it('pedido já confirmado no enunciado pula a proposta', () => {
    expect(buildAuthoringPromptSection({})).toMatch(/pule o passo 1 e execute/i);
  });

  /**
   * "Adicione um KPI com o total de vendas do mês": o modelo respondeu "Posso
   * prosseguir?" e criou o bloco na mesma resposta. O prompt mandava propor
   * sempre, e o pedido era específico.
   */
  it('pedido específico é executado direto, e pergunta não vem junto com execução', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/Pedido específico: execute direto/);
    expect(text).toMatch(/Uma resposta que pergunta termina ali/);
    expect(text).toMatch(/não\s+chame tool depois da pergunta/);
  });

  /**
   * "Crie um novo relatório chamado Teste, depois vou criar as páginas" virou
   * uma PÁGINA chamada Teste. Faltava a tool, mas faltava também o vocabulário:
   * nada no prompt dizia que relatório e página são níveis diferentes, e o
   * assistente respondeu "criei o relatório/página Teste" — a barra é ele
   * admitindo que não sabia qual dos dois havia criado.
   */
  it('escreve que relatório e página são níveis diferentes, com a tool de cada um', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/\*\*Relat[óo]rio\*\*/);
    expect(text).toMatch(/\*\*P[áa]gina\*\*/);
    expect(text).toMatch(/create_report\b/);
    expect(text).toMatch(/agrupa p[áa]ginas/i);
  });

  /**
   * A regra que o usuário pediu: na dúvida, perguntar. "Crie um dashboard novo"
   * não diz o nível, e criar no nível errado obriga a apagar e refazer.
   */
  it('manda perguntar quando o pedido não diz se é relatório ou página', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/PERGUNTE/);
    expect(text).toMatch(/antes de criar/i);
  });

  /**
   * Criar o relatório e sair sem página deixa o usuário numa tela vazia. Quando
   * ele mesmo já disse que vai criar as páginas, respeite — mas o relatório
   * novo é o endereço das páginas seguintes, e isso precisa estar escrito para
   * a página não nascer no relatório anterior.
   */
  it('manda usar o relatório recém-criado como destino das páginas seguintes', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/groupId/);
    expect(text).toMatch(/rec[ée]m-criado|acabou de criar/i);
  });

  /**
   * A regra antiga mandava dizer "não existe" e parar. Com create_metric isso
   * virou contradição: as duas frases no mesmo prompt fariam o modelo escolher
   * a mais fácil, que é a recusa.
   */
  it('manda criar a métrica quando o indicador não existe, em vez de recusar', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/Crie com `create_metric`/);
    expect(text).toMatch(/list_metric_fields/);
    expect(text).not.toMatch(/N[ãa]o existe m[ée]trica para o que ele pediu\? Diga isso/);
  });

  /**
   * O erro que motivou tudo: o assistente propôs converter uma métrica
   * `covenants.*` — global — para série, sem saber que ela alimenta outras
   * páginas e outros clientes.
   */
  it('escreve a diferença entre corrigir e redefinir, e o que cada uma custa', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/update_metric/);
    // Corrigir alcança todo mundo — é o ponto de a métrica ser compartilhada.
    expect(text).toMatch(/TODAS as p[áa]ginas/);
    expect(text).toMatch(/confirmado: true/);
    // Redefinir não mexe em quem já usava.
    expect(text).toMatch(/VARIA[ÇC][ÃA]O/);
    // E corrigir catálogo compartilhado não sai daqui.
    expect(text).toMatch(/administra[çc][ãa]o/);
    expect(text).toMatch(/revert_metric/);
  });

  /**
   * O painel global perdeu os controles que não filtravam nada. O que fica é o
   * filtro de PÁGINA — e ele não pode voltar a ser pré-instalado em toda tela.
   */
  it('manda criar filtro só quando pedirem, e conferir quem ele alcança', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/add_page_filter/);
    expect(text).toMatch(/só quando pedirem/i);
    expect(text).toMatch(/blocosQueReagem/);
    expect(text).toMatch(/remove_page_filter/);
  });

  /*
   * ADR-0026: o campo do filtro sai dos indicadores DA PÁGINA. Sem esta
   * instrução o modelo volta a escolher no contrato inteiro do cliente — foi
   * assim que um "filtro por banco" nasceu apontando para coluna vazia.
   */
  it('manda ver os campos da página antes, e não confundir com o contrato de dados', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/list_page_fields/);
    expect(text).toMatch(/o que o usuário VÊ na tela/i);
    expect(text).toMatch(/Não use list_metric_fields\s+para escolher filtro/i);
  });

  /*
   * A ferramenta recusa chave já declarada (`FILTRO_JA_EXISTE`) — item 6 da
   * ADR-0026. O prompt não dizia isso, e `list_page_fields` devolve
   * `jaDeclarado` sem avisar que escolher um desses volta como recusa: o modelo
   * gastava um turno para descobrir uma restrição que o contrato dele omitia.
   */
  it('avisa que filtro já declarado é recusado, e qual é o caminho de troca', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/jaDeclarado/);
    expect(text).toMatch(/remove_page_filter antes/i);
  });

  it('escreve as convenções que fazem a métrica nova funcionar', () => {
    const text = buildAuthoringPromptSection({});
    // Nome de coluna por forma: com os nomes errados o bloco monta e fica vazio.
    expect(text).toMatch(/scalar → value/);
    expect(text).toMatch(/timeseries → bucket, value/);
    // Placeholders de filtro: sem eles a métrica ignora o período.
    expect(text).toMatch(/\{filter\.date_range:/);
    expect(text).toMatch(/\{filter\.ate:/);
  });

  it('proíbe consultar dado para construir bloco', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/N[ãa]o consulte dado para construir/i);
    expect(text).toMatch(/metricId/);
  });

  /*
   * A largura vivia escrita à mão aqui ("A linha tem 3 colunas… KPI = 1") e
   * contradizia o grid real, de 6. Agora a tabela é gerada do contrato de bloco:
   * se a régua mudar no contrato, o prompt muda junto — é o ponto do exercício.
   */
  it('gera uma ficha por bloco autorável, derivada do contrato', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/A linha tem 6 colunas/);
    for (const spec of authorableSpecs()) {
      expect(text, spec.type).toContain(`add_${spec.type}_block`);
    }
    // Tabela ocupa a linha inteira; KPI cabe três por linha.
    expect(text).toMatch(/add_kpi_block[\s\S]*?3 por linha/);
    expect(text).toMatch(/add_table_block[\s\S]*?\*\*Largura:\*\* 6\/6/);
  });

  /**
   * O que o catálogo antigo NÃO dizia, e que produzia bloco vazio em silêncio.
   *
   * `aceita: ['points']` informa a FORMA, não os nomes das colunas. Um scatter
   * apontando para métrica que devolve `ltv`/`atraso` em vez de `x`/`y` monta
   * sem erro nenhum e renderiza vazio — o pipeline procura as chaves e não as
   * acha. A ficha agora nomeia as colunas exigidas.
   */
  it('a ficha nomeia as colunas que a métrica precisa devolver', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/add_scatter_block[\s\S]*?Colunas que a métrica precisa devolver[\s\S]*?`x`, `y`/);
    expect(text).toMatch(/add_heatmap_block[\s\S]*?`row`, `col`, `value`/);
    expect(text).toMatch(/add_targets_block[\s\S]*?`label`, `value`, `target`/);
  });

  /**
   * Catálogo que só diz para que serve cada bloco deixa o modelo escolher pelo
   * primeiro que encaixa na forma. O erro caro é sempre um bloco que ACEITA a
   * métrica e mesmo assim é o formato errado para ela.
   */
  it('a ficha diz quando NÃO usar e para onde ir', () => {
    const text = buildAuthoringPromptSection({});
    for (const spec of authorableSpecs()) {
      expect(text, `${spec.type} sem "NÃO use"`).toContain(spec.whenNotToUse.slice(0, 40));
    }
    // A rota de fuga do caso mais comum: série no tempo caindo num KPI.
    expect(text).toMatch(/add_kpi_block[\s\S]*?Em vez dele[\s\S]*?`gauge`/);
  });

  /** Variante de desenho é escolha do modelo, e ele precisa saber que existe. */
  it('a ficha expõe as variantes de display e quando usar cada uma', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/add_gauge_block[\s\S]*?`display: "arc"`/);
    expect(text).toMatch(/add_donut_block[\s\S]*?`display: "bar"`/);
    expect(text).toMatch(/add_targets_block[\s\S]*?`display: "list"`/);
  });

  /** Altura decide o que combina na linha — o grid estica todos ao mais alto. */
  it('a ficha informa o degrau de altura dos blocos que têm piso', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/add_kpi_block[\s\S]*?degrau `indicador`/);
    expect(text).toMatch(/add_chart_block[\s\S]*?degrau `grafico`/);
  });

  // Forma errada não quebra a tela: produz número errado exibido com confiança.
  it('explica que a forma da métrica manda na escolha do bloco', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/forma/i);
    expect(text).toContain('scalar');
    expect(text).toContain('timeseries');
  });

  it('proíbe delegar a escolha do conteúdo da página a sub-agente', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toMatch(/N[ãa]o\s+delegue para decidir o que colocar/i);
  });

  it('lista id, tipo e rótulo de cada bloco da página aberta', () => {
    const text = buildAuthoringPromptSection({ pagesContext: pageContexts });
    expect(text).toContain('[kpi-emp-vgv] kpi | "Projeto VGV"');
    expect(text).toContain('[chart-evolucao] chart | "Evolução"');
    expect(text).toContain('create_report_page');
  });

  it('sem página aberta, diz isso — e segue oferecendo criar', () => {
    const text = buildAuthoringPromptSection({});
    expect(text).toContain('Nenhuma página aberta');
    expect(text).toContain('create_report_page');
  });

  it('com seleção, manda alterar só aqueles e contar quando o tipo não bate', () => {
    const text = buildAuthoringPromptSection({ pagesContext: pageContexts, selectedBlockIds: ['kpi-emp-vgv'] });
    expect(text).toContain('`kpi-emp-vgv`');
    expect(text).toMatch(/APENAS estes blocos/i);
    expect(text).toMatch(/diga isso a ele/i);
  });

  it('sem seleção não inventa restrição de escopo', () => {
    const text = buildAuthoringPromptSection({ pagesContext: pageContexts });
    expect(text).not.toMatch(/APENAS estes blocos/i);
  });
});

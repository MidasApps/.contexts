import { GLOSSARY } from '@/shared/config/glossary';
import { getCachedOrCompute } from '@/features/ai-agents/lib/prompt-cache';
import type { AgentDynamicContext } from './types';
import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';

/**
 * True quando o contexto semântico do cliente traz ≥1 coluna física bound
 * (`attributes[].column`). Nesse caso o prompt usa as colunas reais do cliente e
 * omite o schema hardcoded (G5); senão mantém o hardcoded (sem regressão).
 */

// ---------------------------------------------------------------------------
// Business context — glossary, rating scale, PDD rules, formulas
// ---------------------------------------------------------------------------

function _buildBusinessContext(): string {
  const glossaryEntries = Object.entries(GLOSSARY)
    .map(([slug, entry]) => `- **${slug}**: ${entry.definition}`)
    .join('\n');

  return `## Glossário de termos
${glossaryEntries}

## Escala de rating Liquid

| Rating | Score | Interpretação |
|--------|-------|---------------|
| A | 900 – 1000 | Risco mínimo |
| B | 800 – 899 | Risco muito baixo |
| C | 700 – 799 | Risco baixo |
| D | 600 – 699 | Risco moderado |
| E | 500 – 599 | Risco médio-alto |
| F | 400 – 499 | Risco alto |
| G | 300 – 399 | Risco muito alto |
| H | 0 – 299 | Default ou pre-default |

## Regras de PDD — Bacen Resolução 2682

| Dias de atraso | Nível de risco | % mínimo sobre saldo devedor |
|----------------|----------------|------------------------------|
| Em dia (0) | AA | 0% |
| Em dia (0) | A | 0,5% |
| 15 a 30 dias | B | 1% |
| 31 a 60 dias | C | 3% |
| 61 a 90 dias | D | 10% |
| 91 a 120 dias | E | 30% |
| 121 a 150 dias | F | 50% |
| 151 a 180 dias | G | 70% |
| Acima de 180 dias | H | 100% |

## Fórmulas de referência

\`\`\`
LTV = saldo_devedor / valor_imovel (limite elegibilidade: 80%)
Inadimplência (%) = Σ valor_atraso / Σ saldo_devedor
Deságio (%) = (pricing - saldo_nominal) / saldo_nominal × 100
Over 90 (%) = contratos com dias_atraso > 90 / total de contratos
Delta PDD = PDD_liquid - PDD_minimo_bacen (+: Liquid mais conservador, −: abaixo do regulatório)
\`\`\``;
}

export function buildBusinessContext(): string {
  return getCachedOrCompute('businessContext', _buildBusinessContext);
}

// ---------------------------------------------------------------------------
// Dynamic filter context — active filters + dataset
// ---------------------------------------------------------------------------

export function buildDynamicFilterContext(ctx: AgentDynamicContext): string {
  const parts: string[] = [];
  parts.push(`## Contexto dinâmico`);
  parts.push(`Dataset: \`${ctx.dataset}\``);
  // "Acumulado" prometia soma; o modo só escolhe o RECORTE (faixa × mês final).
  parts.push(`Modo de visualização: ${ctx.filters.viewMode === 'accumulated' ? 'Todo o período (faixa inteira)' : 'Último mês (snapshot)'}`);
  parts.push(`Período ativo: ${ctx.filters.dateRange.start} a ${ctx.filters.dateRange.end}`);
  parts.push(`
Use o dataset \`${ctx.dataset}\` em todas as queries.`);

  /*
   * Aqui entravam também os projetos e as seis faixas de carteira selecionados
   * nos filtros globais, com as cláusulas SQL prontas para o agente colar. Os
   * controles saíram da interface — opções literais no código, e nenhuma
   * métrica do catálogo as aplicava —, então o que sobrava era instruir o
   * modelo a filtrar por uma escolha que ninguém podia fazer.
   */
  if (ctx.filters.viewMode === 'accumulated') {
    parts.push(`Exemplo: SELECT ... FROM \`${ctx.dataset}.contratos\` WHERE data_base_report BETWEEN '${ctx.filters.dateRange.start}' AND '${ctx.filters.dateRange.end}'`);
  } else {
    parts.push(`Exemplo: SELECT ... FROM \`${ctx.dataset}.contratos\` WHERE data_base_report = '${ctx.filters.dateRange.end}'`);
  }
  parts.push(`\n> Sempre aplique os filtros acima nas cláusulas WHERE, a menos que o usuário peça dados sem filtro.`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// SQL rules shared by all agents that write SQL
// ---------------------------------------------------------------------------

export const SQL_RULES = `## Regras SQL
- APENAS SELECT (nunca INSERT, UPDATE, DELETE, DROP, CREATE)
- Use SAFE_DIVIDE para divisoes
- Formate valores monetarios como R$ com separador de milhar (.) e decimal (,)
- Porcentagens com 2 casas decimais
- **Não inclua a query SQL na resposta** a menos que o usuário peça explicitamente ("mostre o SQL", "como calculou?"). Nesse caso, mostre em bloco de código.
- Se a query falhar, explique o erro de forma amigavel sem mostrar o SQL
- Se a pergunta for ambigua, faca a query mais provavel e explique as premissas
- Use aliases legiveis em portugues para colunas
- Use WITH (CTEs) para consultas complexas
- Prefira COALESCE para tratar valores nulos`;

// ---------------------------------------------------------------------------
// Common response guidelines
// ---------------------------------------------------------------------------

/**
 * Bloco de `ask_user` — SÓ para quem realmente recebe essa tool.
 *
 * Ficava dentro de RESPONSE_GUIDELINES, que alimenta tanto o canvas (onde
 * `ask_user` é concedida a todos, canvas-orchestrator/lib/sub-agent.ts) quanto
 * os 8 sub-agentes analíticos e o seed de `aiSkills/response-style` (onde a
 * tool NÃO existe). Resultado: prompt mandando chamar tool inexistente, e o
 * seed reinjetava a promessa no Firestore a cada `--force` ou "restaurar
 * padrão" no admin. Separado para que só o canvas o componha.
 */
export const ASK_USER_GUIDELINES = `## Esclarecimentos com ask_user
- Use a tool \`ask_user\` APENAS quando a pergunta for genuinamente ambígua e a resposta mudaria significativamente a análise.
- Forneça opções estruturadas (max 4) sempre que possível, incluindo uma opção "Ambos" ou "Todos" quando aplicável.
- NÃO pergunte para dúvidas triviais — faça a análise mais provável e explique as premissas.
- Exemplos de quando usar: "inadimplência" pode ser valor absoluto ou percentual; "projeção" pode ser de diferentes métricas; "comparar" sem especificar o quê.`;

export const RESPONSE_GUIDELINES = `## Orientações de resposta
- Sempre responda em português do Brasil (pt-BR). Formate datas para o usuário como DD/MM/AAAA (ex: 15/03/2026). Em queries SQL e parâmetros de tools, use YYYY-MM-DD. Valores monetários como R$ X.XXX,XX.
- Seja conciso e objetivo. Use bullet points curtos.
- Foque no que é relevante: alertas, tendências, destaques positivos/negativos.

## Quando uma ferramenta falha ou retorna dados degradados
- Se a ferramenta retornar \`success: false\`: explique o problema de forma amigável. Sugira simplificar a consulta ou usar filtros diferentes.
- Se \`method\` indicar fallback (ex: LINEAR_REGRESSION_FALLBACK, ZSCORE_IQR_FALLBACK): informe o usuário que o resultado usa um método simplificado e pode ser menos preciso.
- Se \`truncated: true\`: avise que os dados foram truncados e sugira usar filtros mais específicos ou LIMIT.
- Se \`warnings\` contiver mensagens: apresente-as ao usuário antes da análise.
- **NUNCA ignore erros silenciosamente.** Se algo falhou, o usuário precisa saber.
- Se execute_sql falhar com erro de sintaxe: revise a query, simplifique, tente novamente.
- Antes de executar SQL via \`execute_sql\`, **sempre** chame \`dry_run_sql\` primeiro. Se inválido, corrija e tente novamente (máx 2x). Se ainda falhar, retorne erro legível ao orchestrator.`;

// ---------------------------------------------------------------------------
// Semantic context — métricas já contratadas (reuso) + data contract (criar)
// ---------------------------------------------------------------------------

/** Tenta extrair o `kind` de uma recipe sem despejar o objeto inteiro. */
function recipeKind(recipe: unknown): string | undefined {
  if (recipe && typeof recipe === 'object' && 'kind' in recipe) {
    const kind = (recipe as { kind?: unknown }).kind;
    if (typeof kind === 'string') return kind;
  }
  return undefined;
}

/**
 * Legenda das formas — o que cada `forma:` significa em termos de DADO.
 *
 * De propósito não nomeia bloco: quem define que bloco aceita que forma é
 * `block-specs.ts` (`aceita:`), e duplicar o mapa aqui criaria duas réguas
 * divergindo com o tempo. Aqui o modelo recebe o suficiente para casar a forma
 * da métrica com a forma que o bloco declara aceitar.
 */
const SHAPE_LEGEND = `Cada métrica declara a **forma** do resultado (\`forma:\`) e os nomes das colunas
na ordem em que a query as devolve (\`colunas:\`). Escolha o bloco pela forma:
- \`scalar\` — 1 linha, 1 coluna \`value\`: um número único.
- \`timeseries\` — \`{bucket, value}\`: uma série ao longo do tempo.
- \`timeseries_multi\` — \`{bucket, s1, s2, …}\`: várias medidas distintas no tempo.
- \`timeseries_pivot\` — \`{bucket, cat1, …, catN}\`: uma coluna por categoria da mesma dimensão (empilhado).
- \`breakdown\` — \`{dimensao, value}\`: composição por categoria, sem eixo de tempo.
- \`rows\` — N colunas nomeadas: listagem linha a linha.

Métrica SEM \`forma:\` não foi classificada — não presuma que é um número único.`;

function renderMetricsSection(metrics: ClientSemanticContext['metrics']): string {
  const lines = metrics.map((m) => {
    const note = m.description ? ` — ${m.description}` : '';
    const details: string[] = [];
    if (m.recipe !== undefined) {
      const kind = recipeKind(m.recipe);
      details.push(kind ? `executável: ${kind}` : 'executável');
    }
    // Forma e colunas juntas: a forma diz que bloco serve, as colunas dizem
    // com que chave o bloco lê os dados (`xAxisKey`, `dataKeys`, `columns`).
    if (m.shape) details.push(`forma: ${m.shape}`);
    if (m.outputColumns?.length) details.push(`colunas: ${m.outputColumns.join(', ')}`);
    const marker = details.length > 0 ? ` (${details.join('; ')})` : '';
    return `- ${m.id} — ${m.name}${note}${marker}`;
  });

  // A legenda só entra quando há forma declarada — cliente com catálogo ainda
  // não classificado não paga 8 linhas de prompt por nada.
  const legend = metrics.some((m) => m.shape) ? `\n${SHAPE_LEGEND}\n` : '';

  return `## Métricas já disponíveis para este cliente

Reutilize estas métricas quando a pergunta corresponder a uma delas; não recrie equivalentes.
${legend}
${lines.join('\n')}`;
}

function renderDataContractSection(dataContracts: ClientSemanticContext['dataContracts']): string {
  const blocks = dataContracts
    .map((contract) => {
      const entityLines = contract.entities
        .map((entity) => {
          const bound = entity.attributes.filter(
            (a) => typeof a.column === 'string' && a.column.length > 0,
          );
          if (bound.length === 0) return null;
          const attrLines = bound
            .map((a) => `  - ${a.attributeId} → coluna \`${a.column}\`${a.type ? ` (${a.type})` : ''}`)
            .join('\n');
          return `- Entidade \`${entity.entityId}\`:\n${attrLines}`;
        })
        .filter((l): l is string => l !== null);
      if (entityLines.length === 0) return null;
      return `### Contrato \`${contract.contractId}\`\n${entityLines.join('\n')}`;
    })
    .filter((b): b is string => b !== null);

  if (blocks.length === 0) return '';

  return `## Data contract do cliente (colunas físicas reais)

Escreva SQL usando EXATAMENTE estas colunas físicas. NÃO use nomes de coluna de outros schemas.

${blocks.join('\n\n')}`;
}

/**
 * Renderiza as seções de contexto semântico do cliente (frente C):
 * "Métricas já disponíveis para este cliente" (reuso) e "Data contract
 * disponível" (criação de SQL novo). Cada seção é omitida quando vazia; retorna
 * `''` quando o contexto está ausente ou totalmente vazio (prompt inalterado).
 * Compartilhado pelos prompts descriptive + canvas (DRY).
 */
/**
 * Só o catálogo de métricas — sem o data contract.
 *
 * O supervisor não escreve SQL (isso é dos sub-agentes), mas constrói página, e
 * bloco de dado É uma referência a métrica (ADR-0015/0020). Sem esta lista ele
 * não tem de onde tirar um `metricId`: nos testes ele pedia os ids ao usuário —
 * que não os conhece — ou delegava a um sub-agente para "listar as métricas".
 * As entidades/atributos do contrato ficam de fora de propósito: servem para
 * gerar SQL novo, e inflariam o prompt do supervisor sem uso.
 *
 * Cada linha carrega `forma:` e `colunas:` quando a métrica as declara — sem
 * isso o supervisor escolhe o bloco no chute (um escalar e uma série pivotada
 * de 8 colunas chegavam com a MESMA descrição).
 */
export function renderMetricCatalogSection(
  sc: ClientSemanticContext | null | undefined,
): string {
  if (!sc?.metrics?.length) return '';
  return renderMetricsSection(sc.metrics);
}

export function renderSemanticContextSections(
  sc: ClientSemanticContext | null | undefined,
): string {
  if (!sc) return '';

  const sections: string[] = [];
  if (sc.metrics.length > 0) sections.push(renderMetricsSection(sc.metrics));
  if (sc.dataContracts.length > 0) {
    const dc = renderDataContractSection(sc.dataContracts);
    if (dc) sections.push(dc);
  }

  return sections.join('\n\n');
}

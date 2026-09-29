const ptBR = 'pt-BR';

export function formatCurrency(value: number): string {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString(ptBR, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} mi`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString(ptBR, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} mil`;
  }
  return `R$ ${value.toLocaleString(ptBR, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number, decimals = 2): string {
  if (value == null || isNaN(value)) return '0,00%';
  return `${value.toLocaleString(ptBR, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatNumber(value: number, decimals = 0): string {
  if (value == null || isNaN(value)) return '0';
  return value.toLocaleString(ptBR, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// formatDate (mês/ano) saiu com as páginas fixas que o usavam. O que os
// gráficos e tabelas de hoje chamam é formatMonthLabel, logo abaixo.

/**
 * Data ISO do BigQuery em pt-BR: `2026-09-15` → `15/09/2026`.
 *
 * Recorte por STRING, nunca `new Date(iso)`: essa construção lê o ISO como
 * meia-noite UTC, e no fuso do Brasil (UTC-3) o `toLocaleDateString` devolve o
 * DIA ANTERIOR. Um indicador chamado "Data da Medição" errando em um dia é
 * pior que um que não formata nada.
 *
 * TIMESTAMP e DATETIME mostram só o dia — o cartão de indicador tem uma linha.
 * O que não for data ISO passa cru: esta função formata, não valida.
 *
 * @example
 *   formatIsoDate('2026-09-15')                  // '15/09/2026'
 *   formatIsoDate('2026-09-15T18:16:24.649Z')    // '15/09/2026'
 *   formatIsoDate('Vila Rosa')                   // 'Vila Rosa'
 */
export function formatIsoDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value);
  if (!iso) return value;
  const [, year, month, day] = iso;
  return `${day}/${month}/${year}`;
}

/** Convert 'YYYY-MM' to 'jan/25' style label */
export function formatMonthLabel(month: string): string {
  if (!month) return '';
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const parts = month.split('-');
  // Aceita 'YYYY-MM' e 'YYYY-MM-DD' (resolver emite bucket DATE_TRUNC como
  // YYYY-MM-DD). Guard \d{4} evita mangling de rótulos como '01. 1 - 5 dias'.
  if (parts.length >= 2 && /^\d{4}$/.test(parts[0])) {
    const monthIdx = parseInt(parts[1], 10) - 1;
    return `${MONTHS[monthIdx] ?? parts[1]}/${parts[0].slice(2)}`;
  }
  return month;
}

/**
 * Convert snake_case database column names to human-readable labels.
 * e.g. "quantidade_contratos" → "Quantidade de Contratos"
 *      "saldo_devedor_total" → "Saldo Devedor Total"
 *      "ltv_medio" → "LTV Médio"
 */
const KNOWN_LABELS: Record<string, string> = {
  // IDs & chaves
  id_contrato: 'ID do Contrato',
  id_projeto: 'ID do Projeto',
  num_contrato: 'Nº do Contrato',
  // Financeiros
  saldo_devedor: 'Saldo Devedor',
  saldo_devedor_total: 'Saldo Devedor Total',
  valor_financiado: 'Valor Financiado',
  valor_parcela: 'Valor da Parcela',
  valor_prestacao: 'Valor da Prestação',
  valor_total: 'Valor Total',
  valor_contrato: 'Valor do Contrato',
  preco_imovel: 'Preço do Imóvel',
  valor_imovel: 'Valor do Imóvel',
  valor_avaliacao: 'Valor de Avaliação',
  ticket_medio: 'Ticket Médio',
  pdd: 'PDD',
  pdd_bacen: 'PDD Bacen',
  pdd_liquid: 'PDD Liquid',
  delta_pdd: 'Delta PDD',
  // Contagens
  quantidade_contratos: 'Qtd. de Contratos',
  qtd_contratos: 'Qtd. de Contratos',
  total_contratos: 'Total de Contratos',
  num_contratos: 'Nº de Contratos',
  quantidade: 'Quantidade',
  qtd: 'Quantidade',
  count: 'Quantidade',
  // LTV / risco
  ltv: 'LTV',
  ltv_medio: 'LTV Médio',
  ltv_original: 'LTV Original',
  ltv_atual: 'LTV Atual',
  faixa_ltv: 'Faixa de LTV',
  rating: 'Rating',
  rating_liquid: 'Rating Liquid',
  score: 'Score',
  // Inadimplência
  atraso: 'Atraso',
  dias_atraso: 'Dias em Atraso',
  faixa_atraso: 'Faixa de Atraso',
  inadimplencia: 'Inadimplência',
  // As colunas do BigQuery não têm acento; sem entrada aqui a tela imprime
  // "Divida Atual", que é o nome da coluna, não a palavra.
  divida_atual: 'Dívida Atual',
  divida: 'Dívida',
  taxa_inadimplencia: 'Taxa de Inadimplência',
  // Categorias
  projeto: 'Projeto',
  nome_projeto: 'Nome do Projeto',
  tipo_proponente: 'Tipo de Proponente',
  elegibilidade: 'Elegibilidade',
  elegivel: 'Elegível',
  status: 'Status',
  status_contrato: 'Status do Contrato',
  grupo_repasse: 'Grupo de Repasse',
  safra: 'Safra',
  mes: 'Mês',
  ano: 'Ano',
  mes_referencia: 'Mês de Referência',
  data_referencia: 'Data de Referência',
  data_contrato: 'Data do Contrato',
  uf: 'UF',
  cidade: 'Cidade',
  // Percentuais
  percentual: 'Percentual',
  pct: 'Percentual',
  percent: 'Percentual',
  proporcao: 'Proporção',
  taxa: 'Taxa',
  // Coluna genérica das métricas de forma `scalar` e `breakdown`: o SQL a
  // chama `value` porque o resolver a exige com esse nome. Sem entrada aqui a
  // legenda e o tooltip imprimem "Value" — inglês, e sem significado nenhum.
  value: 'Valor',
  sem_atraso: 'Sem atraso',
  // Outros
  nome: 'Nome',
  descricao: 'Descrição',
  tipo: 'Tipo',
  categoria: 'Categoria',
  periodo: 'Período',
};

/** Siglas conhecidas que devem ficar em caixa alta */
const UPPERCASE_WORDS = new Set([
  'ltv', 'pdd', 'id', 'uf', 'cpf', 'cnpj', 'cet', 'sac', 'price',
  'ipca', 'igpm', 'cdi', 'tr', 'bqml', 'sbpe', 'mcmv',
]);

/** Preposições/artigos que ficam em minúscula (exceto no início) */
const LOWERCASE_WORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'por', 'e', 'ou', 'a', 'o']);

/**
 * As faixas de atraso, que o BigQuery entrega como `f1a30`, `f31a60`, `f90mais`.
 *
 * Não cabem no mapa fixo — a faixa é definida pelo SQL de cada cliente e o
 * corte muda (30/60/90 num, 15/45/90 noutro). Sem esta regra o empilhado de
 * inadimplência ficava com legenda "F1a30, F31a60, F90mais": o nome da coluna
 * com a primeira letra maiúscula, num gráfico que o cliente lê toda semana.
 */
function delinquencyBand(name: string): string | null {
  const range = /^f(\d+)a(\d+)$/i.exec(name);
  if (range) return `${range[1]}–${range[2]} dias`;

  const openEnded = /^f(\d+)(mais|plus)$/i.exec(name);
  if (openEnded) return `${openEnded[1]}+ dias`;

  return null;
}

export function humanizeColumnName(name: string): string {
  if (!name) return '';

  // Check known labels first
  const known = KNOWN_LABELS[name.toLowerCase()];
  if (known) return known;

  const band = delinquencyBand(name);
  if (band) return band;

  // Replace underscores and split
  const words = name.replace(/_/g, ' ').trim().split(/\s+/);

  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (UPPERCASE_WORDS.has(lower)) return lower.toUpperCase();
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// formatDateFull (dia/mês/ano) idem — sem chamador desde a remoção das
// páginas fixas.

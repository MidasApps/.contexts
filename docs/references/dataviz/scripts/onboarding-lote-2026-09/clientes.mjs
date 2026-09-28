/**
 * Os 7 clientes do lote de setembro/2026.
 *
 * O enunciado listou 9 linhas, mas BRZ e Jotanunes aparecem duas vezes cada
 * (Monitor + Backtest). Cliente é a organização; produto é a assinatura. Então
 * são 7 documentos em `clients/`, dois deles com dois `productBindings`.
 *
 * O id segue o mesmo padrão dos clientes já em produção: kebab-case, e o nome
 * do dataset é o id com hífen→underscore mais o sufixo do produto
 * (`tenantDatasetSegment` em `src/shared/config/tenants.ts`). Confere para
 * todos: `construtora-sudoeste` → `construtora_sudoeste_monitor`.
 */

export const CLIENTES = [
  {
    id: 'spl',
    name: 'SPL',
    initial: 'SPL',
    color: '#6366A8',
    bindings: [{ productId: 'liquid-play', contractRef: 'liquid-play', datasetId: 'spl_monitor' }],
  },
  {
    id: 'masa',
    name: 'Masa',
    initial: 'MA',
    color: '#B08543',
    bindings: [{ productId: 'liquid-play', contractRef: 'liquid-play', datasetId: 'masa_monitor' }],
  },
  {
    id: 'brz',
    name: 'BRZ',
    initial: 'BRZ',
    color: '#789A4E',
    bindings: [
      { productId: 'liquid-play', contractRef: 'liquid-play', datasetId: 'brz_monitor' },
      { productId: 'backtest', contractRef: 'backtest', datasetId: 'brz_backtest' },
    ],
  },
  {
    id: 'construtora-sudoeste',
    name: 'Construtora Sudoeste',
    initial: 'CS',
    color: '#96609B',
    bindings: [
      {
        productId: 'liquid-play',
        contractRef: 'liquid-play',
        datasetId: 'construtora_sudoeste_monitor',
      },
    ],
  },
  {
    id: 'jotanunes',
    name: 'Jotanunes',
    initial: 'JN',
    color: '#3E7D94',
    bindings: [
      { productId: 'liquid-play', contractRef: 'liquid-play', datasetId: 'jotanunes_monitor' },
      { productId: 'backtest', contractRef: 'backtest', datasetId: 'jotanunes_backtest' },
    ],
  },
  {
    id: 'om',
    name: 'OM',
    initial: 'OM',
    color: '#A34D5C',
    bindings: [{ productId: 'liquid-play', contractRef: 'liquid-play', datasetId: 'om_monitor' }],
  },
  {
    id: 'ms',
    name: 'MS',
    initial: 'MS',
    color: '#4E8B6E',
    bindings: [{ productId: 'liquid-play', contractRef: 'liquid-play', datasetId: 'ms_monitor' }],
  },
];

/**
 * Sinônimos de coluna: id canônico do atributo → nome real no BigQuery, por
 * cliente. Existe porque o conceito é um só e o nome divergiu na origem;
 * inventar um atributo novo para cada grafia partiria o vocabulário.
 *
 * Só entra aqui equivalência que se pode AFIRMAR. `tipo_contrato` não vira
 * sinônimo de `status_contrato` nem de `tipo_recebivel` em Masa/MS: são
 * conceitos diferentes, e mapear errado devolve número confiantemente errado —
 * pior que bloco vazio. Fica como pergunta em `docs/documentations/`.
 */
export const SINONIMOS = {
  masa: { contratos: { elegibilidade: 'Elegibilidade' } },
  ms: { contratos: { elegibilidade: 'Elegibilidade' } },
};

export const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID || 'bigquery-default';

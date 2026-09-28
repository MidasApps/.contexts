/**
 * Schemas físicos (coluna → tipo BigQuery) das 20 tabelas do domínio
 * IMOBILIÁRIA (tenant demo `imob-demo`, dataset `imobiliaria_demo`).
 *
 * Fonte única para:
 *   - `lib/synthetic-real-estate.ts` (gerador — produz exatamente estas colunas);
 *   - `seed-real-estate-contract.mjs` (atributos de `dataContracts/imobiliaria`);
 *   - `seed-real-estate-client.mjs` (schemaBindings/tableBindings do cliente);
 *   - `bq-seed-synthetic-data.ts --domain=real-estate` (criação das tabelas).
 *
 * Contrato e binding NÃO podem divergir: os dois saem daqui.
 *
 * Duas tabelas são FOTO MENSAL (`data_base_report` = último dia do mês):
 * `estoque_snapshot` e `carteira_locacao_snapshot`. O nome da coluna é o
 * mesmo do Vila Rosa de propósito — `kpi-series.ts` e
 * `period-sensitivity.ts` reconhecem o pin por esse literal.
 *
 * Catálogo de referência: docs/real-estate-demo-catalog.md §2.
 */

export { toTableFields, missingColumns } from './vila-rosa-schemas.mjs';

export const REAL_ESTATE_SCHEMA = {
  // ── estrutura e pessoas ────────────────────────────────────────────────
  unidades: [
    ['unidade_id', 'STRING'], ['nome', 'STRING'], ['cidade', 'STRING'], ['uf', 'STRING'],
    ['regiao', 'STRING'], ['gerente_id', 'STRING'], ['data_abertura', 'DATE'], ['ativa', 'BOOL'],
  ],
  departamentos: [
    ['departamento_id', 'STRING'], ['unidade_id', 'STRING'], ['nome', 'STRING'], ['gestor_id', 'STRING'],
  ],
  corretores: [
    ['corretor_id', 'STRING'], ['nome', 'STRING'], ['unidade_id', 'STRING'], ['departamento_id', 'STRING'],
    ['cargo', 'STRING'], ['creci', 'STRING'], ['data_admissao', 'DATE'], ['data_desligamento', 'DATE'],
    ['ativo', 'BOOL'],
  ],
  metas: [
    ['competencia', 'DATE'], ['unidade_id', 'STRING'], ['departamento_id', 'STRING'], ['corretor_id', 'STRING'],
    ['meta_vgv', 'FLOAT64'], ['meta_vendas', 'INT64'], ['meta_locacoes', 'INT64'], ['meta_captacoes', 'INT64'],
    ['meta_leads', 'INT64'], ['meta_receita', 'FLOAT64'],
  ],
  // ── produto ────────────────────────────────────────────────────────────
  imoveis: [
    ['imovel_id', 'STRING'], ['codigo', 'STRING'], ['tipo', 'STRING'], ['finalidade', 'STRING'],
    ['bairro', 'STRING'], ['cidade', 'STRING'], ['regiao', 'STRING'], ['area_m2', 'FLOAT64'],
    ['quartos', 'INT64'], ['vagas', 'INT64'], ['valor_anuncio', 'FLOAT64'], ['valor_aluguel_anuncio', 'FLOAT64'],
    ['valor_condominio', 'FLOAT64'], ['iptu_mensal', 'FLOAT64'], ['data_captacao', 'DATE'], ['captador_id', 'STRING'],
    ['unidade_id', 'STRING'], ['origem_captacao', 'STRING'], ['exclusividade', 'BOOL'], ['status', 'STRING'],
    ['data_saida', 'DATE'], ['motivo_saida', 'STRING'],
  ],
  empreendimentos: [
    ['empreendimento_id', 'STRING'], ['nome', 'STRING'], ['incorporadora', 'STRING'], ['unidade_id', 'STRING'],
    ['cidade', 'STRING'], ['regiao', 'STRING'], ['fase', 'STRING'], ['data_lancamento', 'DATE'],
    ['previsao_entrega', 'DATE'], ['total_unidades', 'INT64'], ['vgv_tabela', 'FLOAT64'], ['comissao_pct_padrao', 'FLOAT64'],
  ],
  espelho_vendas: [
    ['unidade_emp_id', 'STRING'], ['empreendimento_id', 'STRING'], ['torre', 'STRING'], ['andar', 'INT64'],
    ['tipologia', 'STRING'], ['area_m2', 'FLOAT64'], ['valor_tabela', 'FLOAT64'], ['status', 'STRING'],
    ['data_reserva', 'DATE'], ['data_venda', 'DATE'], ['corretor_id', 'STRING'],
  ],
  // ── funil comercial (eventos) ──────────────────────────────────────────
  leads: [
    ['lead_id', 'STRING'], ['data_criacao', 'DATE'], ['data_hora_criacao', 'TIMESTAMP'], ['origem', 'STRING'],
    ['campanha_id', 'STRING'], ['unidade_id', 'STRING'], ['departamento_id', 'STRING'], ['corretor_id', 'STRING'],
    ['interesse', 'STRING'], ['empreendimento_id', 'STRING'], ['imovel_id', 'STRING'], ['faixa_valor', 'STRING'],
    ['tipo_desejado', 'STRING'], ['regiao_desejada', 'STRING'], ['status', 'STRING'], ['motivo_perda', 'STRING'],
    ['data_primeiro_contato', 'TIMESTAMP'], ['minutos_primeiro_contato', 'INT64'], ['data_qualificacao', 'DATE'],
    ['data_ultima_interacao', 'DATE'], ['data_fechamento', 'DATE'], ['qualificado', 'BOOL'],
  ],
  interacoes: [
    ['interacao_id', 'STRING'], ['lead_id', 'STRING'], ['corretor_id', 'STRING'], ['unidade_id', 'STRING'],
    ['data_hora', 'TIMESTAMP'], ['data', 'DATE'], ['canal', 'STRING'], ['tipo', 'STRING'],
  ],
  visitas: [
    ['visita_id', 'STRING'], ['lead_id', 'STRING'], ['imovel_id', 'STRING'], ['unidade_emp_id', 'STRING'],
    ['corretor_id', 'STRING'], ['unidade_id', 'STRING'], ['data_agendada', 'DATE'], ['data_realizada', 'DATE'],
    ['realizada', 'BOOL'], ['no_show', 'BOOL'], ['feedback', 'STRING'],
  ],
  propostas: [
    ['proposta_id', 'STRING'], ['lead_id', 'STRING'], ['imovel_id', 'STRING'], ['unidade_emp_id', 'STRING'],
    ['corretor_id', 'STRING'], ['unidade_id', 'STRING'], ['departamento', 'STRING'], ['data_envio', 'DATE'],
    ['valor_pedido', 'FLOAT64'], ['valor_proposta', 'FLOAT64'], ['status', 'STRING'], ['data_resposta', 'DATE'],
    ['rodadas', 'INT64'],
  ],
  vendas: [
    ['venda_id', 'STRING'], ['proposta_id', 'STRING'], ['lead_id', 'STRING'], ['imovel_id', 'STRING'],
    ['unidade_emp_id', 'STRING'], ['empreendimento_id', 'STRING'], ['departamento', 'STRING'], ['corretor_id', 'STRING'],
    ['unidade_id', 'STRING'], ['data_venda', 'DATE'], ['valor_venda', 'FLOAT64'], ['valor_tabela', 'FLOAT64'],
    ['desconto_pct', 'FLOAT64'], ['forma_pagamento', 'STRING'], ['banco', 'STRING'], ['comissao_pct', 'FLOAT64'],
    ['comissao_total', 'FLOAT64'], ['comissao_imobiliaria', 'FLOAT64'], ['comissao_corretor', 'FLOAT64'],
    ['data_recebimento_comissao', 'DATE'], ['comissao_corretor_paga', 'BOOL'], ['data_pagamento_corretor', 'DATE'],
    ['distrato', 'BOOL'], ['data_distrato', 'DATE'], ['motivo_distrato', 'STRING'], ['dias_ciclo', 'INT64'],
  ],
  // ── locação ────────────────────────────────────────────────────────────
  contratos_locacao: [
    ['contrato_id', 'STRING'], ['imovel_id', 'STRING'], ['unidade_id', 'STRING'], ['corretor_id', 'STRING'],
    ['data_inicio', 'DATE'], ['data_fim_prevista', 'DATE'], ['data_encerramento', 'DATE'], ['valor_aluguel', 'FLOAT64'],
    ['valor_encargos', 'FLOAT64'], ['taxa_adm_pct', 'FLOAT64'], ['taxa_intermediacao', 'FLOAT64'], ['garantia', 'STRING'],
    ['indice_reajuste', 'STRING'], ['status', 'STRING'], ['motivo_encerramento', 'STRING'], ['dias_para_alugar', 'INT64'],
    ['renovado', 'BOOL'],
  ],
  faturas_locacao: [
    ['fatura_id', 'STRING'], ['contrato_id', 'STRING'], ['imovel_id', 'STRING'], ['unidade_id', 'STRING'],
    ['competencia', 'DATE'], ['valor_aluguel', 'FLOAT64'], ['valor_encargos', 'FLOAT64'], ['valor_total', 'FLOAT64'],
    ['data_vencimento', 'DATE'], ['data_pagamento', 'DATE'], ['status', 'STRING'], ['dias_atraso', 'INT64'],
    ['taxa_adm_valor', 'FLOAT64'], ['valor_repasse', 'FLOAT64'], ['data_repasse', 'DATE'], ['repasse_no_prazo', 'BOOL'],
    ['repasse_garantido', 'BOOL'],
  ],
  carteira_locacao_snapshot: [
    ['data_base_report', 'DATE'], ['contrato_id', 'STRING'], ['imovel_id', 'STRING'], ['unidade_id', 'STRING'],
    ['regiao', 'STRING'], ['tipo', 'STRING'], ['status', 'STRING'], ['valor_aluguel', 'FLOAT64'],
    ['taxa_adm_valor', 'FLOAT64'], ['dias_atraso', 'INT64'], ['faixa_atraso', 'STRING'], ['meses_de_contrato', 'INT64'],
    ['garantia', 'STRING'], ['vence_em_90_dias', 'BOOL'],
  ],
  // ── estoque (foto), marketing, financeiro, satisfação ──────────────────
  estoque_snapshot: [
    ['data_base_report', 'DATE'], ['imovel_id', 'STRING'], ['unidade_id', 'STRING'], ['tipo', 'STRING'],
    ['finalidade', 'STRING'], ['regiao', 'STRING'], ['status', 'STRING'], ['valor_anuncio', 'FLOAT64'],
    ['valor_aluguel_anuncio', 'FLOAT64'], ['dias_em_estoque', 'INT64'], ['faixa_estoque', 'STRING'], ['exclusividade', 'BOOL'],
    ['visitas_acumuladas', 'INT64'], ['propostas_acumuladas', 'INT64'],
  ],
  campanhas: [
    ['campanha_id', 'STRING'], ['nome', 'STRING'], ['canal', 'STRING'], ['unidade_id', 'STRING'],
    ['departamento_id', 'STRING'], ['empreendimento_id', 'STRING'], ['data_inicio', 'DATE'], ['data_fim', 'DATE'],
    ['objetivo', 'STRING'],
  ],
  marketing_investimentos: [
    ['competencia', 'DATE'], ['campanha_id', 'STRING'], ['canal', 'STRING'], ['unidade_id', 'STRING'],
    ['departamento_id', 'STRING'], ['investimento', 'FLOAT64'], ['impressoes', 'INT64'], ['cliques', 'INT64'],
    ['leads_gerados', 'INT64'], ['leads_qualificados', 'INT64'],
  ],
  financeiro_lancamentos: [
    ['lancamento_id', 'STRING'], ['competencia', 'DATE'], ['unidade_id', 'STRING'], ['departamento_id', 'STRING'],
    ['natureza', 'STRING'], ['categoria', 'STRING'], ['valor', 'FLOAT64'], ['data_vencimento', 'DATE'],
    ['data_pagamento', 'DATE'], ['status', 'STRING'],
  ],
  pesquisas_satisfacao: [
    ['pesquisa_id', 'STRING'], ['data', 'DATE'], ['tipo_cliente', 'STRING'], ['nota', 'INT64'],
    ['unidade_id', 'STRING'], ['corretor_id', 'STRING'], ['departamento_id', 'STRING'], ['etapa', 'STRING'],
  ],
};

/** Colunas-chave (viram `isKey`/`required` no contrato). */
export const REAL_ESTATE_KEYS = new Set([
  'unidade_id', 'departamento_id', 'corretor_id', 'imovel_id', 'empreendimento_id', 'unidade_emp_id',
  'lead_id', 'interacao_id', 'visita_id', 'proposta_id', 'venda_id', 'contrato_id', 'fatura_id',
  'campanha_id', 'lancamento_id', 'pesquisa_id', 'data_base_report', 'competencia',
]);

/** Descrição das entidades para `dataContracts/imobiliaria/entities/{id}`. */
export const REAL_ESTATE_ENTITIES = {
  unidades: { label: 'Unidades', description: 'Filiais da imobiliária.' },
  departamentos: { label: 'Departamentos', description: 'Departamentos por unidade (Lançamentos, Prontos, Locação, Marketing, Financeiro…).' },
  corretores: { label: 'Equipe', description: 'Corretores, gerentes, coordenadores, captadores e SDRs.' },
  metas: { label: 'Metas', description: 'Metas mensais por unidade, departamento e corretor (corretor_id nulo = meta do time).' },
  imoveis: { label: 'Imóveis', description: 'Carteira de imóveis prontos para venda e/ou locação.' },
  empreendimentos: { label: 'Empreendimentos', description: 'Lançamentos comercializados.' },
  espelho_vendas: { label: 'Espelho de Vendas', description: 'Uma linha por unidade de cada empreendimento com status comercial.' },
  leads: { label: 'Leads', description: 'Leads recebidos, com origem, interesse, estágio e desfecho.' },
  interacoes: { label: 'Interações', description: 'Cada contato com o lead (WhatsApp, telefone, e-mail, presencial).' },
  visitas: { label: 'Visitas', description: 'Visitas agendadas e realizadas a imóveis ou stands.' },
  propostas: { label: 'Propostas', description: 'Propostas enviadas e seu desfecho.' },
  vendas: { label: 'Vendas', description: 'Fechamentos de prontos e lançamentos, com comissão e distrato.' },
  contratos_locacao: { label: 'Contratos de Locação', description: 'Contratos administrados, garantia e encerramento.' },
  faturas_locacao: { label: 'Faturas de Locação', description: 'Uma fatura por contrato por competência: pagamento, atraso e repasse.' },
  carteira_locacao_snapshot: { label: 'Carteira de Locação (foto mensal)', description: 'Foto mensal da carteira administrada por data_base_report.' },
  estoque_snapshot: { label: 'Estoque de Imóveis (foto mensal)', description: 'Foto mensal da carteira de imóveis por data_base_report.' },
  campanhas: { label: 'Campanhas', description: 'Campanhas de marketing por canal e unidade.' },
  marketing_investimentos: { label: 'Investimento de Marketing', description: 'Investimento, impressões, cliques e leads por campanha e competência.' },
  financeiro_lancamentos: { label: 'Lançamentos Financeiros', description: 'DRE gerencial: receitas e despesas por categoria, unidade e competência.' },
  pesquisas_satisfacao: { label: 'Pesquisas de Satisfação', description: 'Notas 0–10 de compradores, proprietários e inquilinos.' },
};

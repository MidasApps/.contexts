/**
 * Universo do gerador: unidades, departamentos e todos os literais de enum.
 *
 * Os textos aqui são EXATAMENTE os que o SQL das métricas compara
 * (`scripts/metrics/real-estate/*.mjs`). Mudar um literal aqui sem mudar lá
 * esvazia o bloco em silêncio — o teste de literais em
 * `synthetic-real-estate.test.ts` existe para isso.
 */

export const BRANCHES = [
  { id: 'centro', name: 'Centro', city: 'São Paulo', state: 'SP', region: 'Centro', openedAt: '2015-03-01', weight: 1.25 },
  { id: 'zona_sul', name: 'Zona Sul', city: 'São Paulo', state: 'SP', region: 'Zona Sul', openedAt: '2017-08-01', weight: 1.15 },
  { id: 'zona_norte', name: 'Zona Norte', city: 'São Paulo', state: 'SP', region: 'Zona Norte', openedAt: '2019-02-01', weight: 0.8 },
  { id: 'abc', name: 'ABC', city: 'São Bernardo do Campo', state: 'SP', region: 'ABC', openedAt: '2020-10-01', weight: 0.9 },
  { id: 'campinas', name: 'Campinas', city: 'Campinas', state: 'SP', region: 'Campinas', openedAt: '2022-05-01', weight: 1.0 },
  // Deliberadamente abaixo da meta: unidade nova, funil fraco.
  { id: 'litoral', name: 'Litoral', city: 'Santos', state: 'SP', region: 'Litoral', openedAt: '2024-11-01', weight: 0.55 },
] as const;
export type BranchId = (typeof BRANCHES)[number]['id'];

export const DEPARTMENTS = [
  { slug: 'lancamentos', name: 'Lançamentos' },
  { slug: 'prontos', name: 'Prontos' },
  { slug: 'locacao', name: 'Locação' },
  { slug: 'adm_locacao', name: 'Administração de Locação' },
  { slug: 'captacao', name: 'Captação' },
  { slug: 'marketing', name: 'Marketing' },
  { slug: 'financeiro', name: 'Financeiro' },
  { slug: 'atendimento', name: 'Atendimento/SDR' },
] as const;
export type DepartmentSlug = (typeof DEPARTMENTS)[number]['slug'];
export const departmentId = (branch: string, slug: DepartmentSlug) => `${branch}-${slug}`;

export const ROLES = ['corretor', 'gerente', 'coordenador', 'sdr', 'captador'] as const;

export const NEIGHBORHOODS: Record<BranchId, readonly string[]> = {
  centro: ['Bela Vista', 'Consolação', 'Higienópolis', 'Liberdade', 'República', 'Santa Cecília'],
  zona_sul: ['Moema', 'Vila Mariana', 'Brooklin', 'Campo Belo', 'Itaim Bibi', 'Saúde'],
  zona_norte: ['Santana', 'Tucuruvi', 'Casa Verde', 'Mandaqui', 'Vila Guilherme'],
  abc: ['Centro SBC', 'Rudge Ramos', 'Jardim do Mar', 'Santo André Centro', 'Vila Assunção'],
  campinas: ['Cambuí', 'Taquaral', 'Nova Campinas', 'Barão Geraldo', 'Guanabara'],
  litoral: ['Gonzaga', 'Boqueirão', 'Ponta da Praia', 'Embaré', 'Aparecida'],
};

export const PROPERTY_TYPES = [['apartamento', 58], ['casa', 18], ['comercial', 10], ['studio', 8], ['cobertura', 4], ['terreno', 2]] as const;
export const PURPOSES = ['venda', 'locacao', 'ambas'] as const;
export const SOURCING_CHANNELS = [['indicacao', 30], ['portal', 20], ['placa', 12], ['prospeccao', 18], ['site', 12], ['parceiro', 8]] as const;
export const PROPERTY_STATUSES = ['disponivel', 'reservado', 'vendido', 'alugado', 'retirado'] as const;
export const EXIT_REASONS = [['vendido_por_outro', 40], ['proprietario_retirou', 35], ['expirado', 25]] as const;
export const INVENTORY_AGE_BANDS = ['0-30', '31-90', '91-180', '180+'] as const;
export const inventoryAgeBand = (days: number) => (days <= 30 ? '0-30' : days <= 90 ? '31-90' : days <= 180 ? '91-180' : '180+');

export const PHASES = ['pre_lancamento', 'lancamento', 'em_obra', 'pronto'] as const;
export const UNIT_TYPES = [['1 dorm', 20], ['2 dorms', 45], ['3 dorms', 30], ['4 dorms', 5]] as const;
export const UNIT_STATUSES = ['disponivel', 'reservada', 'vendida', 'permutada', 'bloqueada'] as const;
export const DEVELOPERS = ['Cyrela', 'MRV', 'Even', 'Tegra', 'Trisul', 'Vitacon', 'EZTEC', 'Setin'] as const;

export const LEAD_SOURCES = [
  ['zap', 16], ['vivareal', 12], ['olx', 8], ['site', 14], ['instagram', 9], ['meta_ads', 12],
  ['google_ads', 10], ['whatsapp', 6], ['indicacao', 7], ['placa', 3], ['plantao', 2], ['base', 1],
] as const;
/** Canais pagos — recebem investimento em `marketing_investimentos`. */
export const PAID_CHANNELS = ['zap', 'vivareal', 'olx', 'meta_ads', 'google_ads', 'instagram'] as const;
export const INTERESTS = ['compra_pronto', 'compra_lancamento', 'locacao'] as const;
export const LEAD_STATUSES = ['novo', 'em_atendimento', 'qualificado', 'visita', 'proposta', 'ganho', 'perdido'] as const;
export const LOSS_REASONS = [['preco', 22], ['financiamento_negado', 18], ['comprou_concorrente', 15], ['desistiu', 20], ['sem_retorno', 20], ['imovel_indisponivel', 5]] as const;
export const PRICE_BANDS = ['ate_300k', '300k_600k', '600k_1m', '1m_2m', 'acima_2m'] as const;
export const INTERACTION_CHANNELS = [['whatsapp', 60], ['telefone', 22], ['email', 10], ['presencial', 8]] as const;
export const INTERACTION_TYPES = ['primeiro_contato', 'follow_up', 'agendamento', 'envio_proposta'] as const;
export const FEEDBACKS = [['gostou', 45], ['neutro', 35], ['nao_gostou', 20]] as const;
export const PROPOSAL_STATUSES = ['enviada', 'contraproposta', 'aceita', 'recusada', 'expirada'] as const;
export const PAYMENT_METHODS = [['financiamento', 58], ['a_vista', 22], ['consorcio', 8], ['permuta', 4], ['direto_incorporadora', 8]] as const;
export const BANKS = [['Caixa', 42], ['Itaú', 18], ['Bradesco', 15], ['Santander', 13], ['Banco do Brasil', 12]] as const;
export const CANCELLATION_REASONS = [['financiamento_negado', 45], ['desistencia', 35], ['atraso_obra', 12], ['outro', 8]] as const;

export const GUARANTEES = [['seguro_fianca', 45], ['fiador', 30], ['caucao', 18], ['titulo_capitalizacao', 5], ['sem_garantia', 2]] as const;
export const ADJUSTMENT_INDEXES = ['IGPM', 'IPCA'] as const;
export const LEASE_STATUSES = ['ativo', 'encerrado', 'renovado', 'rescindido'] as const;
export const TERMINATION_REASONS = [['fim_contrato', 35], ['mudanca', 30], ['inadimplencia', 12], ['venda_imovel', 10], ['proprietario_retirou', 13]] as const;
export const INVOICE_STATUSES = ['pago', 'pago_atrasado', 'em_atraso', 'inadimplente', 'acordo'] as const;
export const DELINQUENCY_BANDS = ['em_dia', '1-30', '31-60', '61-90', '90+'] as const;
export const delinquencyBand = (days: number) => (days <= 0 ? 'em_dia' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+');

export const CAMPAIGN_GOALS = ['leads', 'captacao', 'marca'] as const;
export const ENTRY_KINDS = ['receita', 'despesa'] as const;
export const REVENUE_CATEGORIES = ['comissao_venda_pronto', 'comissao_venda_lancamento', 'taxa_administracao', 'taxa_intermediacao_locacao', 'servicos'] as const;
export const EXPENSE_CATEGORIES = ['pessoal', 'comissao_corretor', 'marketing', 'ocupacao', 'tecnologia', 'administrativo', 'impostos'] as const;
export const ENTRY_STATUSES = ['previsto', 'realizado', 'atrasado'] as const;
export const CUSTOMER_TYPES = ['comprador', 'proprietario', 'inquilino'] as const;
export const SURVEY_STAGES = ['pos_visita', 'pos_fechamento', 'pos_entrega', 'anual'] as const;

export const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina', 'Nelson', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago', 'Vanessa', 'William', 'Yasmin', 'Renato', 'Letícia', 'Caio', 'Bianca'] as const;
export const LAST_NAMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Ribeiro', 'Barbosa'] as const;

/** Sazonalidade mensal de leads (índice por mês do ano, 1 = média). */
export const SEASONALITY = [0.78, 0.9, 1.12, 1.05, 1.02, 0.95, 0.98, 1.08, 1.15, 1.1, 1.02, 0.85] as const;

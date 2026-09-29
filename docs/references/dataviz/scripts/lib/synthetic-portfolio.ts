/**
 * Gerador de carteira SINTÉTICA para desenvolvimento: 3 empreendimentos, N
 * contratos, fotos mensais (`data_base_report`) e as 12 tabelas que o produto
 * lê, coerentes entre si (mesmo `id_contrato`, mesmo `projeto`, mesma foto).
 *
 * Por que existe: os CSVs de amostra têm 10 linhas de um único mês, então
 * séries, faixas de atraso, obra, certidões e extrato ficavam vazios. Sem
 * dado, não dá para ver as 13 páginas funcionando.
 *
 * Os valores de texto seguem EXATAMENTE os literais que o SQL das métricas
 * compara (`scripts/metrics/covenants-v2.mjs`): status `ATIVO|QUITADO|
 * DISTRATADO`, faixas `00. Sem atraso` …, `tipo_recebivel` `Pré-chaves|
 * Pós-chaves`, `transacoes.tipo` `CREDIT|DEBIT`, `certidoes.status` `Válida`.
 *
 * Identificadores em inglês; nomes de tabela, coluna e valores gravados no
 * BigQuery são dado e ficam como estão.
 *
 * Determinístico: mesma seed → mesmos dados. Puro: não toca em rede.
 */

export interface PortfolioOptions {
  seed?: number;
  /** Última foto mensal (YYYY-MM-DD, fim de mês). */
  lastSnapshot?: string;
  /** Quantas fotos mensais para trás, inclusive a última. */
  months?: number;
  /** Contratos por empreendimento. */
  contractsPerProject?: number;
}

export type Row = Record<string, string | number | boolean | null>;
export type Tables = Record<string, Row[]>;

// ── PRNG determinístico (mulberry32) ────────────────────────────────────
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── datas ────────────────────────────────────────────────────────────────
const iso = (d: Date) => d.toISOString().slice(0, 10);
const endOfMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0));
function monthlySnapshots(last: string, months: number): string[] {
  const [y, m] = last.split('-').map(Number);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(iso(endOfMonth(y, m - 1 - i)));
  return out;
}
const addMonths = (d: string, n: number) => {
  const [y, m] = d.split('-').map(Number);
  return iso(endOfMonth(y, m - 1 + n));
};
const dayOfMonth = (snapshot: string, day: number) => {
  const [y, m] = snapshot.split('-').map(Number);
  const lastDay = endOfMonth(y, m - 1).getUTCDate();
  return `${snapshot.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, '0')}`;
};
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

// ── universo ─────────────────────────────────────────────────────────────
const COMPANY = 'vila-rosa';
const PROJECTS = [
  { name: 'VIVA PARK', city: 'Curitiba', state: 'PR', towers: 2, units: 112, areaM2: 6720, delivery: '2026-06-30', vgv: 48_000_000, businessPlan: 14_000_000, bank: 'Caixa Econômica Federal', cnpj: '12.345.678/0001-90' },
  { name: 'RESIDENCIAL AURORA', city: 'Joinville', state: 'SC', towers: 1, units: 64, areaM2: 4160, delivery: '2025-09-30', vgv: 30_000_000, businessPlan: 9_500_000, bank: 'Banco Bradesco', cnpj: '23.456.789/0001-01' },
  { name: 'JARDIM DAS PALMEIRAS', city: 'Londrina', state: 'PR', towers: 3, units: 150, areaM2: 9750, delivery: '2027-03-31', vgv: 66_000_000, businessPlan: 21_000_000, bank: 'Itaú Unibanco', cnpj: '34.567.890/0001-12' },
];

const DELAY_BANDS_1 = ['00. Sem atraso', '01. 1 - 5 dias', '02. 6 - 30 dias', '03. 30 - 60 dias', '04. 60 - 90 dias', '05. Acima de 90 dias'];
const DELAY_BANDS_2 = ['00. Sem atraso', '01. 1 - 30 dias', '02. 31 - 60 dias', '03. 61 - 90 dias', '04. Acima de 90 dias'];
const delayBand1 = (d: number) => (d <= 0 ? DELAY_BANDS_1[0] : d <= 5 ? DELAY_BANDS_1[1] : d <= 30 ? DELAY_BANDS_1[2] : d <= 60 ? DELAY_BANDS_1[3] : d <= 90 ? DELAY_BANDS_1[4] : DELAY_BANDS_1[5]);
const delayBand2 = (d: number) => (d <= 0 ? DELAY_BANDS_2[0] : d <= 30 ? DELAY_BANDS_2[1] : d <= 60 ? DELAY_BANDS_2[2] : d <= 90 ? DELAY_BANDS_2[3] : DELAY_BANDS_2[4]);
const scoreBand = (s: number) => (s < 400 ? '1. 300-399' : s < 500 ? '2. 400-499' : s < 600 ? '3. 500-599' : s < 700 ? '4. 600-699' : s < 800 ? '5. 700-799' : s < 900 ? '6. 800-899' : '7. 900-1000');
const rating = (s: number, daysLate: number) => {
  const baseGrade = s >= 900 ? 0 : s >= 800 ? 1 : s >= 700 ? 2 : s >= 600 ? 3 : s >= 500 ? 4 : s >= 400 ? 5 : 6;
  const penalty = daysLate > 90 ? 2 : daysLate > 30 ? 1 : 0;
  return 'ABCDEFGH'[Math.min(7, baseGrade + penalty)];
};
const ltvBand = (l: number) => (l < 0.5 ? '1. Até 50%' : l < 0.7 ? '2. 50-70%' : l < 0.8 ? '3. 70-80%' : '4. Acima de 80%');
const bacenProvisionRate = (d: number) => (d <= 0 ? 0.005 : d <= 30 ? 0.01 : d <= 60 ? 0.03 : d <= 90 ? 0.1 : d <= 180 ? 0.3 : 0.5);

/** Linhas de `ba_bancos`: as chaves são colunas da tabela. */
export const BANKS = [
  { numero_codigo: 341, nome_reduzido: 'Itaú', nome_extenso: 'Itaú Unibanco S.A.', ispb: '60701190' },
  { numero_codigo: 237, nome_reduzido: 'Bradesco', nome_extenso: 'Banco Bradesco S.A.', ispb: '60746948' },
  { numero_codigo: 104, nome_reduzido: 'Caixa', nome_extenso: 'Caixa Econômica Federal', ispb: '00360305' },
  { numero_codigo: 1, nome_reduzido: 'Banco do Brasil', nome_extenso: 'Banco do Brasil S.A.', ispb: '00000000' },
  { numero_codigo: 33, nome_reduzido: 'Santander', nome_extenso: 'Banco Santander (Brasil) S.A.', ispb: '90400888' },
];

/**
 * Categorias no formato Pluggy: `description` é a chave do JOIN, `parent_description_translated` é o rótulo exibido.
 * `type` e `weight` são internos ao gerador (não viram coluna).
 */
export const CATEGORIES = [
  { id: 1, description: 'Sales', description_translated: 'Vendas', parent_id: 1, parent_description: 'Income', parent_description_translated: 'Receitas', type: 'CREDIT', weight: 6 },
  { id: 2, description: 'Loans and financing', description_translated: 'Empréstimos e financiamentos', parent_id: 1, parent_description: 'Income', parent_description_translated: 'Receitas', type: 'CREDIT', weight: 2 },
  { id: 3, description: 'Interest and returns', description_translated: 'Juros e rendimentos', parent_id: 1, parent_description: 'Income', parent_description_translated: 'Receitas', type: 'CREDIT', weight: 1 },
  { id: 4, description: 'Construction', description_translated: 'Obra', parent_id: 2, parent_description: 'Operating expenses', parent_description_translated: 'Despesas operacionais', type: 'DEBIT', weight: 5 },
  { id: 5, description: 'Suppliers', description_translated: 'Fornecedores', parent_id: 2, parent_description: 'Operating expenses', parent_description_translated: 'Despesas operacionais', type: 'DEBIT', weight: 4 },
  { id: 6, description: 'Payroll', description_translated: 'Folha de pagamento', parent_id: 2, parent_description: 'Operating expenses', parent_description_translated: 'Despesas operacionais', type: 'DEBIT', weight: 2 },
  { id: 7, description: 'Taxes', description_translated: 'Impostos', parent_id: 3, parent_description: 'Taxes and fees', parent_description_translated: 'Impostos e taxas', type: 'DEBIT', weight: 2 },
  { id: 8, description: 'Bank fees', description_translated: 'Tarifas bancárias', parent_id: 3, parent_description: 'Taxes and fees', parent_description_translated: 'Impostos e taxas', type: 'DEBIT', weight: 1 },
  { id: 9, description: 'Loan payment', description_translated: 'Pagamento de empréstimo', parent_id: 4, parent_description: 'Financing', parent_description_translated: 'Financiamento', type: 'DEBIT', weight: 2 },
  { id: 10, description: 'Marketing', description_translated: 'Marketing', parent_id: 2, parent_description: 'Operating expenses', parent_description_translated: 'Despesas operacionais', type: 'DEBIT', weight: 1 },
];

/** `[órgão, certidão, tipo]` — os três são valores gravados em `certidoes`. */
const CERTIFICATES = [
  ['Receita Federal', 'CND Federal', 'Fiscal'], ['Caixa', 'CRF FGTS', 'Trabalhista'], ['TST', 'CNDT', 'Trabalhista'],
  ['Prefeitura', 'CND Municipal', 'Fiscal'], ['SEFAZ', 'CND Estadual', 'Fiscal'], ['Cartório de Registro de Imóveis', 'Matrícula atualizada', 'Imobiliária'],
  ['Órgão ambiental', 'Licença de operação', 'Ambiental'], ['Corpo de Bombeiros', 'AVCB', 'Regulatória'],
];

const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina', 'Nelson', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago', 'Vanessa'];
const LAST_NAMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho'];

interface Contract {
  id: string; project: (typeof PROJECTS)[number]; unit: number; issueDate: string; propertyValue: number; contractValue: number;
  term: number; rate: number; score: number; income: number; customerName: string; saleCategory: string;
  /** mês (índice na lista de fotos) em que muda de status; -1 nunca */
  settlesAt: number; cancelsAt: number; baseDelay: number; firstSnapshot: string;
}

export function generatePortfolio(options: PortfolioOptions = {}): Tables {
  const random = prng(options.seed ?? 2026);
  const snapshots = monthlySnapshots(options.lastSnapshot ?? '2025-12-31', options.months ?? 18);
  const perProject = options.contractsPerProject ?? 40;
  const between = (a: number, b: number) => a + random() * (b - a);
  const intBetween = (a: number, b: number) => Math.floor(between(a, b + 1));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  const round2 = (x: number) => Math.round(x * 100) / 100;

  // ── contratos (universo estável) ──
  const contracts: Contract[] = [];
  for (const project of PROJECTS) {
    const usedUnits = new Set<number>();
    for (let i = 0; i < perProject; i++) {
      let unit = intBetween(101, 100 + project.units);
      while (usedUnits.has(unit)) unit = intBetween(101, 100 + project.units);
      usedUnits.add(unit);
      const issueDate = addMonths(snapshots[0], -intBetween(0, 30));
      const propertyValue = round2(between(280_000, 620_000));
      const score = intBetween(320, 990);
      const baseDelay = random() < 0.72 ? 0 : random() < 0.6 ? intBetween(1, 30) : random() < 0.6 ? intBetween(31, 90) : intBetween(91, 400);
      contracts.push({
        id: `vr-${project.name.slice(0, 3).toLowerCase()}-${String(i + 1).padStart(3, '0')}`,
        project, unit, issueDate, propertyValue, contractValue: round2(propertyValue * between(0.55, 0.85)),
        term: pick([120, 180, 240, 300, 360]), rate: round2(between(8.5, 12.5)), score, income: round2(between(4_000, 22_000)),
        customerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, saleCategory: pick(['Financiamento', 'Financiamento', 'Financiamento', 'Direto', 'À vista']),
        settlesAt: random() < 0.08 ? intBetween(3, snapshots.length - 1) : -1,
        cancelsAt: random() < 0.06 ? intBetween(2, snapshots.length - 1) : -1,
        baseDelay,
        firstSnapshot: issueDate > snapshots[0] ? issueDate : snapshots[0],
      });
    }
  }

  const T: Tables = { contratos: [], pagamentos: [], fluxo_caixa: [], covenants_calculo: [], certidoes: [], ficha_cadastral: [], mapa_de_vendas: [], evolucao_obra: [], evolucao_plano_empresario: [], transacoes: [] };

  // ── ficha_cadastral (uma linha por projeto, sem foto) ──
  for (const p of PROJECTS) {
    T.ficha_cadastral.push({
      empresa: COMPANY, projeto: p.name, empresa_cnpj: p.cnpj, empresa_banco: p.bank, projeto_nome_exibicao: p.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
      projeto_tipo: 'Residencial', projeto_estado: p.state, projeto_cidade: p.city, projeto_vgv: p.vgv, projeto_torres: p.towers,
      projeto_total_unidades: p.units, projeto_total_m2: p.areaM2, projeto_previsao_entrega: p.delivery, plano_empresario_valor: p.businessPlan,
      plano_empresario_data_assinatura: addMonths(snapshots[0], -14), pluggy_item_id: `itm_${p.name.slice(0, 4).toLowerCase()}_${intBetween(1000, 9999)}`,
    });
  }

  snapshots.forEach((snapshot, si) => {
    for (const p of PROJECTS) {
      const projectContracts = contracts.filter((c) => c.project === p && c.firstSnapshot <= snapshot);
      const sold = projectContracts.filter((c) => !(c.cancelsAt >= 0 && c.cancelsAt <= si)).length;
      const inventory = p.units - sold;
      const averageArea = p.areaM2 / p.units;
      const delivered = snapshot >= p.delivery;
      // obra: curva S do início do plano até a entrega
      const constructionStart = addMonths(snapshots[0], -14);
      const totalMonths = monthsBetween(constructionStart, p.delivery);
      const elapsedMonths = Math.max(0, monthsBetween(constructionStart, snapshot));
      const sCurve = (t: number) => 1 / (1 + Math.exp(-((t / totalMonths) * 10 - 5)));
      const planned = Math.min(1, sCurve(elapsedMonths) / sCurve(totalMonths));
      // Sorteio sem uso, mantido para não mudar a sequência do PRNG (mesma seed → mesma carga).
      between(0.86, 1.02);
      const debt = round2(p.businessPlan * Math.min(1, planned * 1.05) * between(0.9, 1));
      const contracted = round2(p.businessPlan * Math.min(1, planned * 1.1));
      const postKeys = projectContracts.reduce((s, c) => s + (delivered ? c.contractValue * 0.7 : 0), 0);
      const preKeys = projectContracts.reduce((s, c) => s + (delivered ? 0 : c.contractValue * 0.35), 0);
      const vuv3 = round2(between(6_500, 8_200) * (1 + si * 0.004));

      T.covenants_calculo.push({
        empresa: COMPANY, projeto: p.name, data_base_report: snapshot, unidades_vendidas: sold, vendido_m2: round2(sold * averageArea),
        valor_vendido: round2(projectContracts.reduce((s, c) => s + c.propertyValue, 0)), estoque: inventory, estoque_m2: round2(inventory * averageArea),
        vuv3_estoque: round2(inventory * averageArea * vuv3), vuv3_m2: vuv3, vuva_estoque: round2(inventory * averageArea * vuv3 * 0.93), vuva_m2: round2(vuv3 * 0.93),
        recebiveis_pre_chaves: round2(preKeys), recebiveis_pos_chaves: round2(postKeys),
        indice_recebivel: round2(debt > 0 ? postKeys / debt : 0), indice_recebivel_estoque: round2(debt > 0 ? (postKeys + preKeys + inventory * averageArea * vuv3) / debt : 0),
        vgv: p.vgv, total_de_unidades: p.units, total_m2: p.areaM2, total_valor_vendido: round2(projectContracts.reduce((s, c) => s + c.propertyValue, 0)),
        valor_medio_m2: vuv3, valor_estoque: round2(inventory * averageArea * vuv3),
      });

      T.evolucao_plano_empresario.push({ empresa: COMPANY, projeto: p.name, data_base_report: snapshot, plano_empresario_divida_atual: debt, plano_empresario_contratado: contracted });

      // medições mensais até a foto
      for (let m = 1; m <= elapsedMonths && m <= totalMonths; m++) {
        const measuredAt = addMonths(constructionStart, m);
        const plannedNow = Math.min(1, sCurve(m) / sCurve(totalMonths));
        const actualNow = Math.min(1, plannedNow * (0.86 + 0.16 * ((m * 7919) % 100) / 100));
        const plannedBefore = m > 1 ? Math.min(1, sCurve(m - 1) / sCurve(totalMonths)) : 0;
        const actualBefore = m > 1 ? Math.min(1, plannedBefore * (0.86 + 0.16 * (((m - 1) * 7919) % 100) / 100)) : 0;
        T.evolucao_obra.push({
          empresa: COMPANY, projeto: p.name, data_base_report: snapshot, medicao: `M${String(m).padStart(2, '0')}`, data_medicao: measuredAt,
          previsto_acumulado: round2(plannedNow * 100), previsto_periodo: round2((plannedNow - plannedBefore) * 100), realizado_acumulado: round2(actualNow * 100),
          realizado_periodo: round2((actualNow - actualBefore) * 100), desvio_acumulado: round2((actualNow - plannedNow) * 100), desvio_periodo: round2((actualNow - actualBefore - (plannedNow - plannedBefore)) * 100),
        });
      }

      // certidões: 8 por projeto por foto, maioria válida
      CERTIFICATES.forEach(([agency, certificate, kind], ci) => {
        const validUntil = addMonths(snapshot, intBetween(-2, 10));
        const status = validUntil < snapshot ? 'Vencida' : random() < 0.06 ? 'Pendente' : 'Válida';
        T.certidoes.push({
          empresa: COMPANY, projeto: p.name, cnpj_consultado: Number(p.cnpj.replace(/\D/g, '')), data_base_report: snapshot, data_consulta: dayOfMonth(snapshot, intBetween(1, 28)),
          data_validade: validUntil, certidao_orgao: agency, certidao: certificate, tipo: kind, situacao: status === 'Válida' ? 'Regular' : 'Irregular', status,
          id: `${p.name.slice(0, 3).toLowerCase()}-${snapshot}-${ci}`, created_at: `${snapshot}T03:00:00Z`, endpoint: `/certidoes/${kind.toLowerCase()}`, bureau: 'Serasa',
        });
      });

      // mapa de vendas: todas as unidades do projeto, na foto
      const unitsPerTower = Math.ceil(p.units / p.towers);
      for (let u = 0; u < p.units; u++) {
        const unitNumber = 101 + u;
        const tower = `T${Math.floor(u / unitsPerTower) + 1}`;
        const floor = Math.floor((u % unitsPerTower) / 4) + 1;
        const floorLabel = u % 23 === 0 ? 'TÉRREO' : `${floor}º`;
        const area = round2(averageArea * (0.8 + ((u * 37) % 40) / 100));
        T.mapa_de_vendas.push({
          empresa: COMPANY, projeto: p.name, data_base_report: snapshot, empreendimento: p.name, pavimento: floorLabel, unidade: String(unitNumber), torre: tower,
          area_privativa: area, area_calculo: round2(area * 1.1), area_total: round2(area * 1.45), fracao_ideal: round2(1 / p.units), vagas: u % 5 === 0 ? 2 : 1,
          valor_avaliacao: round2(area * vuv3), valor_liquidez: round2(area * vuv3 * 0.9), permuta: u % 17 === 0,
        });
      }

      // extrato bancário: ~45 lançamentos por projeto por mês
      const bank = BANKS[PROJECTS.indexOf(p) % BANKS.length];
      const account = `${intBetween(10000, 99999)}-${intBetween(0, 9)}`;
      let balance = between(400_000, 1_200_000);
      const totalWeight = CATEGORIES.reduce((s, c) => s + c.weight, 0);
      for (let k = 0; k < 45; k++) {
        let remaining = random() * totalWeight;
        const category = CATEGORIES.find((c) => (remaining -= c.weight) <= 0) ?? CATEGORIES[0];
        const isCredit = category.type === 'CREDIT';
        const amount = round2((isCredit ? between(1_500, 95_000) : -between(800, 60_000)) * (category.description === 'Sales' ? 1.4 : 1));
        balance = round2(balance + amount);
        const counterparty = isCredit ? `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}` : pick(['Construtora Alfa Ltda', 'Cimentos Beta S.A.', 'Elétrica Gama ME', 'Prefeitura Municipal', 'Receita Federal', 'Folha de pagamento']);
        T.transacoes.push({
          id: `tx-${p.name.slice(0, 3).toLowerCase()}-${snapshot}-${k}`, lancamento: isCredit ? 'Crédito' : 'Débito', descricao: `${category.description_translated} · ${counterparty}`,
          moeda: 'BRL', valor: amount, data: dayOfMonth(snapshot, intBetween(1, 28)), saldo: balance,
          pagador_conta: isCredit ? `${intBetween(1000, 9999)}-${intBetween(0, 9)}` : account, pagador_agencia: String(intBetween(100, 9999)), pagador_tipo: isCredit ? 'PF' : 'PJ', pagador_documento: String(intBetween(10_000_000_000, 99_999_999_999)),
          pagador: isCredit ? counterparty : `${p.name} SPE`, pagador_banco: isCredit ? pick(BANKS).numero_codigo : bank.numero_codigo, metodo_pagamento: pick(['PIX', 'TED', 'Boleto']),
          recebedor_conta: isCredit ? account : `${intBetween(1000, 9999)}-${intBetween(0, 9)}`, recebedor_agencia: String(intBetween(100, 9999)), recebedor_tipo: isCredit ? 'PJ' : pick(['PJ', 'PF']), recebedor_documento: String(intBetween(10_000_000_000, 99_999_999_999)),
          recebedor: isCredit ? `${p.name} SPE` : counterparty, recebedor_banco: isCredit ? bank.numero_codigo : pick(BANKS).numero_codigo,
          tipo: category.type, banco_codigo: bank.numero_codigo, agencia_codigo: String(intBetween(100, 9999)), conta_codigo: account, data_base_report: snapshot, categoria: category.description,
          projeto: p.name, empresa: COMPANY,
        });
      }
    }

    // ── contratos, pagamentos e fluxo por foto ──
    for (const c of contracts) {
      if (c.firstSnapshot > snapshot) continue;
      const p = c.project;
      const settled = c.settlesAt >= 0 && c.settlesAt <= si;
      const cancelled = c.cancelsAt >= 0 && c.cancelsAt <= si;
      const status = cancelled ? 'DISTRATADO' : settled ? 'QUITADO' : 'ATIVO';
      const elapsedMonths = Math.max(0, monthsBetween(c.issueDate, snapshot));
      const installment = round2((c.contractValue / c.term) * (1 + c.rate / 100 / 2));
      const balance = settled || cancelled ? 0 : round2(Math.max(0, c.contractValue - installment * elapsedMonths * 0.62));
      // atraso evolui com passeio aleatório suave em torno do perfil do contrato
      const daysLate = status !== 'ATIVO' ? 0 : Math.max(0, Math.round(c.baseDelay + (random() - 0.45) * 12 * (c.baseDelay > 0 ? 1 : 0.15)));
      const overdueAmount = daysLate > 0 ? round2(installment * Math.min(6, Math.ceil(daysLate / 30))) : 0;
      const over90 = daysLate > 90 ? balance : 0;
      const provisionRate = bacenProvisionRate(daysLate);
      const ltv = c.propertyValue > 0 ? round2(balance / c.propertyValue) : 0;
      const delivered = snapshot >= p.delivery;
      const restrictions = c.score < 500 ? round2(between(500, 12_000)) : 0;
      T.contratos.push({
        id_contrato: c.id, status_contrato: status, date_delivery: p.delivery, building_status: delivered ? 'Entregue' : 'Em obra', correcao_monetaria: 'INCC',
        data_base_report: snapshot, projeto: p.name, cidade: p.city, estado: p.state, categoria_venda: c.saleCategory, data_emissao: c.issueDate,
        valor_imovel: c.propertyValue, valor_pago_view: round2(installment * elapsedMonths), dias_atraso: daysLate, dias_atraso_ps: daysLate, dias_atraso_outros: 0,
        valor_atraso: overdueAmount, valor_atraso_ps: overdueAmount, valor_atraso_fi: 0, valor_atraso_outros: 0,
        saldo_devedor: balance, saldo_devedor_ps: balance, saldo_devedor_fi: 0, saldo_devedor_outros: 0, saldo_nominal: round2(balance * 1.08),
        taxa_pricing: 'CDI+', duration: round2(Math.max(0, (c.term - elapsedMonths) / 24)), pricing_pe_ps_hist: null, pricing_pe_hist: null, desagio_pe_ps_hist: null, desagio_pe_hist: null,
        desagio: round2(balance * 0.06), pricing: round2(balance * 0.94), ltv, ltv_dirty: round2(ltv * 1.05), vpl: round2(balance * 0.91),
        renda_familiar: c.income, faixa_renda: c.income < 6_000 ? '1. Até 6k' : c.income < 12_000 ? '2. 6k-12k' : '3. Acima de 12k', faixa_mcmv: c.income < 8_000 ? 'Faixa 3' : 'SBPE',
        score: c.score, faixa_score: scoreBand(c.score), primeira_parcela: addMonths(c.issueDate, 1), rating_liquid: rating(c.score, daysLate), taxa_contrato: c.rate, plano: c.term,
        prazo_decorrido: elapsedMonths, prazo_remanescente: Math.max(0, c.term - elapsedMonths), valor_contrato: c.contractValue, valor_over_90: over90, valor_over_90_ps: over90,
        faixa_atraso_1: delayBand1(daysLate), faixa_atraso_ps_1: delayBand1(daysLate), faixa_atraso_2: delayBand2(daysLate), faixa_atraso_ps_2: delayBand2(daysLate), faixa_atraso_3: daysLate > 90 ? 'Over 90' : 'Até 90', faixa_atraso_ps_3: daysLate > 90 ? 'Over 90' : 'Até 90',
        pdd_minimo_bacen: round2(balance * provisionRate), pdd_liquid: round2(balance * provisionRate * (c.score < 500 ? 1.4 : 0.8)), restricoes: restrictions,
        faixa_remanescente: c.term - elapsedMonths > 240 ? '3. Acima de 240' : c.term - elapsedMonths > 120 ? '2. 120-240' : '1. Até 120',
        limite_simulacao: round2(c.income * 0.3 * 100), prosoluto_simulacao: round2(c.propertyValue * 0.2), prosoluto_cnpj: 0, prosoluto_sem_informacao: 0,
        valor_pefin: restrictions, valor_refin: 0, valor_protesto: 0, quantidade_pefin: restrictions > 0 ? 1 : 0, quantidade_refin: 0, quantidade_protesto: 0,
        faixa_ltv: ltvBand(ltv), ltv_banco: round2(ltv * 0.98), ltv_banco_stress: round2(ltv * 1.25), unidade: c.unit, proponent_type: 'PF',
        documento: intBetween(10_000_000_000, 99_999_999_999), nome_cliente: c.customerName, prob: round2(Math.min(0.99, provisionRate * 2)), inicio_monitor: snapshots[0], ultima_parcela: addMonths(c.issueDate, c.term),
        private_area: String(round2(p.areaM2 / p.units)), date_serasa: dayOfMonth(snapshot, intBetween(1, 28)), renda_suficiente: c.income * 0.3 >= installment ? 1 : 0,
        delta_renda_baixo: 0, delta_renda_medio: 0, delta_renda_alto: 0, prosoluto_total: round2(c.propertyValue * 0.2), faixa_ltv_banco: ltvBand(ltv * 0.98), faixa_ltv_stress: ltvBand(ltv * 1.25),
        tipo_restricao: restrictions > 0 ? 'PEFIN' : null, faixa_restricao: restrictions > 0 ? (restrictions > 5_000 ? '2. Acima de 5k' : '1. Até 5k') : '0. Sem restrição',
        elegibilidade: status === 'ATIVO' && daysLate <= 30 && c.score >= 600 ? 'Elegível' : 'Não elegível', delta_pdd: round2(balance * provisionRate * (c.score < 500 ? 0.4 : -0.2)),
        grupos_repasse: status === 'ATIVO' && daysLate === 0 && c.score >= 700 ? 'G1 - Pronto' : daysLate <= 30 ? 'G2 - Regularização' : 'G3 - Cobrança',
        categoria_inadimplencia: daysLate === 0 ? 'Adimplente' : daysLate <= 90 ? 'Atraso recente' : 'Inadimplente', perfil_cobranca: daysLate === 0 ? 'Sem ação' : daysLate <= 30 ? 'Lembrete' : daysLate <= 90 ? 'Negociação' : 'Jurídico',
      });

      // pagamentos: 1 a 2 recebimentos por contrato ativo no mês
      if (status === 'ATIVO' && daysLate <= 30) {
        const paymentCount = random() < 0.15 ? 2 : 1;
        for (let k = 0; k < paymentCount; k++) {
          T.pagamentos.push({
            data_base_report: snapshot, projeto: p.name, categoria_venda: c.saleCategory, status_contrato: status, building_status: delivered ? 'Entregue' : 'Em obra', date_delivery: p.delivery,
            estado: p.state, cidade: p.city, data_emissao: c.issueDate, tipo_parcela: k === 0 ? 'Mensal' : pick(['Intermediária', 'Chaves']),
            valor_pago: k === 0 ? installment : round2(installment * between(2, 6)), tipo_recebimento: k === 0 ? 'Vencimento na referência' : 'Antecipação', id_contrato: c.id,
          });
        }
      }

      // fluxo de caixa: 24 meses à frente por contrato ativo
      if (status === 'ATIVO') {
        for (let m = 1; m <= 24; m++) {
          const flowDate = addMonths(snapshot, m);
          const receivableType = flowDate < p.delivery ? 'Pré-chaves' : 'Pós-chaves';
          const contractedFlow = m <= c.term - elapsedMonths ? installment : 0;
          const expectedFlow = round2(contractedFlow * (1 - provisionRate) * (receivableType === 'Pré-chaves' ? 0.97 : 0.99));
          T.fluxo_caixa.push({
            projeto: p.name, data_base_report: snapshot, empresa: COMPANY, status_contrato: status, categoria_venda: c.saleCategory, building_status: delivered ? 'Entregue' : 'Em obra',
            date_delivery: p.delivery, estado: p.state, cidade: p.city, data_emissao: c.issueDate, data_base_fluxo: flowDate, fluxo_contratado: contractedFlow, fluxo_esperado: expectedFlow,
            fluxo_contratado_ps: contractedFlow, fluxo_esperado_ps: expectedFlow, tipo_recebivel: receivableType, id_contrato: c.id,
          });
        }
      }
    }
  });

  T.ba_bancos = BANKS.map((b) => ({ ...b, participa_compe: 'Sim', acesso_principal: 'RSFN', inicio_operacao: '2002-04-22' }));
  T.ba_pluggy_categorias = CATEGORIES.map((c, i) => ({ idx: i, id: c.id, description: c.description, description_translated: c.description_translated, parent_id: c.parent_id, parent_description: c.parent_description, parent_description_translated: c.parent_description_translated }));
  return T;
}

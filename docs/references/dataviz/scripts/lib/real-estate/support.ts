/**
 * Foto mensal de estoque, saídas de carteira, campanhas e investimento de
 * marketing, DRE gerencial e pesquisas de satisfação — todos DERIVADOS dos
 * eventos do funil/locação para que os números fechem entre páginas.
 */
import { type Rng, type Row, id, addDays, daysBetween, firstDay, monthlySnapshots, dayOfMonth, roundTo, monthOf } from './base';
import { BRANCHES, PAID_CHANNELS, EXIT_REASONS, inventoryAgeBand, departmentId, CUSTOMER_TYPES, SURVEY_STAGES } from './universe';
import type { Broker } from './structure';
import type { Property, Development } from './product';
import { type Lease, isLeaseActiveAt, type Invoice } from './rental';
import type { PropertyEvents } from './funnel';

/** Imóveis de venda parados há muito tempo saem da carteira (retirados/vendidos por outro). */
export const applyExits = (rng: Rng, properties: Property[], lastSnapshot: string): void => {
  for (const property of properties) {
    if (property.status !== 'disponivel' || property.finalidade === 'locacao') continue;
    const age = daysBetween(property.data_captacao, lastSnapshot);
    if (age > 240 && rng.chance(0.35)) {
      const exitDate = addDays(property.data_captacao, rng.int(200, Math.min(age - 1, 520)));
      property.status = 'retirado'; property.data_saida = exitDate; property.motivo_saida = rng.weighted(EXIT_REASONS);
    }
  }
};

export const generateInventorySnapshot = (properties: Property[], leases: Lease[], events: PropertyEvents, lastSnapshot: string, months: number): Row[] => {
  const out: Row[] = [];
  const leasesByProperty = new Map<string, Lease[]>();
  for (const lease of leases) (leasesByProperty.get(lease.imovel_id) ?? leasesByProperty.set(lease.imovel_id, []).get(lease.imovel_id)!).push(lease);
  for (const snapshot of monthlySnapshots(lastSnapshot, months)) {
    for (const property of properties) {
      if (property.data_captacao > snapshot) continue;
      if (property.data_saida && property.data_saida <= snapshot) continue;
      const isRented = (leasesByProperty.get(property.imovel_id) ?? []).some((lease) => isLeaseActiveAt(lease, snapshot));
      const propertyEvents = events.get(property.imovel_id);
      const days = daysBetween(property.data_captacao, snapshot);
      out.push({
        data_base_report: snapshot, imovel_id: property.imovel_id, unidade_id: property.unidade_id, tipo: property.tipo, finalidade: property.finalidade, regiao: property.regiao,
        status: isRented ? 'alugado' : 'disponivel', valor_anuncio: property.valor_anuncio, valor_aluguel_anuncio: property.valor_aluguel_anuncio,
        dias_em_estoque: days, faixa_estoque: inventoryAgeBand(days), exclusividade: property.exclusividade,
        visitas_acumuladas: propertyEvents?.visits.filter((d) => d <= snapshot).length ?? 0, propostas_acumuladas: propertyEvents?.proposals.filter((d) => d <= snapshot).length ?? 0,
      });
    }
  }
  return out;
};

const CPL: Record<string, number> = { zap: 38, vivareal: 42, olx: 26, meta_ads: 55, google_ads: 95, instagram: 48 };
const CPM: Record<string, number> = { zap: 9, vivareal: 9, olx: 6, meta_ads: 14, google_ads: 32, instagram: 12 };

export const generateMarketing = (rng: Rng, leads: Row[], developments: Development[], start: string, lastSnapshot: string, months: number): { campaigns: Row[]; investments: Row[] } => {
  const campaigns: Row[] = [];
  for (const branch of BRANCHES) for (const channel of PAID_CHANNELS) {
    campaigns.push({ campanha_id: `cmp-${branch.id}-${channel}`, nome: `${branch.name} · ${channel} · always-on`, canal: channel, unidade_id: branch.id, departamento_id: departmentId(branch.id, 'marketing'), empreendimento_id: null, data_inicio: branch.openedAt > start ? branch.openedAt : start, data_fim: null, objetivo: 'leads' });
  }
  for (const development of developments) {
    campaigns.push({ campanha_id: `cmp-${development.empreendimento_id}`, nome: `Lançamento ${development.nome}`, canal: 'meta_ads', unidade_id: development.unidade_id, departamento_id: departmentId(development.unidade_id, 'marketing'), empreendimento_id: development.empreendimento_id, data_inicio: addDays(development.data_lancamento, -45), data_fim: addDays(development.data_lancamento, 240), objetivo: 'leads' });
  }
  // agrega leads reais por (competência, campanha)
  const totals = new Map<string, { leads: number; qualified: number; channel: string; branch: string }>();
  for (const lead of leads) {
    if (!lead.campanha_id) continue;
    const key = `${monthOf(String(lead.data_criacao))}|${lead.campanha_id}`;
    const total = totals.get(key) ?? { leads: 0, qualified: 0, channel: String(lead.origem), branch: String(lead.unidade_id) };
    total.leads++; if (lead.qualificado) total.qualified++;
    totals.set(key, total);
  }
  const investments: Row[] = [];
  for (const snapshot of monthlySnapshots(lastSnapshot, months)) {
    const period = firstDay(snapshot);
    for (const campaign of campaigns) {
      if (String(campaign.data_inicio) > snapshot || (campaign.data_fim && String(campaign.data_fim) < period)) continue;
      const total = totals.get(`${monthOf(snapshot)}|${campaign.campanha_id}`);
      const leadCount = total?.leads ?? 0;
      const channel = String(campaign.canal);
      const spend = roundTo(Math.max(800, leadCount * CPL[channel] * Math.exp(rng.normal(0, 0.15)) + (campaign.empreendimento_id ? 12_000 : 0)), 2);
      const impressions = Math.round(spend / CPM[channel] * 1000);
      const clicks = Math.round(impressions * (channel === 'google_ads' ? 0.045 : 0.012) * Math.exp(rng.normal(0, 0.2)));
      investments.push({ competencia: period, campanha_id: campaign.campanha_id, canal: channel, unidade_id: campaign.unidade_id, departamento_id: campaign.departamento_id, investimento: spend, impressoes: impressions, cliques: clicks, leads_gerados: leadCount, leads_qualificados: total?.qualified ?? 0 });
    }
  }
  return { campaigns, investments };
};

const OCCUPANCY_COST: Record<string, number> = { centro: 18_000, zona_sul: 22_000, zona_norte: 9_000, abc: 8_500, campinas: 11_000, litoral: 7_000 };
// Corretor é autônomo: recebe ajuda de custo + comissão (a comissão entra em `comissao_corretor`).
const SALARY_BY_ROLE: Record<string, number> = { corretor: 1_400, sdr: 2_800, captador: 2_600, coordenador: 7_500, gerente: 12_000 };

export const generateFinance = (rng: Rng, input: { sales: Row[]; invoices: Invoice[]; leases: Lease[]; investments: Row[]; brokers: Broker[]; lastSnapshot: string; months: number }): Row[] => {
  const out: Row[] = [];
  let n = 0;
  const push = (period: string, branch: string, slug: Parameters<typeof departmentId>[1], kind: 'receita' | 'despesa', category: string, amount: number) => {
    if (amount <= 0) return;
    const dueDate = `${period.slice(0, 8)}${kind === 'receita' ? '15' : '05'}`;
    const isLate = kind === 'despesa' && rng.chance(0.03);
    out.push({ lancamento_id: id('fin', ++n, 6), competencia: period, unidade_id: branch, departamento_id: departmentId(branch, slug), natureza: kind, categoria: category, valor: roundTo(amount, 2), data_vencimento: dueDate, data_pagamento: isLate ? null : addDays(dueDate, rng.int(0, 3)), status: isLate ? 'atrasado' : 'realizado' });
  };
  for (const snapshot of monthlySnapshots(input.lastSnapshot, input.months)) {
    const period = firstDay(snapshot);
    const month = monthOf(snapshot);
    for (const branch of BRANCHES) {
      if (snapshot < branch.openedAt) continue;
      const monthSales = input.sales.filter((s) => s.unidade_id === branch.id && s.data_recebimento_comissao && monthOf(String(s.data_recebimento_comissao)) === month);
      push(period, branch.id, 'prontos', 'receita', 'comissao_venda_pronto', monthSales.filter((s) => s.departamento === 'prontos').reduce((sum, s) => sum + Number(s.comissao_imobiliaria), 0));
      push(period, branch.id, 'lancamentos', 'receita', 'comissao_venda_lancamento', monthSales.filter((s) => s.departamento === 'lancamentos').reduce((sum, s) => sum + Number(s.comissao_imobiliaria), 0));
      push(period, branch.id, 'adm_locacao', 'receita', 'taxa_administracao', input.invoices.filter((inv) => inv.unidade_id === branch.id && inv.competencia === period && inv.data_pagamento).reduce((sum, inv) => sum + inv.taxa_adm_valor, 0));
      push(period, branch.id, 'locacao', 'receita', 'taxa_intermediacao_locacao', input.leases.filter((lease) => lease.unidade_id === branch.id && monthOf(lease.data_inicio) === month).reduce((sum, lease) => sum + lease.taxa_intermediacao, 0));
      push(period, branch.id, 'financeiro', 'receita', 'servicos', Math.max(0, rng.normal(9_000, 2_500)) * branch.weight);
      const brokerCommissionsPaid = input.sales.filter((s) => s.unidade_id === branch.id && s.data_pagamento_corretor && monthOf(String(s.data_pagamento_corretor)) === month).reduce((sum, s) => sum + Number(s.comissao_corretor), 0);
      push(period, branch.id, 'financeiro', 'despesa', 'comissao_corretor', brokerCommissionsPaid);
      const staff = input.brokers.filter((b) => b.unidade_id === branch.id && b.data_admissao <= snapshot && (!b.data_desligamento || b.data_desligamento > snapshot));
      push(period, branch.id, 'financeiro', 'despesa', 'pessoal', staff.reduce((sum, b) => sum + SALARY_BY_ROLE[b.cargo], 0) * 1.35 + 16_000);
      push(period, branch.id, 'marketing', 'despesa', 'marketing', input.investments.filter((inv) => inv.unidade_id === branch.id && inv.competencia === period).reduce((sum, inv) => sum + Number(inv.investimento), 0));
      push(period, branch.id, 'financeiro', 'despesa', 'ocupacao', OCCUPANCY_COST[branch.id] * (1 + rng.normal(0, 0.02)));
      push(period, branch.id, 'financeiro', 'despesa', 'tecnologia', 3_500 + staff.length * 120);
      push(period, branch.id, 'financeiro', 'despesa', 'administrativo', Math.max(0, rng.normal(8_000, 1_500)));
      const revenue = out.filter((entry) => entry.unidade_id === branch.id && entry.competencia === period && entry.natureza === 'receita').reduce((sum, entry) => sum + Number(entry.valor), 0);
      push(period, branch.id, 'financeiro', 'despesa', 'impostos', revenue * 0.09);
    }
  }
  return out;
};

export const generateSurveys = (rng: Rng, brokers: Broker[], lastSnapshot: string, months: number): Row[] => {
  const out: Row[] = [];
  let n = 0;
  const NPS_BASE: Record<string, number> = { centro: 8.3, zona_sul: 8.6, zona_norte: 7.4, abc: 7.9, campinas: 8.1, litoral: 6.8 };
  for (const snapshot of monthlySnapshots(lastSnapshot, months)) {
    for (const branch of BRANCHES) {
      if (snapshot < branch.openedAt) continue;
      const team = brokers.filter((b) => b.unidade_id === branch.id && b.cargo === 'corretor' && b.data_admissao <= snapshot && (!b.data_desligamento || b.data_desligamento > snapshot));
      const count = Math.round(55 * branch.weight);
      for (let i = 0; i < count; i++) {
        const broker = rng.pick(team);
        const customerType = rng.weighted([['comprador', 40], ['proprietario', 30], ['inquilino', 30]] as const);
        const score = Math.max(0, Math.min(10, Math.round(rng.normal(NPS_BASE[branch.id] + (broker ? (broker.weight - 1) * 0.6 : 0) + (customerType === 'inquilino' ? -0.5 : 0), 1.7))));
        const slug = customerType === 'comprador' ? 'prontos' : customerType === 'proprietario' ? 'adm_locacao' : 'locacao';
        out.push({ pesquisa_id: id('nps', ++n, 6), data: dayOfMonth(rng, snapshot), tipo_cliente: customerType, nota: score, unidade_id: branch.id, corretor_id: broker?.corretor_id ?? null, departamento_id: departmentId(branch.id, slug), etapa: rng.pick(SURVEY_STAGES) });
      }
    }
  }
  void CUSTOMER_TYPES;
  return out;
};

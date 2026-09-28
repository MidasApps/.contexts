/**
 * Contratos de locação: carteira pré-existente ao período, ciclo de vida
 * decidido na criação (encerramento/renovação), faturas mensais e foto da
 * carteira por `data_base_report`.
 *
 * As chaves em snake_case de `Lease` e `Invoice` são colunas de
 * `contratos_locacao` e `faturas_locacao` (`repasse_garantido` é coluna de
 * `faturas_locacao` e sai da linha do contrato em `leaseRow`).
 */
import { type Rng, type Row, id, addDays, addMonths, monthsBetween, daysBetween, firstDay, monthlySnapshots, roundTo } from './base';
import { GUARANTEES, ADJUSTMENT_INDEXES, TERMINATION_REASONS, delinquencyBand, BRANCHES } from './universe';
import type { Broker } from './structure';
import type { Property } from './product';

export interface Lease {
  contrato_id: string; imovel_id: string; unidade_id: string; corretor_id: string;
  data_inicio: string; data_fim_prevista: string; data_encerramento: string | null;
  valor_aluguel: number; valor_encargos: number; taxa_adm_pct: number; taxa_intermediacao: number;
  garantia: string; indice_reajuste: string; status: string; motivo_encerramento: string | null;
  dias_para_alugar: number; renovado: boolean; repasse_garantido: boolean;
}

const BRANCH_RISK_FACTOR: Record<string, number> = { centro: 1, zona_sul: 0.85, zona_norte: 1.3, abc: 1.1, campinas: 0.95, litoral: 1.55 };
const LATE_PAYMENT_PROBABILITY_BY_GUARANTEE: Record<string, number> = { seguro_fianca: 0.035, fiador: 0.05, caucao: 0.07, titulo_capitalizacao: 0.04, sem_garantia: 0.14 };

/** Próximo `contrato_id` (`loc-00001`, `loc-00002`, …) de uma execução do gerador. */
export type LeaseIdSequence = () => string;

/** Uma sequência por execução: ids não vazam entre chamadas de `generateRealEstate`. */
export const createLeaseIdSequence = (): LeaseIdSequence => {
  let n = 0;
  return () => id('loc', ++n, 5);
};

/** Cria um contrato com ciclo de vida já decidido. `lastSnapshot` limita encerramentos. */
export const createLease = (rng: Rng, nextLeaseId: LeaseIdSequence, property: Property, broker: Broker, startDate: string, lastSnapshot: string, daysToRent: number): Lease => {
  const rent = property.valor_aluguel_anuncio ?? roundTo((property.valor_anuncio ?? 400_000) * 0.0042 / 50, 0) * 50;
  const term = 30;
  const plannedEnd = addMonths(startDate, term);
  // churn mensal ~1,6% → chance de rescisão antes do prazo; no prazo, renovação 65%.
  let endDate: string | null = null;
  let status = 'ativo';
  let reason: string | null = null;
  let isRenewed = false;
  const monthsToSnapshot = monthsBetween(startDate, lastSnapshot);
  for (let m = 3; m <= Math.min(term - 1, monthsToSnapshot); m++) {
    if (rng.chance(0.016 * BRANCH_RISK_FACTOR[property.unidade_id])) {
      endDate = addMonths(startDate, m);
      status = 'rescindido';
      reason = rng.weighted(TERMINATION_REASONS.filter(([key]) => key !== 'fim_contrato'));
      break;
    }
  }
  if (!endDate && plannedEnd <= lastSnapshot) {
    if (rng.chance(0.65)) isRenewed = true;
    else { endDate = plannedEnd; status = 'encerrado'; reason = 'fim_contrato'; }
  }
  if (isRenewed) {
    status = 'renovado';
    // segundo ciclo pode encerrar também
    const secondEnd = addMonths(plannedEnd, term);
    for (let m = 1; m <= Math.min(term - 1, monthsBetween(plannedEnd, lastSnapshot)); m++) {
      if (rng.chance(0.012)) { endDate = addMonths(plannedEnd, m); status = 'rescindido'; reason = rng.weighted(TERMINATION_REASONS.filter(([key]) => key !== 'fim_contrato')); break; }
    }
    if (!endDate && secondEnd <= lastSnapshot) { endDate = secondEnd; status = 'encerrado'; reason = 'fim_contrato'; }
  }
  const fee = roundTo(rng.weighted([[0.08, 20], [0.1, 55], [0.12, 25]] as const) + rng.normal(0, 0.004), 3);
  return {
    contrato_id: nextLeaseId(), imovel_id: property.imovel_id, unidade_id: property.unidade_id, corretor_id: broker.corretor_id,
    data_inicio: startDate, data_fim_prevista: isRenewed ? addMonths(plannedEnd, term) : plannedEnd, data_encerramento: endDate,
    valor_aluguel: rent, valor_encargos: roundTo(property.valor_condominio + property.iptu_mensal, 2), taxa_adm_pct: fee,
    taxa_intermediacao: rent, garantia: rng.weighted(GUARANTEES), indice_reajuste: rng.pick(ADJUSTMENT_INDEXES), status, motivo_encerramento: reason,
    dias_para_alugar: daysToRent, renovado: isRenewed, repasse_garantido: rng.chance(0.3),
  };
};

export const isLeaseActiveAt = (lease: Lease, day: string) => lease.data_inicio <= day && (!lease.data_encerramento || lease.data_encerramento > day);

/** Carteira que já existia antes do período: ocupa imóveis de locação captados antes de `start`. */
export const generateInitialLeases = (rng: Rng, nextLeaseId: LeaseIdSequence, properties: Property[], rentalBrokers: Broker[], start: string, lastSnapshot: string, share = 0.78): Lease[] => {
  const out: Lease[] = [];
  for (const property of properties) {
    if (property.finalidade === 'venda' || property.data_captacao >= start) continue;
    if (!rng.chance(share)) continue;
    const broker = rng.pick(rentalBrokers.filter((b) => b.unidade_id === property.unidade_id)) ?? rng.pick(rentalBrokers);
    const daysToRent = rng.int(12, 75);
    const startDate = addDays(property.data_captacao, daysToRent);
    if (startDate >= start) continue;
    const lease = createLease(rng, nextLeaseId, property, broker, startDate, lastSnapshot, daysToRent);
    out.push(lease);
    if (isLeaseActiveAt(lease, start)) property.status = 'alugado';
  }
  return out;
};

export interface Invoice {
  fatura_id: string; contrato_id: string; imovel_id: string; unidade_id: string; competencia: string;
  valor_aluguel: number; valor_encargos: number; valor_total: number; data_vencimento: string; data_pagamento: string | null;
  status: string; dias_atraso: number; taxa_adm_valor: number; valor_repasse: number; data_repasse: string | null;
  repasse_no_prazo: boolean; repasse_garantido: boolean;
}

export const generateInvoices = (rng: Rng, leases: Lease[], start: string, lastSnapshot: string): Invoice[] => {
  const out: Invoice[] = [];
  let n = 0;
  const snapshots = monthlySnapshots(lastSnapshot, monthsBetween(start, lastSnapshot) + 1);
  for (const lease of leases) {
    for (const snapshot of snapshots) {
      const period = firstDay(snapshot);
      if (period < lease.data_inicio.slice(0, 8) + '01') continue;
      if (lease.data_encerramento && period >= lease.data_encerramento) continue;
      const dueDate = `${period.slice(0, 8)}10`;
      const lateProbability = LATE_PAYMENT_PROBABILITY_BY_GUARANTEE[lease.garantia] * BRANCH_RISK_FACTOR[lease.unidade_id];
      let daysLate = 0;
      if (rng.chance(lateProbability)) daysLate = rng.weighted([[rng.int(1, 30), 60], [rng.int(31, 60), 25], [rng.int(61, 90), 10], [rng.int(91, 150), 5]] as const);
      let paymentDate: string | null = addDays(dueDate, daysLate === 0 ? -rng.int(0, 4) : daysLate);
      let status = daysLate === 0 ? 'pago' : 'pago_atrasado';
      if (paymentDate > lastSnapshot) {
        paymentDate = null;
        const openDays = daysBetween(dueDate, lastSnapshot);
        daysLate = Math.max(0, openDays);
        status = daysLate > 60 ? (rng.chance(0.25) ? 'acordo' : 'inadimplente') : 'em_atraso';
      }
      const feeAmount = roundTo(lease.valor_aluguel * lease.taxa_adm_pct, 2);
      const payoutAmount = roundTo(lease.valor_aluguel - feeAmount, 2);
      const payoutBase = lease.repasse_garantido ? dueDate : paymentDate;
      const payoutDate = payoutBase ? addDays(payoutBase, rng.chance(0.92) ? rng.int(1, 5) : rng.int(6, 15)) : null;
      out.push({
        fatura_id: id('fat', ++n, 7), contrato_id: lease.contrato_id, imovel_id: lease.imovel_id, unidade_id: lease.unidade_id, competencia: period,
        valor_aluguel: lease.valor_aluguel, valor_encargos: lease.valor_encargos, valor_total: roundTo(lease.valor_aluguel + lease.valor_encargos, 2),
        data_vencimento: dueDate, data_pagamento: paymentDate, status, dias_atraso: daysLate, taxa_adm_valor: feeAmount, valor_repasse: payoutAmount,
        data_repasse: payoutDate && payoutDate <= lastSnapshot ? payoutDate : null,
        repasse_no_prazo: !!payoutDate && daysBetween(payoutBase!, payoutDate) <= 5, repasse_garantido: lease.repasse_garantido,
      });
    }
  }
  return out;
};

export const generateLeaseSnapshot = (leases: Lease[], invoices: Invoice[], properties: Map<string, Property>, lastSnapshot: string, months: number): Row[] => {
  const out: Row[] = [];
  const invoicesByLease = new Map<string, Invoice[]>();
  for (const invoice of invoices) (invoicesByLease.get(invoice.contrato_id) ?? invoicesByLease.set(invoice.contrato_id, []).get(invoice.contrato_id)!).push(invoice);
  for (const snapshot of monthlySnapshots(lastSnapshot, months)) {
    for (const lease of leases) {
      if (!isLeaseActiveAt(lease, snapshot)) continue;
      let daysLate = 0;
      for (const invoice of invoicesByLease.get(lease.contrato_id) ?? []) {
        if (invoice.data_vencimento >= snapshot) continue;
        if (!invoice.data_pagamento || invoice.data_pagamento > snapshot) daysLate = Math.max(daysLate, daysBetween(invoice.data_vencimento, snapshot));
      }
      const property = properties.get(lease.imovel_id);
      out.push({
        data_base_report: snapshot, contrato_id: lease.contrato_id, imovel_id: lease.imovel_id, unidade_id: lease.unidade_id,
        regiao: property?.regiao ?? BRANCHES.find((b) => b.id === lease.unidade_id)!.region, tipo: property?.tipo ?? 'apartamento', status: 'ativo',
        valor_aluguel: lease.valor_aluguel, taxa_adm_valor: roundTo(lease.valor_aluguel * lease.taxa_adm_pct, 2), dias_atraso: daysLate, faixa_atraso: delinquencyBand(daysLate),
        meses_de_contrato: monthsBetween(lease.data_inicio, snapshot), garantia: lease.garantia, vence_em_90_dias: lease.data_fim_prevista > snapshot && daysBetween(snapshot, lease.data_fim_prevista) <= 90,
      });
    }
  }
  return out;
};

export const leaseRow = (lease: Lease): Row => {
  const { repasse_garantido: _guaranteedPayout, ...rest } = lease;
  return rest;
};

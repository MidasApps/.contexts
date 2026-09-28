/**
 * Funil comercial: leads → interações → visitas → propostas → vendas ou
 * contratos de locação. Processado em ordem cronológica porque cada
 * fechamento consome um imóvel ou uma unidade do espelho.
 */
import { type Rng, type Row, id, addDays, daysBetween, timestampOf, dayOfMonth, monthlySnapshots, roundTo } from './base';
import { BRANCHES, LEAD_SOURCES, PAID_CHANNELS, LOSS_REASONS, PRICE_BANDS, INTERACTION_CHANNELS, FEEDBACKS, PAYMENT_METHODS, BANKS, CANCELLATION_REASONS, SEASONALITY, PROPERTY_TYPES, departmentId } from './universe';
import { type Broker, activeAt, pickBroker } from './structure';
import type { Property, Development, DevelopmentUnit } from './product';
import { type Lease, type LeaseIdSequence, createLease, isLeaseActiveAt } from './rental';

export type PropertyEvents = Map<string, { visits: string[]; proposals: string[] }>;

export interface Funnel { leads: Row[]; interactions: Row[]; visits: Row[]; proposals: Row[]; sales: Row[]; newLeases: Lease[]; propertyEvents: PropertyEvents }

interface FunnelContext { rng: Rng; nextLeaseId: LeaseIdSequence; brokers: Broker[]; properties: Property[]; developments: Development[]; leases: Lease[]; lastSnapshot: string; leadsPerMonth: number }

const CONVERSION = { qualified: 0.44, visit: 0.45, attended: 0.82, proposal: { purchase: 0.3, rental: 0.5 }, acceptance: { purchase: 0.55, rental: 0.65 } };
const MEDIAN_RESPONSE_MINUTES: Record<string, number> = { centro: 28, zona_sul: 24, zona_norte: 55, abc: 40, campinas: 35, litoral: 140 };

export const generateFunnel = (ctx: FunnelContext, start: string, months: number): Funnel => {
  const { rng, lastSnapshot } = ctx;
  const F: Funnel = { leads: [], interactions: [], visits: [], proposals: [], sales: [], newLeases: [], propertyEvents: new Map() };
  let leadSeq = 0, interactionSeq = 0, visitSeq = 0, proposalSeq = 0, saleSeq = 0;
  const isRecent = (day: string) => daysBetween(day, lastSnapshot) <= 21;
  const recordPropertyEvent = (propertyId: string, kind: 'visits' | 'proposals', day: string) => {
    const events = F.propertyEvents.get(propertyId) ?? { visits: [], proposals: [] };
    events[kind].push(day);
    F.propertyEvents.set(propertyId, events);
  };

  for (const snapshot of monthlySnapshots(lastSnapshot, months)) {
    const month0 = Number(snapshot.slice(5, 7)) - 1;
    for (const branch of BRANCHES) {
      if (snapshot < branch.openedAt) continue;
      const total = Math.round(ctx.leadsPerMonth * branch.weight * SEASONALITY[month0] * (1 + rng.normal(0, 0.08)));
      const activeDevelopments = ctx.developments.filter((d) => d.unidade_id === branch.id && d.fase !== 'pre_lancamento' && d.data_lancamento <= snapshot);
      for (let i = 0; i < total; i++) {
        const day = dayOfMonth(rng, snapshot);
        const source = rng.weighted(LEAD_SOURCES);
        const interest = rng.weighted([['compra_pronto', 45], ['compra_lancamento', activeDevelopments.length ? 25 : 0], ['locacao', 30]] as const);
        const development = interest === 'compra_lancamento' ? rng.pick(activeDevelopments) : null;
        const slug = interest === 'compra_pronto' ? 'prontos' : interest === 'compra_lancamento' ? 'lancamentos' : 'locacao';
        const team = activeAt(ctx.brokers, day, (b) => b.unidade_id === branch.id && b.departamento_id === departmentId(branch.id, slug) && b.cargo === 'corretor');
        const broker = pickBroker(rng, team) ?? pickBroker(rng, activeAt(ctx.brokers, day, (b) => b.unidade_id === branch.id && b.cargo === 'corretor'))!;
        const quality = Math.min(1.6, Math.max(0.5, broker.weight)) * (branch.weight >= 1 ? 1 : 0.85);
        const campaign = (PAID_CHANNELS as readonly string[]).includes(source) ? (development && rng.chance(0.6) ? `cmp-${development.empreendimento_id}` : `cmp-${branch.id}-${source}`) : null;

        const lead: Row = {
          lead_id: id('lead', ++leadSeq, 6), data_criacao: day, data_hora_criacao: timestampOf(rng, day), origem: source, campanha_id: campaign, unidade_id: branch.id,
          departamento_id: departmentId(branch.id, slug), corretor_id: broker.corretor_id, interesse: interest, empreendimento_id: development?.empreendimento_id ?? null, imovel_id: null,
          faixa_valor: rng.pick(PRICE_BANDS), tipo_desejado: rng.weighted(PROPERTY_TYPES), regiao_desejada: branch.region, status: 'novo', motivo_perda: null,
          data_primeiro_contato: null, minutos_primeiro_contato: null, data_qualificacao: null, data_ultima_interacao: null, data_fechamento: null, qualificado: false,
        };
        F.leads.push(lead);

        // primeiro contato
        const isNeverContacted = rng.chance(0.07 / Math.min(1.3, quality));
        if (isNeverContacted) {
          if (!isRecent(day)) { lead.status = 'perdido'; lead.motivo_perda = 'sem_retorno'; lead.data_fechamento = addDays(day, 14); }
          continue;
        }
        const minutes = Math.max(1, Math.round(MEDIAN_RESPONSE_MINUTES[branch.id] * Math.exp(rng.normal(0, 0.9)) / Math.sqrt(quality)));
        const contactDay = addDays(day, Math.floor(minutes / 1440));
        lead.data_primeiro_contato = timestampOf(rng, contactDay);
        lead.minutos_primeiro_contato = minutes;
        lead.status = 'em_atendimento';
        lead.data_ultima_interacao = contactDay;
        F.interactions.push({ interacao_id: id('int', ++interactionSeq, 7), lead_id: lead.lead_id, corretor_id: broker.corretor_id, unidade_id: branch.id, data_hora: lead.data_primeiro_contato, data: contactDay, canal: rng.weighted(INTERACTION_CHANNELS), tipo: 'primeiro_contato' });
        const followUps = rng.int(0, 4);
        let lastTouch = contactDay;
        for (let k = 0; k < followUps; k++) {
          lastTouch = addDays(lastTouch, rng.int(1, 6));
          if (lastTouch > lastSnapshot) break;
          F.interactions.push({ interacao_id: id('int', ++interactionSeq, 7), lead_id: lead.lead_id, corretor_id: broker.corretor_id, unidade_id: branch.id, data_hora: timestampOf(rng, lastTouch), data: lastTouch, canal: rng.weighted(INTERACTION_CHANNELS), tipo: 'follow_up' });
          lead.data_ultima_interacao = lastTouch;
        }
        const lose = (when: string) => {
          if (isRecent(when)) return;
          lead.status = 'perdido'; lead.motivo_perda = rng.weighted(LOSS_REASONS); lead.data_fechamento = addDays(when, rng.int(3, 20));
          if (lead.data_fechamento > lastSnapshot) lead.data_fechamento = lastSnapshot;
        };

        // qualificação
        if (!rng.chance(CONVERSION.qualified * quality)) { lose(contactDay); continue; }
        const qualificationDay = addDays(contactDay, rng.int(1, 5));
        if (qualificationDay > lastSnapshot) continue;
        lead.qualificado = true; lead.data_qualificacao = qualificationDay; lead.status = 'qualificado';

        // alvo: imóvel pronto / unidade do espelho
        const target = pickTarget(ctx, lead, branch.id, development, qualificationDay);
        if (!target) { lead.status = 'perdido'; lead.motivo_perda = 'imovel_indisponivel'; lead.data_fechamento = qualificationDay; continue; }
        if (target.kind === 'property') lead.imovel_id = target.property.imovel_id;

        // visita
        if (!rng.chance(CONVERSION.visit * Math.sqrt(quality))) { lose(qualificationDay); continue; }
        const scheduledDay = addDays(qualificationDay, rng.int(2, 14));
        if (scheduledDay > lastSnapshot) { lead.status = 'visita'; continue; }
        const isAttended = rng.chance(CONVERSION.attended);
        const visitDay = isAttended ? addDays(scheduledDay, rng.int(0, 2)) : null;
        F.visits.push({ visita_id: id('vis', ++visitSeq, 6), lead_id: lead.lead_id, imovel_id: target.kind === 'property' ? target.property.imovel_id : null, unidade_emp_id: target.kind === 'developmentUnit' ? target.unit.unidade_emp_id : null, corretor_id: broker.corretor_id, unidade_id: branch.id, data_agendada: scheduledDay, data_realizada: visitDay, realizada: isAttended, no_show: !isAttended, feedback: isAttended ? rng.weighted(FEEDBACKS) : null });
        F.interactions.push({ interacao_id: id('int', ++interactionSeq, 7), lead_id: lead.lead_id, corretor_id: broker.corretor_id, unidade_id: branch.id, data_hora: timestampOf(rng, addDays(scheduledDay, -1)), data: addDays(scheduledDay, -1), canal: 'whatsapp', tipo: 'agendamento' });
        lead.status = 'visita'; lead.data_ultima_interacao = visitDay ?? scheduledDay;
        if (target.kind === 'property') recordPropertyEvent(target.property.imovel_id, 'visits', scheduledDay);
        if (!isAttended) { lose(scheduledDay); continue; }

        // proposta
        const isRental = interest === 'locacao';
        if (!rng.chance((isRental ? CONVERSION.proposal.rental : CONVERSION.proposal.purchase) * Math.sqrt(quality))) { lose(visitDay!); continue; }
        const proposalDay = addDays(visitDay!, rng.int(1, 10));
        if (proposalDay > lastSnapshot) continue;
        const askingPrice = target.kind === 'property' ? (isRental ? target.property.valor_aluguel_anuncio! : target.property.valor_anuncio!) : target.unit.valor_tabela;
        const requestedDiscount = target.kind === 'developmentUnit' ? rng.normal(0.02, 0.012) : rng.normal(0.06, 0.03);
        const offerAmount = roundTo(askingPrice * (1 - Math.max(0, requestedDiscount)) / 100, 0) * 100;
        const isAccepted = rng.chance((isRental ? CONVERSION.acceptance.rental : CONVERSION.acceptance.purchase) * Math.sqrt(quality));
        const rounds = rng.int(1, 3);
        const responseDay = addDays(proposalDay, rng.int(1, 7) * rounds);
        const isPending = responseDay > lastSnapshot;
        const proposalStatus = isPending ? (rounds > 1 ? 'contraproposta' : 'enviada') : isAccepted ? 'aceita' : rng.chance(0.8) ? 'recusada' : 'expirada';
        const proposalId = id('prop', ++proposalSeq, 6);
        F.proposals.push({ proposta_id: proposalId, lead_id: lead.lead_id, imovel_id: target.kind === 'property' ? target.property.imovel_id : null, unidade_emp_id: target.kind === 'developmentUnit' ? target.unit.unidade_emp_id : null, corretor_id: broker.corretor_id, unidade_id: branch.id, departamento: target.kind === 'developmentUnit' ? 'lancamentos' : isRental ? 'locacao' : 'prontos', data_envio: proposalDay, valor_pedido: askingPrice, valor_proposta: offerAmount, status: proposalStatus, data_resposta: isPending ? null : responseDay, rodadas: rounds });
        F.interactions.push({ interacao_id: id('int', ++interactionSeq, 7), lead_id: lead.lead_id, corretor_id: broker.corretor_id, unidade_id: branch.id, data_hora: timestampOf(rng, proposalDay), data: proposalDay, canal: 'email', tipo: 'envio_proposta' });
        lead.status = 'proposta'; lead.data_ultima_interacao = proposalDay;
        if (target.kind === 'property') recordPropertyEvent(target.property.imovel_id, 'proposals', proposalDay);
        if (target.kind === 'developmentUnit') { target.unit.status = 'reservada'; target.unit.data_reserva = proposalDay; target.unit.corretor_id = broker.corretor_id; }
        if (isPending) continue;
        if (!isAccepted) { if (target.kind === 'developmentUnit') { target.unit.status = 'disponivel'; target.unit.data_reserva = null; target.unit.corretor_id = null; } lose(responseDay); continue; }

        // fechamento
        lead.status = 'ganho'; lead.data_fechamento = responseDay;
        if (isRental && target.kind === 'property') {
          const leaseStart = addDays(responseDay, rng.int(3, 12));
          const lease = createLease(rng, ctx.nextLeaseId, target.property, broker, leaseStart, lastSnapshot, daysBetween(target.property.data_captacao, leaseStart));
          F.newLeases.push(lease); ctx.leases.push(lease);
          target.property.status = 'alugado';
          continue;
        }
        const listPrice = askingPrice;
        const discount = roundTo((listPrice - offerAmount) / listPrice, 4);
        const commissionRate = target.kind === 'developmentUnit' ? 0.045 : roundTo(rng.weighted([[0.05, 30], [0.06, 60], [0.07, 10]] as const), 3);
        const commissionTotal = roundTo(offerAmount * commissionRate, 2);
        // Split típico: imobiliária fica com 55–60% da comissão; corretor com 40–45%.
        const brokerShare = target.kind === 'developmentUnit' ? 0.45 : 0.4;
        const receiptDay = addDays(responseDay, target.kind === 'developmentUnit' ? rng.int(30, 120) : rng.int(10, 60));
        const isReceived = receiptDay <= lastSnapshot;
        const brokerPaymentDay = isReceived ? addDays(receiptDay, rng.int(5, 15)) : null;
        const isCancelled = rng.chance(target.kind === 'developmentUnit' ? 0.06 : 0.015);
        const cancellationDay = isCancelled ? addDays(responseDay, rng.int(30, 180)) : null;
        const hasCancellation = !!cancellationDay && cancellationDay <= lastSnapshot;
        F.sales.push({
          venda_id: id('vnd', ++saleSeq, 6), proposta_id: proposalId, lead_id: lead.lead_id, imovel_id: target.kind === 'property' ? target.property.imovel_id : null,
          unidade_emp_id: target.kind === 'developmentUnit' ? target.unit.unidade_emp_id : null, empreendimento_id: target.kind === 'developmentUnit' ? target.unit.empreendimento_id : null,
          departamento: target.kind === 'developmentUnit' ? 'lancamentos' : 'prontos', corretor_id: broker.corretor_id, unidade_id: branch.id, data_venda: responseDay,
          valor_venda: offerAmount, valor_tabela: listPrice, desconto_pct: discount, forma_pagamento: rng.weighted(PAYMENT_METHODS), banco: rng.weighted(BANKS),
          comissao_pct: commissionRate, comissao_total: commissionTotal, comissao_imobiliaria: roundTo(commissionTotal * (1 - brokerShare), 2), comissao_corretor: roundTo(commissionTotal * brokerShare, 2),
          data_recebimento_comissao: isReceived ? receiptDay : null, comissao_corretor_paga: !!brokerPaymentDay && brokerPaymentDay <= lastSnapshot, data_pagamento_corretor: brokerPaymentDay && brokerPaymentDay <= lastSnapshot ? brokerPaymentDay : null,
          distrato: hasCancellation, data_distrato: hasCancellation ? cancellationDay : null, motivo_distrato: hasCancellation ? rng.weighted(CANCELLATION_REASONS) : null, dias_ciclo: daysBetween(day, responseDay),
        });
        if (target.kind === 'developmentUnit') {
          target.unit.status = hasCancellation ? 'disponivel' : 'vendida'; target.unit.data_venda = hasCancellation ? null : responseDay;
          if (hasCancellation) { target.unit.data_reserva = null; target.unit.corretor_id = null; }
        } else {
          target.property.status = hasCancellation ? 'disponivel' : 'vendido';
          target.property.data_saida = hasCancellation ? null : responseDay; target.property.motivo_saida = hasCancellation ? null : 'vendido';
        }
      }
    }
  }
  return F;
};

type Target = { kind: 'property'; property: Property } | { kind: 'developmentUnit'; unit: DevelopmentUnit };

const pickTarget = (ctx: FunnelContext, lead: Row, branch: string, development: Development | null, day: string): Target | null => {
  const { rng } = ctx;
  if (development) {
    const available = development.units.filter((unit) => unit.status === 'disponivel');
    return available.length ? { kind: 'developmentUnit', unit: rng.pick(available) } : null;
  }
  const isRental = lead.interesse === 'locacao';
  const pool = ctx.properties.filter((property) => property.unidade_id === branch && property.data_captacao <= day && property.status === 'disponivel'
    && (isRental ? property.finalidade !== 'venda' : property.finalidade !== 'locacao')
    && (!isRental || !ctx.leases.some((lease) => lease.imovel_id === property.imovel_id && isLeaseActiveAt(lease, day))));
  if (!pool.length) return null;
  return { kind: 'property', property: pool[Math.floor(rng() * Math.min(pool.length, 40))] };
};

/**
 * Gerador da carteira SINTÉTICA de uma imobiliária de médio/grande porte:
 * 6 unidades, 8 departamentos, ~170 pessoas, 8 empreendimentos, milhares de
 * imóveis, leads, visitas, propostas, vendas, contratos e faturas de locação,
 * fotos mensais (`data_base_report`), marketing, DRE e NPS — as 20 tabelas de
 * `lib/real-estate-schemas.mjs`, coerentes entre si.
 *
 * Determinístico: mesma seed → mesmos dados. Puro: não toca em rede.
 * Literais de status/enum vivem em `lib/real-estate/universe.ts` e são os
 * mesmos que o SQL de `scripts/metrics/real-estate/*.mjs` compara.
 *
 * Volumes default (24 meses): ~65k leads, ~150k interações, ~2k vendas,
 * ~2,5k contratos de locação, ~50k faturas, ~60k linhas de foto de estoque.
 */
import { createRng, monthlySnapshots, firstDay, type Tables, type Row } from './real-estate/base';
import { REAL_ESTATE_SCHEMA } from './real-estate-schemas.mjs';
import { generateStructure } from './real-estate/structure';
import { generateProperties, generateDevelopments, propertyRow, developmentUnitRow, developmentRow } from './real-estate/product';
import { generateInitialLeases, generateInvoices, generateLeaseSnapshot, leaseRow, createLeaseIdSequence, type Lease } from './real-estate/rental';
import { generateFunnel } from './real-estate/funnel';
import { applyExits, generateInventorySnapshot, generateMarketing, generateFinance, generateSurveys } from './real-estate/support';

export interface RealEstateOptions {
  seed?: number;
  /** Última foto mensal (YYYY-MM-DD, fim de mês). */
  lastSnapshot?: string;
  /** Quantas fotos mensais para trás, inclusive a última. */
  months?: number;
  /** Imóveis prontos na carteira (venda + locação). */
  properties?: number;
  /** Leads por mês numa unidade de peso 1 (a soma dos pesos das 6 unidades é 5,65). */
  leadsPerMonth?: number;
}

export type { Tables, Row };

export const generateRealEstate = (options: RealEstateOptions = {}): Tables => {
  const seed = options.seed ?? 2026;
  const lastSnapshot = options.lastSnapshot ?? '2026-08-31';
  const months = options.months ?? 24;
  const rng = createRng(seed);
  const nextLeaseId = createLeaseIdSequence();
  const snapshots = monthlySnapshots(lastSnapshot, months);
  const start = firstDay(snapshots[0]);

  const structure = generateStructure(rng, start, lastSnapshot, months);
  const sourcers = structure.brokers.filter((b) => b.cargo === 'captador');
  const properties = generateProperties(rng, sourcers, start, lastSnapshot, options.properties ?? 4800);
  const developments = generateDevelopments(rng, start, lastSnapshot);
  const rentalBrokers = structure.brokers.filter((b) => b.cargo === 'corretor' && b.departamento_id.endsWith('-locacao'));
  const leases: Lease[] = generateInitialLeases(rng, nextLeaseId, properties, rentalBrokers, start, lastSnapshot);

  const funnel = generateFunnel({ rng, nextLeaseId, brokers: structure.brokers, properties, developments, leases, lastSnapshot, leadsPerMonth: options.leadsPerMonth ?? 480 }, start, months);
  applyExits(rng, properties, lastSnapshot);

  const invoices = generateInvoices(rng, leases, start, lastSnapshot);
  const propertiesById = new Map(properties.map((p) => [p.imovel_id, p]));
  const { campaigns, investments } = generateMarketing(rng, funnel.leads, developments, start, lastSnapshot, months);

  const T: Tables = {
    unidades: structure.branches,
    departamentos: structure.departments,
    corretores: structure.brokers.map(({ weight: _weight, ...broker }) => ({ ...broker, ativo: !broker.data_desligamento })),
    metas: structure.targets,
    imoveis: properties.map(propertyRow),
    empreendimentos: developments.map(developmentRow),
    espelho_vendas: developments.flatMap((d) => d.units.map(developmentUnitRow)),
    leads: funnel.leads,
    interacoes: funnel.interactions,
    visitas: funnel.visits,
    propostas: funnel.proposals,
    vendas: funnel.sales,
    contratos_locacao: leases.map(leaseRow),
    faturas_locacao: invoices.map((invoice) => ({ ...invoice })),
    carteira_locacao_snapshot: generateLeaseSnapshot(leases, invoices, propertiesById, lastSnapshot, months),
    estoque_snapshot: generateInventorySnapshot(properties, leases, funnel.propertyEvents, lastSnapshot, months),
    campanhas: campaigns,
    marketing_investimentos: investments,
    financeiro_lancamentos: generateFinance(rng, { sales: funnel.sales, invoices, leases, investments, brokers: structure.brokers, lastSnapshot, months }),
    pesquisas_satisfacao: generateSurveys(rng, structure.brokers, lastSnapshot, months),
  };

  // Garante exatamente as colunas do schema (ordem e ausentes = null).
  for (const [table, columns] of Object.entries(REAL_ESTATE_SCHEMA)) {
    const names = columns.map(([name]) => name);
    T[table] = (T[table] ?? []).map((row) => Object.fromEntries(names.map((name) => [name, row[name] ?? null])));
  }
  return T;
};

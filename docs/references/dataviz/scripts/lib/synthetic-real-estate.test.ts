import { describe, expect, it } from 'vitest';
import { generateRealEstate } from './synthetic-real-estate';
import { REAL_ESTATE_SCHEMA } from './real-estate-schemas.mjs';
import { LEAD_STATUSES, INVOICE_STATUSES, DELINQUENCY_BANDS, INVENTORY_AGE_BANDS, LEASE_STATUSES, UNIT_STATUSES, PROPERTY_STATUSES, BRANCHES } from './real-estate/universe';

const small = () => generateRealEstate({ seed: 7, months: 4, properties: 300, leadsPerMonth: 60, lastSnapshot: '2026-03-31' });

describe('generateRealEstate', () => {
  const T = small();

  it('is deterministic for the same seed', () => {
    expect(JSON.stringify(small())).toBe(JSON.stringify(T));
  });

  it('produces every table of the schema with exactly its columns', () => {
    for (const [table, columns] of Object.entries(REAL_ESTATE_SCHEMA)) {
      expect(T[table]?.length, `tabela ${table} vazia`).toBeGreaterThan(0);
      expect(Object.keys(T[table][0])).toEqual(columns.map(([name]) => name));
    }
  });

  it('uses only the literals the metric SQL compares', () => {
    const allIn = (values: unknown[], allowed: readonly string[]) => values.every((v) => allowed.includes(String(v)));
    expect(allIn(T.leads.map((r) => r.status), LEAD_STATUSES)).toBe(true);
    expect(allIn(T.faturas_locacao.map((r) => r.status), INVOICE_STATUSES)).toBe(true);
    expect(allIn(T.carteira_locacao_snapshot.map((r) => r.faixa_atraso), DELINQUENCY_BANDS)).toBe(true);
    expect(allIn(T.estoque_snapshot.map((r) => r.faixa_estoque), INVENTORY_AGE_BANDS)).toBe(true);
    expect(allIn(T.contratos_locacao.map((r) => r.status), LEASE_STATUSES)).toBe(true);
    expect(allIn(T.espelho_vendas.map((r) => r.status), UNIT_STATUSES)).toBe(true);
    expect(allIn(T.imoveis.map((r) => r.status), PROPERTY_STATUSES)).toBe(true);
    expect(new Set(T.vendas.map((r) => r.departamento))).toEqual(new Set(['prontos', 'lancamentos']));
    expect(new Set(T.unidades.map((r) => r.unidade_id))).toEqual(new Set(BRANCHES.map((b) => b.id)));
  });

  it('keeps the funnel referentially consistent', () => {
    const leads = new Set(T.leads.map((r) => r.lead_id));
    const brokers = new Set(T.corretores.map((r) => r.corretor_id));
    for (const r of T.visitas) expect(leads.has(r.lead_id)).toBe(true);
    for (const r of T.propostas) expect(leads.has(r.lead_id)).toBe(true);
    for (const r of T.vendas) { expect(leads.has(r.lead_id)).toBe(true); expect(brokers.has(r.corretor_id)).toBe(true); }
    const proposals = new Set(T.propostas.map((r) => r.proposta_id));
    for (const r of T.vendas) expect(proposals.has(r.proposta_id)).toBe(true);
    const won = T.leads.filter((r) => r.status === 'ganho').length;
    expect(T.vendas.length + T.contratos_locacao.filter((c) => String(c.data_inicio) >= '2025-12-01').length).toBeGreaterThanOrEqual(won * 0.9);
  });

  it('every sale consumes a real property or a real unit of the espelho', () => {
    const properties = new Map(T.imoveis.map((r) => [r.imovel_id, r]));
    const units = new Map(T.espelho_vendas.map((r) => [r.unidade_emp_id, r]));
    for (const sale of T.vendas) {
      if (sale.departamento === 'prontos') {
        const property = properties.get(String(sale.imovel_id))!;
        expect(property).toBeDefined();
        if (!sale.distrato) expect(property.status).toBe('vendido');
      } else {
        const unit = units.get(String(sale.unidade_emp_id))!;
        expect(unit).toBeDefined();
        if (!sale.distrato) expect(unit.status).toBe('vendida');
      }
    }
  });

  it('rental invoices exist only while the contract is active and snapshots pin to month ends', () => {
    const leases = new Map(T.contratos_locacao.map((r) => [r.contrato_id, r]));
    for (const invoice of T.faturas_locacao) {
      const lease = leases.get(String(invoice.contrato_id))!;
      expect(String(invoice.competencia) >= String(lease.data_inicio).slice(0, 8) + '01').toBe(true);
      if (lease.data_encerramento) expect(String(invoice.competencia) < String(lease.data_encerramento)).toBe(true);
    }
    const snapshots = new Set(T.carteira_locacao_snapshot.map((r) => r.data_base_report));
    expect(snapshots).toEqual(new Set(['2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31']));
    for (const r of T.estoque_snapshot) expect(String(r.data_base_report)).toMatch(/-(28|29|30|31)$/);
  });

  it('has a plausible lead→sale conversion and delinquency', () => {
    const buyers = T.leads.filter((r) => r.interesse !== 'locacao');
    const conversion = T.vendas.length / buyers.length;
    expect(conversion).toBeGreaterThan(0.01);
    expect(conversion).toBeLessThan(0.08);
    const lastMonth = T.faturas_locacao.filter((r) => r.competencia === '2026-03-01');
    const lateShare = lastMonth.filter((r) => Number(r.dias_atraso) > 0).length / lastMonth.length;
    expect(lateShare).toBeGreaterThan(0.01);
    expect(lateShare).toBeLessThan(0.2);
  });

  it('marketing investment lines reconcile with real leads per campaign', () => {
    const leadsPerCampaign = new Map<string, number>();
    for (const lead of T.leads) {
      if (!lead.campanha_id) continue;
      const key = `${String(lead.data_criacao).slice(0, 7)}|${lead.campanha_id}`;
      leadsPerCampaign.set(key, (leadsPerCampaign.get(key) ?? 0) + 1);
    }
    for (const line of T.marketing_investimentos) {
      expect(line.leads_gerados).toBe(leadsPerCampaign.get(`${String(line.competencia).slice(0, 7)}|${line.campanha_id}`) ?? 0);
    }
  });
});

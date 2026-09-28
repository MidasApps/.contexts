/**
 * Imóveis prontos (com ciclo de vida) e empreendimentos com espelho de vendas.
 *
 * O status FINAL de imóvel/unidade é decidido depois, pelo funil (quem compra
 * ou aluga é um lead). Aqui nasce o estoque: captação, atributos e preço.
 *
 * As chaves em snake_case das interfaces são colunas das tabelas `imoveis`,
 * `espelho_vendas` e `empreendimentos`; `visits`, `proposals` e `units` ficam
 * só no código.
 */
import { type Rng, type Row, id, addDays, addMonths, roundTo } from './base';
import { BRANCHES, NEIGHBORHOODS, PROPERTY_TYPES, SOURCING_CHANNELS, UNIT_TYPES, DEVELOPERS, type BranchId } from './universe';
import type { Broker } from './structure';

export interface Property {
  imovel_id: string; codigo: string; tipo: string; finalidade: 'venda' | 'locacao' | 'ambas';
  bairro: string; cidade: string; regiao: string; area_m2: number; quartos: number; vagas: number;
  valor_anuncio: number | null; valor_aluguel_anuncio: number | null; valor_condominio: number; iptu_mensal: number;
  data_captacao: string; captador_id: string; unidade_id: string; origem_captacao: string; exclusividade: boolean;
  status: string; data_saida: string | null; motivo_saida: string | null;
  visits: number; proposals: number;
}

export interface DevelopmentUnit {
  unidade_emp_id: string; empreendimento_id: string; torre: string; andar: number; tipologia: string;
  area_m2: number; valor_tabela: number; status: string; data_reserva: string | null; data_venda: string | null; corretor_id: string | null;
}

export interface Development {
  empreendimento_id: string; nome: string; incorporadora: string; unidade_id: string; cidade: string; regiao: string;
  fase: string; data_lancamento: string; previsao_entrega: string; total_unidades: number; vgv_tabela: number; comissao_pct_padrao: number;
  units: DevelopmentUnit[];
}

const PRICE_PER_M2: Record<BranchId, number> = { centro: 11_500, zona_sul: 14_800, zona_norte: 8_900, abc: 7_800, campinas: 8_600, litoral: 9_200 };

export const generateProperties = (rng: Rng, sourcers: Broker[], start: string, lastSnapshot: string, total: number): Property[] => {
  const out: Property[] = [];
  const earliestSourcing = addMonths(start, -30);
  const days = Math.max(1, Math.round((new Date(lastSnapshot).getTime() - new Date(earliestSourcing).getTime()) / 86_400_000));
  for (let i = 1; i <= total; i++) {
    const branch = rng.weighted(BRANCHES.map((b) => [b, b.weight] as const));
    const type = rng.weighted(PROPERTY_TYPES);
    const purpose = rng.weighted([['venda', 55], ['locacao', 35], ['ambas', 10]] as const);
    const area = roundTo(Math.max(22, rng.normal(type === 'casa' ? 180 : type === 'comercial' ? 90 : type === 'studio' ? 32 : type === 'cobertura' ? 220 : type === 'terreno' ? 400 : 78, type === 'apartamento' ? 28 : 60)), 0);
    const pricePerM2 = PRICE_PER_M2[branch.id] * (type === 'terreno' ? 0.45 : type === 'comercial' ? 0.85 : type === 'cobertura' ? 1.35 : 1) * Math.exp(rng.normal(0, 0.18));
    const price = roundTo(area * pricePerM2 / 1000, 0) * 1000;
    const rent = roundTo(price * (0.0042 + rng.normal(0, 0.0006)) / 50, 0) * 50;
    const sourcer = rng.pick(sourcers.filter((b) => b.unidade_id === branch.id)) ?? rng.pick(sourcers);
    const sourcingDate = addDays(earliestSourcing, Math.floor(rng() ** 0.7 * days));
    out.push({
      imovel_id: id('imv', i, 5), codigo: `${branch.id.toUpperCase().slice(0, 3)}-${String(i).padStart(5, '0')}`, tipo: type, finalidade: purpose,
      bairro: rng.pick(NEIGHBORHOODS[branch.id]), cidade: branch.city, regiao: branch.region, area_m2: area,
      quartos: type === 'comercial' || type === 'terreno' ? 0 : type === 'studio' ? 1 : rng.int(1, 4), vagas: rng.int(0, 3),
      valor_anuncio: purpose === 'locacao' ? null : price, valor_aluguel_anuncio: purpose === 'venda' ? null : rent,
      valor_condominio: type === 'casa' || type === 'terreno' ? 0 : roundTo(area * rng.normal(11, 2), 0), iptu_mensal: roundTo(price * 0.0007, 0),
      data_captacao: sourcingDate, captador_id: sourcer.corretor_id, unidade_id: branch.id, origem_captacao: rng.weighted(SOURCING_CHANNELS),
      exclusividade: rng.chance(0.3), status: 'disponivel', data_saida: null, motivo_saida: null, visits: 0, proposals: 0,
    });
  }
  return out.sort((a, b) => a.data_captacao.localeCompare(b.data_captacao));
};

const DEVELOPMENT_NAMES = ['Reserva Jardins', 'Vista Parque', 'Horizonte Sul', 'Alto do Ipê', 'Praça das Flores', 'Origem Campinas', 'Mar Azul Residence', 'Urban Centro'];

export const generateDevelopments = (rng: Rng, start: string, lastSnapshot: string): Development[] => {
  const plan = [
    { branch: 'centro', phase: 'em_obra', launch: addMonths(start, -8), size: 240 },
    { branch: 'zona_sul', phase: 'lancamento', launch: addMonths(lastSnapshot, -7), size: 180 },
    { branch: 'zona_sul', phase: 'pronto', launch: addMonths(start, -30), size: 120 },
    { branch: 'zona_norte', phase: 'em_obra', launch: addMonths(start, -2), size: 200 },
    { branch: 'abc', phase: 'lancamento', launch: addMonths(lastSnapshot, -4), size: 160 },
    { branch: 'campinas', phase: 'lancamento', launch: addMonths(lastSnapshot, -10), size: 220 },
    { branch: 'litoral', phase: 'pre_lancamento', launch: addMonths(lastSnapshot, 2), size: 140 },
    { branch: 'centro', phase: 'pre_lancamento', launch: addMonths(lastSnapshot, 4), size: 300 },
  ] as const;
  return plan.map((entry, i) => {
    const branch = BRANCHES.find((b) => b.id === entry.branch)!;
    const pricePerM2 = PRICE_PER_M2[branch.id] * 1.15;
    const units: DevelopmentUnit[] = [];
    const towers = entry.size > 200 ? 3 : entry.size > 150 ? 2 : 1;
    const unitsPerTower = Math.ceil(entry.size / towers);
    let unitNumber = 1;
    for (let tower = 0; tower < towers; tower++) {
      for (let j = 0; j < unitsPerTower && unitNumber <= entry.size; j++, unitNumber++) {
        const unitType = rng.weighted(UNIT_TYPES);
        const area = roundTo(unitType === '1 dorm' ? rng.normal(42, 4) : unitType === '2 dorms' ? rng.normal(62, 6) : unitType === '3 dorms' ? rng.normal(88, 8) : rng.normal(130, 12), 0);
        const floor = Math.floor(j / 8) + 1;
        units.push({ unidade_emp_id: `emp${i + 1}-${String(unitNumber).padStart(3, '0')}`, empreendimento_id: id('emp', i + 1, 2), torre: `T${tower + 1}`, andar: floor, tipologia: unitType, area_m2: area, valor_tabela: roundTo(area * pricePerM2 * (1 + floor * 0.006) / 1000, 0) * 1000, status: 'disponivel', data_reserva: null, data_venda: null, corretor_id: null });
      }
    }
    return {
      empreendimento_id: id('emp', i + 1, 2), nome: DEVELOPMENT_NAMES[i], incorporadora: rng.pick(DEVELOPERS), unidade_id: branch.id, cidade: branch.city, regiao: branch.region,
      fase: entry.phase, data_lancamento: entry.launch, previsao_entrega: addMonths(entry.launch, 36), total_unidades: entry.size,
      vgv_tabela: units.reduce((sum, unit) => sum + unit.valor_tabela, 0), comissao_pct_padrao: 0.045, units,
    };
  });
};

export const propertyRow = (property: Property): Row => {
  const { visits: _visits, proposals: _proposals, ...rest } = property;
  return rest;
};
export const developmentUnitRow = (unit: DevelopmentUnit): Row => ({ ...unit });
export const developmentRow = (development: Development): Row => {
  const { units: _units, ...rest } = development;
  return rest;
};

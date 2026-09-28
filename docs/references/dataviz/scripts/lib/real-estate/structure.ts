/**
 * Unidades, departamentos, equipe e metas.
 *
 * A produtividade de cada corretor é um peso em cauda longa (Pareto): poucos
 * vendem muito, a maioria vende pouco. Esse peso guia a distribuição de leads
 * e fechamentos no funil.
 */
import { type Rng, type Row, id, addMonths, addDays, monthlySnapshots } from './base';
import { BRANCHES, DEPARTMENTS, departmentId, FIRST_NAMES, LAST_NAMES, type DepartmentSlug } from './universe';

/** As chaves em snake_case são colunas da tabela `corretores`; `weight` fica só no código. */
export interface Broker {
  corretor_id: string;
  nome: string;
  unidade_id: string;
  departamento_id: string;
  cargo: 'corretor' | 'gerente' | 'coordenador' | 'sdr' | 'captador';
  data_admissao: string;
  data_desligamento: string | null;
  /** Produtividade relativa (1 = média). */
  weight: number;
}

export interface Structure {
  branches: Row[];
  departments: Row[];
  brokers: Broker[];
  targets: Row[];
}

const SELLERS_PER_BRANCH: Record<DepartmentSlug, number> = {
  prontos: 10, lancamentos: 4, locacao: 4, captacao: 2, atendimento: 2,
  adm_locacao: 0, marketing: 0, financeiro: 0,
};

export const generateStructure = (rng: Rng, start: string, lastSnapshot: string, months: number): Structure => {
  const brokers: Broker[] = [];
  const branches: Row[] = [];
  const departments: Row[] = [];
  let seq = 1;

  const hire = (branch: string, slug: DepartmentSlug, role: Broker['cargo']): Broker => {
    const baseHireDate = rng.chance(0.7) ? addMonths(start, -rng.int(1, 60)) : addDays(start, rng.int(0, Math.max(30, months * 30 - 90)));
    const openedAt = BRANCHES.find((b) => b.id === branch)!.openedAt;
    const hireDate = baseHireDate < openedAt ? openedAt : baseHireDate;
    const isDismissed = role === 'corretor' && rng.chance(0.14) && hireDate < addMonths(lastSnapshot, -3);
    const dismissalDate = isDismissed ? addDays(hireDate, rng.int(120, Math.max(150, months * 30))) : null;
    const broker: Broker = {
      corretor_id: id('cor', seq++, 4),
      // Quem não vende leva o cargo no nome: o seletor de corretor do "Meu Painel" lista todos.
      nome: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}${role === 'corretor' ? '' : ` (${role})`}`,
      unidade_id: branch,
      departamento_id: departmentId(branch, slug),
      cargo: role,
      data_admissao: hireDate,
      data_desligamento: dismissalDate && dismissalDate < lastSnapshot ? dismissalDate : null,
      weight: Math.max(0.15, Math.exp(rng.normal(0, 0.6))),
    };
    brokers.push(broker);
    return broker;
  };

  for (const branch of BRANCHES) {
    const manager = hire(branch.id, 'prontos', 'gerente');
    manager.data_desligamento = null;
    branches.push({ unidade_id: branch.id, nome: branch.name, cidade: branch.city, uf: branch.state, regiao: branch.region, gerente_id: manager.corretor_id, data_abertura: branch.openedAt, ativa: true });
    for (const department of DEPARTMENTS) {
      const coordinator = ['prontos', 'lancamentos', 'locacao'].includes(department.slug) ? hire(branch.id, department.slug, 'coordenador') : null;
      if (coordinator) coordinator.data_desligamento = null;
      departments.push({ departamento_id: departmentId(branch.id, department.slug), unidade_id: branch.id, nome: department.name, gestor_id: coordinator?.corretor_id ?? manager.corretor_id });
      const headcount = Math.round(SELLERS_PER_BRANCH[department.slug] * (branch.weight >= 1 ? 1.2 : 1));
      for (let i = 0; i < headcount; i++) hire(branch.id, department.slug, department.slug === 'captacao' ? 'captador' : department.slug === 'atendimento' ? 'sdr' : 'corretor');
    }
  }

  return { branches, departments, brokers, targets: generateTargets(rng, brokers, lastSnapshot, months) };
};

/** Metas mensais: time por unidade/departamento + individual por corretor de vendas. */
const generateTargets = (rng: Rng, brokers: Broker[], lastSnapshot: string, months: number): Row[] => {
  const targets: Row[] = [];
  for (const snapshot of monthlySnapshots(lastSnapshot, months)) {
    const period = `${snapshot.slice(0, 8)}01`;
    for (const branch of BRANCHES) {
      const active = brokers.filter((b) => b.unidade_id === branch.id && b.cargo === 'corretor' && b.data_admissao <= snapshot && (!b.data_desligamento || b.data_desligamento > snapshot));
      const branchVgv = active.reduce((sum, b) => sum + (b.departamento_id.endsWith('prontos') ? 900_000 : b.departamento_id.endsWith('lancamentos') ? 1_400_000 : 0), 0);
      targets.push({ competencia: period, unidade_id: branch.id, departamento_id: null, corretor_id: null, meta_vgv: branchVgv, meta_vendas: Math.round(branchVgv / 520_000), meta_locacoes: Math.round(active.filter((b) => b.departamento_id.endsWith('locacao')).length * 4.5), meta_captacoes: 45, meta_leads: Math.round(900 * branch.weight), meta_receita: Math.round(branchVgv * 0.045 + 95_000) });
      for (const slug of ['prontos', 'lancamentos', 'locacao'] as const) {
        const team = active.filter((b) => b.departamento_id === departmentId(branch.id, slug));
        const vgv = slug === 'locacao' ? 0 : team.length * (slug === 'prontos' ? 900_000 : 1_400_000);
        targets.push({ competencia: period, unidade_id: branch.id, departamento_id: departmentId(branch.id, slug), corretor_id: null, meta_vgv: vgv, meta_vendas: slug === 'locacao' ? 0 : Math.round(vgv / 520_000), meta_locacoes: slug === 'locacao' ? Math.round(team.length * 4.5) : 0, meta_captacoes: 0, meta_leads: Math.round(300 * branch.weight), meta_receita: Math.round(vgv * 0.045) });
        for (const broker of team) {
          targets.push({ competencia: period, unidade_id: branch.id, departamento_id: broker.departamento_id, corretor_id: broker.corretor_id, meta_vgv: slug === 'locacao' ? 0 : slug === 'prontos' ? 900_000 : 1_400_000, meta_vendas: slug === 'locacao' ? 0 : 2, meta_locacoes: slug === 'locacao' ? 5 : 0, meta_captacoes: 0, meta_leads: 60, meta_receita: 0 });
        }
      }
      void rng;
    }
  }
  return targets;
};

export const activeAt = (brokers: Broker[], day: string, filter: (b: Broker) => boolean) =>
  brokers.filter((b) => filter(b) && b.data_admissao <= day && (!b.data_desligamento || b.data_desligamento > day));

/** Sorteia um corretor proporcional ao peso. */
export const pickBroker = (rng: Rng, candidates: Broker[]): Broker | null => {
  if (!candidates.length) return null;
  return rng.weighted(candidates.map((b) => [b, b.weight] as const));
};

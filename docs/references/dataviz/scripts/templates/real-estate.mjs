/**
 * Os 25 templates `imobiliaria-*` em 8 grupos, na ordem de navegação do
 * cliente demo (docs/real-estate-demo-catalog.md §4).
 */
import { templates as executive } from './real-estate/executive.mjs';
import { templates as launches } from './real-estate/launches.mjs';
import { templates as readyUnits } from './real-estate/ready-units.mjs';
import { templates as rental } from './real-estate/rental.mjs';
import { templates as marketing } from './real-estate/marketing.mjs';
import { templates as finance } from './real-estate/finance.mjs';
import { templates as team } from './real-estate/team.mjs';
import { templates as customerService } from './real-estate/customer-service.mjs';

/**
 * Grupos do cliente: id, nome, ordem e templates (viram reports na mesma ordem).
 * `id` é o id do documento em `clients/{id}/groups/{id}` — dado, não muda.
 */
export const groups = [
  { id: 'executivo', name: 'Visão Executiva', templates: executive },
  { id: 'lancamentos', name: 'Lançamentos', templates: launches },
  { id: 'prontos', name: 'Prontos / Revenda', templates: readyUnits },
  { id: 'locacao', name: 'Locação', templates: rental },
  { id: 'marketing', name: 'Marketing', templates: marketing },
  { id: 'financeiro', name: 'Financeiro', templates: finance },
  { id: 'equipe', name: 'Equipe', templates: team },
  { id: 'atendimento', name: 'Atendimento & Clientes', templates: customerService },
].map((group, index) => ({ ...group, order: index + 1 }));

export const templates = groups.flatMap((group) => group.templates);

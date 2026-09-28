import { loadDashboardTemplates } from '@/shared/config/dashboard-templates/templates-loader';
import type { DashboardTemplate } from './types';

export interface SelectArgs {
  personaId: string;
  clientId: string;
}

export function selectTemplate(args: SelectArgs): DashboardTemplate | null {
  const templates = loadDashboardTemplates();
  // Pass 1: exact match (persona + client)
  const exact = templates.find(
    (t) => t.persona === args.personaId && t.client === args.clientId,
  );
  if (exact) return exact;
  // Pass 2: persona-only fallback (any client)
  const personaOnly = templates.find((t) => t.persona === args.personaId);
  if (personaOnly) return personaOnly;
  return null;
}

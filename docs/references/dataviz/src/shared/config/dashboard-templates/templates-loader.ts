import { DashboardTemplateSchema, type DashboardTemplate } from '@/features/business-context/types';

/**
 * Catálogo de templates de dashboard por persona/cliente (business-context).
 *
 * Vazio desde a purga de clientes: os 6 templates que existiam eram todos
 * keyed em OM/BRZ/CONX/IMCASA, que não existem mais. O loader permanece
 * porque `selectTemplate` — e por tabela `retrieveBusinessContext` — depende
 * dele; basta voltar a popular `RAW` quando houver templates do Vila Rosa.
 */
const RAW: unknown[] = [];

export function loadDashboardTemplates(): DashboardTemplate[] {
  return RAW.map((t) => DashboardTemplateSchema.parse(t));
}

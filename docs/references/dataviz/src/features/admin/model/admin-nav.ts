/**
 * Configuração de navegação do Admin — compartilhada entre o AdminPage
 * (conteúdo, dirigido por `?section=`) e a AdminSidebar (menu lateral).
 *
 * As seções refletem a hierarquia de dependência (ADR-0015):
 *   semantic   → vocabulário canônico (Data Contracts), métricas (Metrics
 *                Contracts) e fontes físicas (Data Sources).
 *   infra      → como os dados entram (Ingestion).
 *   commercial → empacotamento (Dashboard Templates, Products).
 *   tenants    → quem consome (Clients, Groups, Users).
 */

export type AdminSectionId =
  | 'data-contracts'
  | 'metrics'
  | 'templates'
  | 'products'
  | 'clients'
  | 'groups'
  | 'users'
  | 'ai-agents'
  | 'ai-skills'
  | 'ai-knowledge-bases'
  | 'ai-workflows'
  | 'ai-tools';

export type AdminGroup = 'semantic' | 'commercial' | 'tenants' | 'ai-studio';

export interface AdminSection {
  id: AdminSectionId;
  label: string;
  group: AdminGroup;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'data-contracts', label: 'Data Contracts',      group: 'semantic' },
  { id: 'metrics',        label: 'Metrics Contracts',   group: 'semantic' },
  { id: 'templates',      label: 'Dashboard Templates', group: 'commercial' },
  { id: 'products',       label: 'Products',            group: 'commercial' },
  { id: 'clients',        label: 'Clients',             group: 'tenants' },
  { id: 'groups',         label: 'Groups',              group: 'tenants' },
  { id: 'users',          label: 'Users',               group: 'tenants' },
  { id: 'ai-agents',          label: 'Agentes',          group: 'ai-studio' },
  { id: 'ai-skills',          label: 'Skills',           group: 'ai-studio' },
  { id: 'ai-knowledge-bases', label: 'Knowledge Bases',  group: 'ai-studio' },
  { id: 'ai-workflows',       label: 'Workflows',        group: 'ai-studio' },
  { id: 'ai-tools',           label: 'Tools',            group: 'ai-studio' },
];

export const DEFAULT_ADMIN_SECTION: AdminSectionId = 'data-contracts';

/** Ordem e rótulos dos grupos no menu lateral. */
export const ADMIN_GROUP_ORDER: AdminGroup[] = ['semantic', 'commercial', 'tenants', 'ai-studio'];

export const ADMIN_GROUP_LABELS: Record<AdminGroup, string> = {
  semantic: 'Dados',
  commercial: 'Comercial',
  tenants: 'Acesso',
  'ai-studio': 'AI Studio',
};

/** Páginas-ferramenta do admin (rotas próprias), agrupadas em "Ferramentas". */
export interface AdminTool {
  label: string;
  href: string;
  /** Nome do ícone lucide-react. */
  icon: 'Database' | 'Activity' | 'BarChart3' | 'Upload';
}

export const ADMIN_TOOLS: AdminTool[] = [
  { label: 'SQL Catalog',            href: '/admin/sql-catalog',            icon: 'Database' },
  { label: 'Agent Quality',          href: '/admin/agent-quality',          icon: 'Activity' },
  { label: 'Orchestrator Analytics', href: '/admin/orchestrator-analytics', icon: 'BarChart3' },
];

export function isAdminSectionId(value: string | null | undefined): value is AdminSectionId {
  return !!value && ADMIN_SECTIONS.some((s) => s.id === value);
}

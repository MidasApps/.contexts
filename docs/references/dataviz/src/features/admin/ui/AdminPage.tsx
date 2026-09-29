'use client';

import { useSearchParams } from 'next/navigation';
import { AppBar } from '@/widgets/app-bar';
import { ClientsTab } from './ClientsTab';
import { GroupsTab } from './GroupsTab';
import { UsersTab } from './UsersTab';
import { ProductsTab } from './ProductsTab';
import { DataContractsTab } from './DataContractsTab';
import { MetricsTab } from './MetricsTab';
import { TemplatesTab } from './TemplatesTab';
import { AiAgentsTab } from '@/features/ai-studio/admin/ui/AiAgentsTab';
import { AiSkillsTab } from '@/features/ai-studio/admin/ui/AiSkillsTab';
import { KnowledgeBasesTab } from '@/features/ai-studio/admin/ui/KnowledgeBasesTab';
import { AiWorkflowsTab } from '@/features/ai-studio/admin/ui/AiWorkflowsTab';
import { ToolsCatalog } from '@/features/ai-studio/admin/ui/ToolsCatalog';
import {
  ADMIN_SECTIONS,
  DEFAULT_ADMIN_SECTION,
  isAdminSectionId,
  type AdminSectionId,
} from '../model/admin-nav';

/**
 * A navegação entre seções vive na AdminSidebar (menu lateral). A seção ativa
 * é dirigida pelo query param `?section=` (deep-linkável). O conteúdo abaixo
 * só renderiza a seção ativa.
 */
export function AdminPage() {
  const searchParams = useSearchParams();
  const param = searchParams?.get('section');
  const section: AdminSectionId = isAdminSectionId(param) ? param : DEFAULT_ADMIN_SECTION;
  const label = ADMIN_SECTIONS.find((s) => s.id === section)?.label ?? 'Admin Panel';

  return (
    <div className="flex flex-col h-full min-h-0">
      <AppBar pageTitle={label} />

      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6">
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-6">
          {section === 'data-contracts' && <DataContractsTab />}
          {section === 'metrics' && <MetricsTab />}
          {section === 'templates' && <TemplatesTab />}
          {section === 'products' && <ProductsTab />}
          {section === 'clients' && <ClientsTab />}
          {section === 'groups' && <GroupsTab />}
          {section === 'users' && <UsersTab />}
          {section === 'ai-agents' && <AiAgentsTab />}
          {section === 'ai-skills' && <AiSkillsTab />}
          {section === 'ai-knowledge-bases' && <KnowledgeBasesTab />}
          {section === 'ai-workflows' && <AiWorkflowsTab />}
          {section === 'ai-tools' && <ToolsCatalog />}
        </div>
      </div>
    </div>
  );
}

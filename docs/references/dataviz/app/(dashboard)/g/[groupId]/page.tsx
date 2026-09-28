'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useReports } from '@/shared/hooks/useReports';
import { useGroups } from '@/shared/hooks/useGroups';
import { useAppStore } from '@/shared/stores/app-store';

/**
 * A rota do RELATÓRIO sem página escolhida (`/g/:groupId`).
 *
 * Tem página? Manda para a primeira. Não tem? É aqui que se para — e este é o
 * destino que faltava: criar um relatório novo trocava o escopo da coluna mas
 * deixava a rota parada na página do relatório ANTERIOR, então a tela ficava
 * dizendo duas coisas ao mesmo tempo ("Relatório Teste" na coluna, os blocos
 * de Covenants no meio). Um relatório recém-criado não tem conteúdo; o vazio
 * é a resposta correta.
 */
export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const router = useRouter();
  const groupId = params?.groupId ?? '';
  const { groups, loading: groupsLoading } = useGroups();
  const { reports, loading: reportsLoading } = useReports(groupId);

  const grupo = groups.find((g) => g.id === groupId) ?? null;

  // A trilha do header: sem página, o nome do relatório é o fim do caminho.
  useEffect(() => {
    if (!grupo) return;
    useAppStore.getState().setPageTrail(grupo.name, '');
    return () => useAppStore.getState().setPageTrail('', '');
  }, [grupo]);

  useEffect(() => {
    if (groupsLoading) return;

    // Relatório que não existe (link velho, exclusão em outra aba): vai para o
    // primeiro que existir em vez de encarar um vazio sem explicação.
    if (!grupo && groups.length > 0) {
      router.replace(`/g/${groups[0]!.id}`);
      return;
    }

    if (!reportsLoading && reports.length > 0) {
      router.replace(`/g/${groupId}/r/${reports[0]!.id}`);
    }
  }, [groupsLoading, reportsLoading, grupo, groups, reports, groupId, router]);

  if (groupsLoading || reportsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/40" />
      </div>
    );
  }

  if (!grupo && groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Nenhum relatório ainda</p>
        <p className="max-w-xs text-[12px] text-muted-foreground">
          Crie o primeiro pelo seletor no topo da coluna da esquerda.
        </p>
      </div>
    );
  }

  // Tem página: o efeito acima já está redirecionando.
  if (reports.length > 0) return <div className="flex flex-1" aria-hidden />;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-foreground">
        {grupo?.name ?? 'Relatório'} ainda não tem páginas
      </p>
      <p className="max-w-sm text-[12px] text-muted-foreground">
        Uma página é onde os blocos vivem — indicadores, gráficos e tabelas. Comece
        de uma página em branco ou importe um template.
      </p>
      {/*
       * O diálogo de nova página mora na coluna (é lá que ele nasce, junto do
       * relatório em que a página vai cair). Este botão pede a mesma ação por
       * evento, em vez de duplicar o diálogo e ficar com dois donos do mesmo
       * fluxo. Mesmo padrão de `toggle-ai-sidebar`.
       */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('new-page-request'))}
        className="mt-1 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Criar primeira página
      </button>
    </div>
  );
}

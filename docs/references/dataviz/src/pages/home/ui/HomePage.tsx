'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGroups } from '@/shared/hooks/useGroups';
import { useReports } from '@/shared/hooks/useReports';
import { useAppStore } from '@/shared/stores/app-store';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';

/**
 * Home do dashboard (`/dashboard`).
 *
 * A rota existia como página de template fixo (`visao-geral`), que saiu junto
 * com a purga de templates. Continua sendo o destino de seis lugares — login,
 * 404, error boundary, saída do admin, exclusão da página ativa e o botão de
 * voltar do chat —, então em vez de sumir virou o ponto que resolve "qual é a
 * primeira página deste cliente" e manda o usuário para lá.
 */
export function HomePage() {
  const router = useRouter();
  const { groups, loading: groupsLoading } = useGroups();
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const activeClientId = useAppStore((s) => s.activeClientId);
  const { isAdmin, canAccessRoute } = useUserPermissions();

  const groupId = groups[0]?.id ?? null;
  const { reports, loading: reportsLoading } = useReports(groupId);
  const loading = groupsLoading || reportsLoading;

  // Sem permissão em `/g` o redirect abaixo vira ping-pong: o ProtectedRoute
  // barra o destino e devolve o usuário para cá, que redireciona de novo. O
  // gate é a permissão do MESMO token que o ProtectedRoute vai checar (`/g`,
  // depois de normalizeRoute), não a URL completa.
  const canOpenReport = isAdmin || (!!activeClientId && canAccessRoute(activeClientId, '/g'));

  // `order` é o que a coluna de páginas usa para ordenar; não confiar na ordem
  // de chegada do array evita mandar o usuário para uma página do meio.
  const first = loading
    ? null
    : [...reports].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0] ?? null;

  useEffect(() => {
    if (!groupId || !first || !canOpenReport) return;
    setActiveReport(groupId, first.id);
    router.replace(`/g/${groupId}/r/${first.id}`);
  }, [groupId, first, canOpenReport, setActiveReport, router]);

  if (!loading && first && !canOpenReport) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Sem acesso aos relatórios</p>
        <p className="max-w-xs text-[12px] text-muted-foreground">
          Seu grupo de permissão não inclui as páginas de relatório. Fale com um
          administrador.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/40" />
      </div>
    );
  }

  if (!first) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Nenhuma página ainda</p>
        <p className="max-w-xs text-[12px] text-muted-foreground">
          Crie a primeira pelo botão + no topo da coluna de páginas.
        </p>
      </div>
    );
  }

  // Redirecionando — o efeito acima já disparou.
  return <div className="flex flex-1" aria-hidden />;
}

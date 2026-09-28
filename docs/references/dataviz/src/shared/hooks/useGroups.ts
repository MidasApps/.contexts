'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import { fetchGroups, createGroup, renameGroup, deleteGroup, type Group } from '@/shared/lib/firestore/groups';

/**
 * Os relatórios do cliente ativo.
 *
 * Mesma regra de `useReports`, pelo mesmo motivo: enquanto os dados carregados
 * não forem os do cliente PEDIDO, o hook diz que está carregando e não entrega
 * lista. Sem isso existe um render com o cliente novo e os relatórios do
 * anterior — e quem escolhe "o primeiro relatório" nesse instante escolhe um
 * relatório de outro cliente.
 */
export function useGroups() {
  const activeClientId = useAppStore((s) => s.activeClientId);
  // Relatório criado FORA desta instância do hook (a IA, pela AISidebar) — sem
  // isto o seletor só o mostraria no próximo carregamento.
  const groupsListVersion = useAppStore((s) => s.groupsListVersion);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  /** Versão da lista que os dados em mão representam. Ver `desatualizado`. */
  const [loadedVersion, setLoadedVersion] = useState(groupsListVersion);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!activeClientId) {
      setGroups([]);
      setLoadedFor(activeClientId || null);
      setLoadedVersion(groupsListVersion);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchGroups(activeClientId);
      setGroups(data);
    } catch (error) {
      console.error('[useGroups] Error:', error);
      setGroups([]);
    } finally {
      setLoadedFor(activeClientId);
      setLoadedVersion(groupsListVersion);
      setLoading(false);
    }
  }, [activeClientId, groupsListVersion]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /*
   * "Os dados em mão não são os pedidos" — por cliente OU por versão.
   *
   * A parte do cliente já existia. A da versão é o mesmo defeito uma dimensão ao
   * lado: quando a IA cria um relatório ela bumpa a versão, e entre o bump e a
   * resposta do fetch existe um render com `activeGroupId` já apontando para o
   * relatório novo e `groups` ainda sem ele. Nesse render o fallback do
   * `PagesSidebar` ("id fora da lista? volta para groups[0]") reescreve o
   * escopo, e a barra lateral volta para o relatório anterior enquanto o
   * conteúdo mostra o novo. Dizer "carregando" nesse instante é o que impede a
   * decisão baseada em lista velha.
   */
  const isStale = loadedFor !== (activeClientId || null)
    || loadedVersion !== groupsListVersion;

  return {
    groups: isStale ? [] : groups,
    loading: loading || isStale,
    refetch,
    create: async (name: string) => {
      const id = await createGroup(activeClientId, name);
      await refetch();
      return id;
    },
    rename: async (groupId: string, name: string) => {
      await renameGroup(activeClientId, groupId, name);
      await refetch();
    },
    remove: async (groupId: string) => {
      await deleteGroup(activeClientId, groupId);
      await refetch();
    },
  };
}

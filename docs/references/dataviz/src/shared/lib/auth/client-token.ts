/**
 * Token de autenticação para chamadas do CLIENTE às rotas de API.
 *
 * Existia copiado dentro de `firestore/{reports,groups,dashboard-templates}.ts`
 * como `getToken()` local, sem lugar único para importar. Foi exatamente por
 * isso que o `usePdfExport` nasceu sem `Authorization`: não havia helper para
 * alcançar, e `/api/export-pdf` responde 401 fora de dev.
 *
 * Ordem importa: o token externo (shell pai via postMessage, modo embutido)
 * vem antes do Firebase — no iframe não existe `currentUser`.
 */
export async function getClientAuthToken(): Promise<string> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const externalToken = getExternalToken();
  if (externalToken) return externalToken;

  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

/** Cabeçalhos JSON + Bearer para POST/PATCH nas rotas de API. */
export async function authJsonHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getClientAuthToken()}`,
    'Content-Type': 'application/json',
  };
}

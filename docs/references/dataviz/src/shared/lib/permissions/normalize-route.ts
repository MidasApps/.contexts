/**
 * Reduz um pathname à "rota base" usada no gating de permissão, de modo que a
 * checagem do CLIENTE (ProtectedRoute, por pathname) case com a do SERVIDOR
 * (execute-metric, por routeForMetric). Reports dinâmicos vivem em
 * `/g/{groupId}/r/{reportId}` mas todas as métricas mapeiam para a string `/g`.
 */
export function normalizeRoute(pathname: string): string {
  if (pathname === '/g' || pathname.startsWith('/g/')) return '/g';
  return pathname;
}
